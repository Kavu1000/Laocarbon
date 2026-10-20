-- LaoCarbon off-chain data. Money, balances, trades and retirements live on-chain; this holds
-- accounts, profiles, KYC status and project applications/documents.

-- ---------------------------------------------------------------- types
create type public.user_role as enum ('buyer', 'forest_owner', 'auditor');
create type public.kyc_status as enum ('not_submitted', 'pending', 'verified', 'rejected');
create type public.project_status as enum ('draft', 'pending_review', 'in_validation', 'changes_requested', 'approved', 'rejected');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 1 and 100),
  org_name    text not null check (char_length(org_name) between 1 and 150),
  role        public.user_role not null default 'buyer',
  phone       text not null default '' check (char_length(phone) <= 40),
  website     text not null default '' check (website = '' or website ~* '^https?://[^\s]+\.[^\s]+$'),
  bio         text not null default '' check (char_length(bio) <= 1000),
  avatar_url  text,
  wallet      text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  kyc_status  public.kyc_status not null default 'not_submitted',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_wallet_key on public.profiles (lower(wallet));

create or replace function public.is_auditor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'auditor');
$$;

-- New auth user -> profile. Only buyer / forest_owner can be self-selected; auditors are promoted by an admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
begin
  insert into public.profiles (id, full_name, org_name, role, phone)
  values (
    new.id,
    coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(nullif(trim(meta ->> 'org_name'), ''), split_part(new.email, '@', 1)),
    case when meta ->> 'role' = 'forest_owner' then 'forest_owner'::public.user_role else 'buyer'::public.user_role end,
    left(coalesce(meta ->> 'phone', ''), 40)
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "auditors read profiles" on public.profiles for select to authenticated using (public.is_auditor());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- role, kyc_status and wallet are never writable by the user directly.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, org_name, phone, website, bio, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------- KYC
create or replace function public.request_kyc() returns public.kyc_status
language plpgsql security definer set search_path = '' as $$
declare s public.kyc_status;
begin
  update public.profiles set kyc_status = 'pending'
   where id = auth.uid() and kyc_status in ('not_submitted', 'rejected')
  returning kyc_status into s;
  if s is null then raise exception 'KYC already pending or verified'; end if;
  return s;
end;
$$;

create or replace function public.set_kyc_status(target uuid, status public.kyc_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_auditor() then raise exception 'Only auditors can review KYC'; end if;
  if status not in ('verified', 'rejected') then raise exception 'Invalid decision'; end if;
  update public.profiles set kyc_status = status where id = target and kyc_status = 'pending';
end;
$$;
revoke execute on function public.request_kyc, public.set_kyc_status from public, anon;
grant execute on function public.request_kyc, public.set_kyc_status to authenticated;

-- ---------------------------------------------------------------- wallet link nonces (service role only)
create table public.wallet_link_nonces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nonce      text not null,
  expires_at timestamptz not null
);
alter table public.wallet_link_nonces enable row level security;

-- ---------------------------------------------------------------- projects
-- projects.id doubles as the on-chain projectId used by LaoCarbonMarketplace.registerProject.
create table public.projects (
  id                bigint generated by default as identity primary key,
  owner_id          uuid references public.profiles (id) on delete set null,
  status            public.project_status not null default 'draft',
  name              text not null default '' check (char_length(name) <= 200),
  company           text not null default '',
  type              text not null default '',
  description       text not null default '' check (char_length(description) <= 1000),
  area_ha           numeric check (area_ha > 0),
  estimated_credits bigint check (estimated_credits > 0),
  credit_period     text not null default '',
  standard          text not null default 'VCS',
  province          text not null default '',
  district          text not null default '',
  village           text not null default '',
  lat               double precision check (lat between -90 and 90),
  lng               double precision check (lng between -180 and 180),
  co_benefits       text[] not null default '{}',
  contact_first     text not null default '',
  contact_last      text not null default '',
  contact_email     text not null default '',
  contact_phone     text not null default '',
  payout_wallet     text check (payout_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  ipfs_cid          text,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index projects_owner on public.projects (owner_id);
create index projects_status on public.projects (status);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
create policy "owner reads own projects" on public.projects for select to authenticated using (owner_id = auth.uid());
create policy "auditors read projects" on public.projects for select to authenticated using (public.is_auditor());
create policy "owner creates projects" on public.projects for insert to authenticated
  with check (owner_id = auth.uid() and status in ('draft', 'pending_review'));
create policy "owner edits drafts" on public.projects for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'changes_requested'))
  with check (owner_id = auth.uid() and status in ('draft', 'pending_review'));
create policy "owner deletes drafts" on public.projects for delete to authenticated
  using (owner_id = auth.uid() and status = 'draft');
create policy "auditors review projects" on public.projects for update to authenticated
  using (public.is_auditor()) with check (public.is_auditor());

-- ---------------------------------------------------------------- project documents (files in Storage)
create table public.project_documents (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references public.projects (id) on delete cascade,
  doc_type     text not null,
  file_name    text not null,
  storage_path text not null unique,
  size_bytes   bigint not null check (size_bytes <= 10485760),
  ipfs_cid     text,
  uploaded_at  timestamptz not null default now(),
  unique (project_id, doc_type)
);
alter table public.project_documents enable row level security;
create policy "owner and auditors read documents" on public.project_documents for select to authenticated using (
  public.is_auditor() or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);
create policy "owner adds documents" on public.project_documents for insert to authenticated with check (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
          and p.status in ('draft', 'pending_review', 'changes_requested'))
  and storage_path like auth.uid()::text || '/%'
);
create policy "owner replaces documents" on public.project_documents for delete to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
          and p.status in ('draft', 'pending_review', 'changes_requested'))
);

-- ---------------------------------------------------------------- review history
create table public.review_notes (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects (id) on delete cascade,
  auditor_id  uuid references public.profiles (id) on delete set null,
  decision    text not null,
  note        text not null check (char_length(note) between 1 and 1000),
  created_at  timestamptz not null default now()
);
alter table public.review_notes enable row level security;
create policy "owner and auditors read notes" on public.review_notes for select to authenticated using (
  public.is_auditor() or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);
create policy "auditors write notes" on public.review_notes for insert to authenticated
  with check (public.is_auditor() and auditor_id = auth.uid());

-- ---------------------------------------------------------------- public marketplace view
-- Only non-personal columns of listed projects. Runs with the view owner's rights so anon can read it
-- without exposing contact details in the base table.
create view public.public_projects with (security_invoker = false) as
  select p.id, p.name, p.company, p.type, p.description, p.area_ha, p.estimated_credits, p.credit_period,
         p.standard, p.province, p.district, p.co_benefits, p.status, p.ipfs_cid,
         coalesce((select array_agg(d.doc_type order by d.doc_type) from public.project_documents d where d.project_id = p.id), '{}') as document_types
    from public.projects p
   where p.status in ('approved', 'in_validation');
grant select on public.public_projects to anon, authenticated;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('project-documents', 'project-documents', false, 10485760,
   array['application/pdf', 'application/json', 'application/geo+json', 'application/vnd.google-earth.kml+xml', 'text/xml', 'application/xml', 'application/octet-stream'])
on conflict (id) do nothing;

-- Files live under "<user id>/..." so ownership is checkable from the path.
create policy "avatar upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar replace own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "docs upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs read own or auditor" on storage.objects for select to authenticated
  using (bucket_id = 'project-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_auditor()));
create policy "docs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = auth.uid()::text);
