alter table menu_items
  add column image_variants jsonb not null default '{}'::jsonb,
  add column image_storage_paths jsonb not null default '[]'::jsonb;

create table storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  paths jsonb not null check (jsonb_typeof(paths) = 'array'),
  reason text not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

create index storage_cleanup_jobs_available_idx
  on storage_cleanup_jobs(available_at) where attempts < 10;
