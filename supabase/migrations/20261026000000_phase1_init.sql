-- Phase 1: stores, submissions, and the private bucket for shelf photos.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  chain text,
  area text,
  channel text,
  created_at timestamptz not null default now()
);

create index if not exists stores_name_idx on public.stores (name);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  photo_type text not null check (photo_type in ('before', 'after')),
  photo_path text not null unique,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  -- Filled once auth is introduced; nullable in phase 1.
  submitted_by uuid null
);

create index if not exists submissions_store_submitted_idx
  on public.submissions (store_id, submitted_at desc);

-- RLS on with no policies: anon/authenticated roles get no access.
-- All reads/writes go through server API routes using the service_role key,
-- which bypasses RLS.
alter table public.stores enable row level security;
alter table public.submissions enable row level security;

-- Private bucket. Size and MIME limits are enforced by Storage itself,
-- so a direct upload through a signed URL cannot exceed them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shelf-photos',
  'shelf-photos',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
