-- Bereits auf dem Supabase-Projekt "autosuche" angewendet (Referenz / Neuaufbau).
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'processing' check (status in ('processing','done','error')),
  error text,
  source text,
  url text,
  pdf_path text,
  image_url text,
  title text,
  make text,
  model text,
  price_eur integer,
  mileage_km integer,
  first_registration text,
  power_ps integer,
  fuel text,
  transmission text,
  zip text,
  city text,
  lat double precision,
  lng double precision,
  vehicle jsonb,
  evaluation jsonb,
  raw jsonb,
  notes text,
  favorite boolean not null default false
);

create index cars_user_idx on public.cars(user_id, created_at desc);

alter table public.cars enable row level security;

create policy "own cars select" on public.cars for select to authenticated using (user_id = (select auth.uid()));
create policy "own cars insert" on public.cars for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own cars update" on public.cars for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own cars delete" on public.cars for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger cars_touch before update on public.cars
for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.cars;

insert into storage.buckets (id, name, public, file_size_limit)
values ('listings', 'listings', false, 52428800),
       ('car-images', 'car-images', true, 10485760)
on conflict (id) do nothing;

create policy "own listings read" on storage.objects for select to authenticated
  using (bucket_id = 'listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own listings write" on storage.objects for insert to authenticated
  with check (bucket_id = 'listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own listings delete" on storage.objects for delete to authenticated
  using (bucket_id = 'listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'car-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'car-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Anhängerkupplung (Status aus der KI-Bewertung)
alter table public.cars add column tow_hitch text;

-- Persönliche Eignung + Nutzungsprofil
alter table public.cars add column fit_score integer;

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile_text text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile insert" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();
