-- Forest coverage maps and public verification history.

-- ---------------------------------------------------------------- project boundary (GeoJSON Polygon / MultiPolygon, WGS84)
alter table public.projects add column boundary jsonb
  check (boundary is null or (boundary ->> 'type') in ('Polygon', 'MultiPolygon'));

-- Location and boundary are public for listed projects: buyers must be able to see the forest they fund.
create or replace view public.public_projects with (security_invoker = false) as
  select p.id, p.name, p.company, p.type, p.description, p.area_ha, p.estimated_credits, p.credit_period,
         p.standard, p.province, p.district, p.co_benefits, p.status, p.ipfs_cid,
         coalesce((select array_agg(d.doc_type order by d.doc_type) from public.project_documents d where d.project_id = p.id), '{}') as document_types,
         p.lat, p.lng, p.boundary
    from public.projects p
   where p.status in ('approved', 'in_validation');

-- ---------------------------------------------------------------- verification events
create type public.verification_method as enum ('document_review', 'satellite_analysis', 'field_visit');
create type public.verification_result as enum ('passed', 'flagged', 'failed');

-- Public audit trail: unlike review_notes (private feedback to the applicant), everything here is shown to buyers.
create table public.verification_events (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references public.projects (id) on delete cascade,
  auditor_id   uuid references public.profiles (id) on delete set null,
  method       public.verification_method not null,
  result       public.verification_result not null,
  summary      text not null check (char_length(summary) between 1 and 500),
  imagery_date date,
  evidence_url text check (evidence_url is null or evidence_url ~* '^https?://'),
  created_at   timestamptz not null default now()
);
create index verification_events_project on public.verification_events (project_id, created_at desc);

alter table public.verification_events enable row level security;
create policy "auditors read verification" on public.verification_events for select to authenticated using (public.is_auditor());
create policy "owner reads verification" on public.verification_events for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);
create policy "auditors record verification" on public.verification_events for insert to authenticated
  with check (public.is_auditor() and auditor_id = auth.uid());

-- Public read for listed projects, with the auditor's name but nothing else from their profile.
create view public.public_verification_events with (security_invoker = false) as
  select v.id, v.project_id, v.method, v.result, v.summary, v.imagery_date, v.evidence_url, v.created_at,
         coalesce(a.full_name, 'LaoCarbon Registry') as auditor_name,
         coalesce(a.org_name, 'LaoCarbon Registry') as auditor_org
    from public.verification_events v
    join public.projects p on p.id = v.project_id and p.status in ('approved', 'in_validation')
    left join public.profiles a on a.id = v.auditor_id;
grant select on public.public_verification_events to anon, authenticated;
