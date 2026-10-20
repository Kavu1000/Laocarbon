-- Read-optimised copy of on-chain state, written only by the indexer (service role).
-- The chain stays the source of truth; these rows are public facts, so everyone may read them.
-- uint256 values are stored as numeric(78,0) to avoid precision loss.

create table public.chain_projects (
  chain_id     integer not null,
  project_id   bigint  not null,
  forest_owner text    not null,
  auditor      text    not null,
  ipfs_hash    text    not null,
  block_number bigint  not null,
  tx_hash      text    not null,
  primary key (chain_id, project_id)
);

create table public.chain_listings (
  chain_id      integer not null,
  listing_id    bigint  not null,
  project_id    bigint  not null,
  seller        text    not null,
  price_per_ton numeric(78, 0) not null,
  available     numeric(78, 0) not null,
  updated_block bigint  not null,
  primary key (chain_id, listing_id)
);
create index chain_listings_active on public.chain_listings (chain_id) where available > 0;
create index chain_listings_seller on public.chain_listings (chain_id, seller);

create table public.chain_offsets (
  chain_id       integer not null,
  certificate_id bigint  not null,
  buyer          text    not null, -- lower-case
  project_id     bigint  not null,
  listing_id     bigint  not null,
  tons           numeric(78, 0) not null,
  total_paid     numeric(78, 0) not null,
  ipfs_hash      text    not null,
  retired_at     timestamptz not null,
  block_number   bigint  not null,
  tx_hash        text    not null,
  primary key (chain_id, certificate_id)
);
create index chain_offsets_buyer on public.chain_offsets (chain_id, buyer, certificate_id desc);

create table public.indexer_state (
  chain_id   integer primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

create view public.chain_offset_totals as
  select chain_id, count(*)::bigint as certificates, coalesce(sum(tons), 0) as tons, coalesce(sum(total_paid), 0) as total_paid
    from public.chain_offsets group by chain_id;

alter table public.chain_projects enable row level security;
alter table public.chain_listings enable row level security;
alter table public.chain_offsets  enable row level security;
alter table public.indexer_state  enable row level security;
create policy "public read" on public.chain_projects for select to anon, authenticated using (true);
create policy "public read" on public.chain_listings for select to anon, authenticated using (true);
create policy "public read" on public.chain_offsets  for select to anon, authenticated using (true);
create policy "public read" on public.indexer_state  for select to anon, authenticated using (true);
grant select on public.chain_offset_totals to anon, authenticated;
