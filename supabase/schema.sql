-- ============================================================================
-- BeatOrbit Supabase Cloud Schema, RLS Policies, Storage Bucket & Atomic RPCs
-- Project URL: https://jlnleuatrhcskewkwofn.supabase.co
-- Run this script in Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. TABLES (Isolated per user via composite primary keys & auth.uid())
-- ----------------------------------------------------------------------------

create table if not exists public.songs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  artist text not null default 'Unknown artist',
  duration_ms double precision not null,
  file_name text not null,
  format text not null,
  file_size bigint not null,
  imported_at timestamptz not null default now(),
  source text not null check (source in ('demo', 'imported')),
  bpm double precision,
  palette integer not null default 0,
  storage_path text,
  primary key (user_id, id)
);

create index if not exists idx_songs_user_imported on public.songs (user_id, imported_at desc);

create table if not exists public.charts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chart_id text not null,
  song_id text not null,
  schema_version integer not null default 2,
  name text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard', 'expert')),
  ruleset_id text not null default 'beatorbit-standard-v1',
  revision integer not null default 1,
  timing jsonb not null,
  audio_ref jsonb not null,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, chart_id)
);

create index if not exists idx_charts_user_song on public.charts (user_id, song_id);

create table if not exists public.drafts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chart_id text not null,
  song_id text not null,
  chart jsonb not null,
  base_revision integer not null default 0,
  saved_at timestamptz not null default now(),
  primary key (user_id, chart_id)
);

create index if not exists idx_drafts_user_song on public.drafts (user_id, song_id);

create table if not exists public.results (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  chart_id text not null,
  revision integer not null,
  title text not null,
  score integer not null,
  accuracy double precision not null,
  max_combo integer not null,
  perfect integer not null,
  great integer not null,
  good integer not null,
  miss integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_results_user_chart on public.results (user_id, chart_id);
create index if not exists idx_results_user_created on public.results (user_id, created_at desc);

create table if not exists public.user_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 2. CASCADING CLEANUP TRIGGERS (Supports unsaved chart drafts & full cascade)
-- ----------------------------------------------------------------------------

create or replace function public.handle_chart_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.drafts where user_id = old.user_id and chart_id = old.chart_id;
  delete from public.results where user_id = old.user_id and chart_id = old.chart_id;
  return old;
end;
$$;

drop trigger if exists trg_chart_deleted on public.charts;
create trigger trg_chart_deleted
after delete on public.charts
for each row execute function public.handle_chart_deleted();

create or replace function public.handle_song_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.drafts where user_id = old.user_id and song_id = old.id;
  delete from public.charts where user_id = old.user_id and song_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_song_deleted on public.songs;
create trigger trg_song_deleted
after delete on public.songs
for each row execute function public.handle_song_deleted();

-- 3. ATOMIC TRANSACTIONAL RPC FUNCTIONS (Optimistic Locking / Zero Conflict)
-- ----------------------------------------------------------------------------

create or replace function public.save_chart_atomic(
  p_chart jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_chart_id text := p_chart->>'chartId';
  v_current_revision integer;
  v_new_revision integer := p_expected_revision + 1;
  v_now timestamptz := now();
  v_updated_chart jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select revision into v_current_revision
  from public.charts
  where user_id = v_user_id and chart_id = v_chart_id
  for update;

  if coalesce(v_current_revision, 0) <> p_expected_revision then
    raise exception 'CONFLICT_REVISION: expected %, found %', p_expected_revision, coalesce(v_current_revision, 0)
      using errcode = '40001';
  end if;

  insert into public.charts (
    user_id, chart_id, song_id, schema_version, name, difficulty,
    ruleset_id, revision, timing, audio_ref, notes, updated_at
  )
  values (
    v_user_id,
    v_chart_id,
    p_chart->>'songId',
    coalesce((p_chart->>'schemaVersion')::integer, 2),
    p_chart->>'name',
    p_chart->>'difficulty',
    coalesce(p_chart->>'rulesetId', 'beatorbit-standard-v1'),
    v_new_revision,
    p_chart->'timing',
    p_chart->'audioRef',
    coalesce(p_chart->'notes', '[]'::jsonb),
    v_now
  )
  on conflict (user_id, chart_id) do update set
    song_id = excluded.song_id,
    schema_version = excluded.schema_version,
    name = excluded.name,
    difficulty = excluded.difficulty,
    ruleset_id = excluded.ruleset_id,
    revision = excluded.revision,
    timing = excluded.timing,
    audio_ref = excluded.audio_ref,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

  delete from public.drafts
  where user_id = v_user_id and chart_id = v_chart_id;

  v_updated_chart := jsonb_set(
    jsonb_set(p_chart, '{revision}', to_jsonb(v_new_revision)),
    '{updatedAt}',
    to_jsonb(to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  return v_updated_chart;
end;
$$;

create or replace function public.save_draft_atomic(
  p_chart_id text,
  p_song_id text,
  p_chart jsonb,
  p_base_revision integer,
  p_saved_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select revision into v_current_revision
  from public.charts
  where user_id = v_user_id and chart_id = p_chart_id;

  if coalesce(v_current_revision, 0) <> p_base_revision then
    raise exception 'CONFLICT_REVISION: expected %, found %', p_base_revision, coalesce(v_current_revision, 0)
      using errcode = '40001';
  end if;

  insert into public.drafts (user_id, chart_id, song_id, chart, base_revision, saved_at)
  values (v_user_id, p_chart_id, p_song_id, p_chart, p_base_revision, p_saved_at)
  on conflict (user_id, chart_id) do update set
    song_id = excluded.song_id,
    chart = excluded.chart,
    base_revision = excluded.base_revision,
    saved_at = excluded.saved_at;
end;
$$;

-- 4. ROW LEVEL SECURITY (Strict Per-Account Isolation)
-- ----------------------------------------------------------------------------

alter table public.songs enable row level security;
alter table public.charts enable row level security;
alter table public.drafts enable row level security;
alter table public.results enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "songs_owner_all" on public.songs;
create policy "songs_owner_all" on public.songs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "charts_owner_all" on public.charts;
create policy "charts_owner_all" on public.charts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "drafts_owner_all" on public.drafts;
create policy "drafts_owner_all" on public.drafts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "results_owner_all" on public.results;
create policy "results_owner_all" on public.results
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_owner_all" on public.user_settings;
create policy "user_settings_owner_all" on public.user_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. SUPABASE STORAGE BUCKET & RLS POLICIES (user-audio)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-audio',
  'user-audio',
  false,
  67108864,
  array['audio/*', 'video/webm', 'video/mp4', 'video/ogg', 'video/quicktime', 'video/x-matroska', 'video/3gpp', 'application/ogg', 'application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 67108864,
  allowed_mime_types = array['audio/*', 'video/webm', 'video/mp4', 'video/ogg', 'video/quicktime', 'video/x-matroska', 'video/3gpp', 'application/ogg', 'application/octet-stream'];

drop policy if exists "user_audio_select" on storage.objects;
create policy "user_audio_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_insert" on storage.objects;
create policy "user_audio_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_update" on storage.objects;
create policy "user_audio_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "user_audio_delete" on storage.objects;
create policy "user_audio_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-audio' and (storage.foldername(name))[1] = auth.uid()::text);
