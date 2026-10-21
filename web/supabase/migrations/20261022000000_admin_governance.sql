-- Admin role, account suspension and a public governance log of every privileged action.

alter type public.user_role add value if not exists 'admin';

alter table public.profiles add column if not exists suspended boolean not null default false;

-- Admins can do everything auditors can. Roles are compared as text because a new enum value
-- can't be referenced as a literal in the same transaction that adds it.
create or replace function public.is_auditor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text in ('auditor', 'admin') and not suspended);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text = 'admin' and not suspended);
$$;

-- ---------------------------------------------------------------- governance log (public, append-only)
create table public.governance_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text not null,
  actor_role   text not null,
  action       text not null,   -- e.g. project.approved, kyc.verified, user.role_changed, verification.satellite_analysis
  target_type  text not null,   -- project | user | verification
  target_id    text not null,
  target_label text not null default '',
  details      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index governance_log_created on public.governance_log (created_at desc);
alter table public.governance_log enable row level security;
create policy "public read" on public.governance_log for select to anon, authenticated using (true);
-- No insert/update/delete policies: rows come only from the triggers below and from admin API routes (service role).

create or replace function public.log_governance(p_action text, p_target_type text, p_target_id text, p_label text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.profiles;
begin
  select * into a from public.profiles where id = auth.uid();
  if a.id is null then return; end if; -- service-role writes are logged by the API route that made them
  insert into public.governance_log (actor_id, actor_name, actor_role, action, target_type, target_id, target_label, details)
  values (a.id, a.full_name || ' · ' || a.org_name, a.role::text, p_action, p_target_type, p_target_id, p_label, p_details);
end;
$$;
revoke execute on function public.log_governance from public, anon, authenticated;

-- Auditor review decisions on projects (owner edits/resubmissions are not governance actions).
create or replace function public.trg_log_project_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status::text not in ('draft', 'pending_review') then
    perform public.log_governance('project.' || new.status::text, 'project', new.id::text, new.name,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
create trigger projects_status_governance after update of status on public.projects
  for each row execute function public.trg_log_project_status();

-- KYC decisions. Rejections don't name the organisation publicly.
create or replace function public.trg_log_kyc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kyc_status is distinct from old.kyc_status and new.kyc_status::text in ('verified', 'rejected') then
    perform public.log_governance('kyc.' || new.kyc_status::text, 'user', new.id::text,
      case when new.kyc_status::text = 'verified' then new.org_name else 'An organisation' end, '{}');
  end if;
  return new;
end;
$$;
create trigger profiles_kyc_governance after update of kyc_status on public.profiles
  for each row execute function public.trg_log_kyc();

-- Published verification records.
create or replace function public.trg_log_verification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  perform public.log_governance('verification.' || new.method::text, 'project', new.project_id::text, coalesce(pname, ''),
    jsonb_build_object('result', new.result, 'summary', new.summary));
  return new;
end;
$$;
create trigger verification_events_governance after insert on public.verification_events
  for each row execute function public.trg_log_verification();
