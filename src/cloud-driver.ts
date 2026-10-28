import type { SupabaseClient } from '@supabase/supabase-js';
import { clone, parseChart, type Chart, type Draft, type Result, type Song } from './domain';
import { AUDIO_BUCKET, getSupabaseClient } from './supabase';

export class SchemaNotInitializedError extends Error {
  constructor(detail?: string) {
    super(
      'Supabase database schema is not initialized yet. Please run supabase/schema.sql in your Supabase Dashboard SQL Editor.' +
        (detail ? ` (${detail})` : '')
    );
    this.name = 'SchemaNotInitializedError';
  }
}

export interface CloudDriver {
  fetchWorkspace(userId: string): Promise<{
    songs: Song[];
    charts: Chart[];
    drafts: Draft[];
    results: Result[];
    demoSeeded?: number;
  }>;
  getSetting(userId: string, key: string): Promise<unknown>;
  setSetting(userId: string, key: string, value: unknown): Promise<void>;
  seed(userId: string, songs: Song[], charts: Chart[]): Promise<void>;
  addSong(userId: string, song: Song, audioData: ArrayBuffer, mimeType: string): Promise<void>;
  updateSong(userId: string, song: Song): Promise<void>;
  relinkSong(userId: string, song: Song, audioData: ArrayBuffer, mimeType: string): Promise<void>;
  downloadAudio(userId: string, songId: string): Promise<Blob | undefined>;
  saveChart(
    userId: string,
    chart: Chart,
    expectedRevision: number,
    onConflict: () => Error
  ): Promise<Chart>;
  saveDraft(userId: string, draft: Draft, onConflict: () => Error): Promise<void>;
  deleteDraft(userId: string, chartId: string): Promise<void>;
  deleteChart(userId: string, chartId: string): Promise<void>;
  deleteSong(userId: string, songId: string): Promise<void>;
  addResult(userId: string, result: Result): Promise<void>;
}

type SongRow = {
  user_id: string;
  id: string;
  title: string;
  artist: string;
  duration_ms: number;
  file_name: string;
  format: string;
  file_size: number;
  imported_at: string;
  source: 'demo' | 'imported';
  bpm: number | null;
  palette: number;
  storage_path: string | null;
};

type ChartRow = {
  user_id: string;
  chart_id: string;
  song_id: string;
  schema_version: 1 | 2;
  name: string;
  difficulty: Chart['difficulty'];
  ruleset_id: 'beatorbit-standard-v1';
  revision: number;
  timing: Chart['timing'];
  audio_ref: Chart['audioRef'];
  notes: Chart['notes'];
  updated_at: string;
};

type DraftRow = {
  user_id: string;
  chart_id: string;
  song_id: string;
  chart: Chart;
  base_revision: number;
  saved_at: string;
};

type ResultRow = {
  user_id: string;
  id: string;
  chart_id: string;
  revision: number;
  title: string;
  score: number;
  accuracy: number;
  max_combo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  created_at: string;
};

function normalizeIso(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
}

function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    durationMs: Number(row.duration_ms),
    fileName: row.file_name,
    format: row.format,
    fileSize: Number(row.file_size),
    importedAt: normalizeIso(row.imported_at),
    source: row.source,
    ...(row.bpm !== null && row.bpm !== undefined ? { bpm: Number(row.bpm) } : {}),
    palette: Number(row.palette)
  };
}

function songToRow(userId: string, song: Song): SongRow {
  return {
    user_id: userId,
    id: song.id,
    title: song.title,
    artist: song.artist,
    duration_ms: song.durationMs,
    file_name: song.fileName,
    format: song.format,
    file_size: Math.round(song.fileSize),
    imported_at: song.importedAt,
    source: song.source,
    bpm: song.bpm ?? null,
    palette: song.palette,
    storage_path: song.source === 'imported' ? `${userId}/${song.id}` : null
  };
}

function rowToChart(row: ChartRow): Chart {
  return parseChart({
    schemaVersion: (row.schema_version as 1 | 2) || 2,
    chartId: row.chart_id,
    songId: row.song_id,
    name: row.name,
    difficulty: row.difficulty,
    rulesetId: row.ruleset_id || 'beatorbit-standard-v1',
    revision: Number(row.revision),
    timing: row.timing,
    audioRef: row.audio_ref,
    notes: row.notes,
    updatedAt: normalizeIso(row.updated_at)
  });
}

function chartToRow(userId: string, chart: Chart): ChartRow {
  const valid = parseChart(chart);
  return {
    user_id: userId,
    chart_id: valid.chartId,
    song_id: valid.songId,
    schema_version: valid.schemaVersion,
    name: valid.name,
    difficulty: valid.difficulty,
    ruleset_id: valid.rulesetId,
    revision: valid.revision,
    timing: valid.timing,
    audio_ref: valid.audioRef,
    notes: valid.notes,
    updated_at: valid.updatedAt
  };
}

function rowToDraft(row: DraftRow): Draft {
  return {
    chartId: row.chart_id,
    chart: parseChart(row.chart),
    baseRevision: Number(row.base_revision),
    savedAt: normalizeIso(row.saved_at)
  };
}

function rowToResult(row: ResultRow): Result {
  return {
    id: row.id,
    chartId: row.chart_id,
    revision: Number(row.revision),
    title: row.title,
    score: Number(row.score),
    accuracy: Number(row.accuracy),
    maxCombo: Number(row.max_combo),
    perfect: Number(row.perfect),
    great: Number(row.great),
    good: Number(row.good),
    miss: Number(row.miss),
    createdAt: normalizeIso(row.created_at)
  };
}

function isMissingSchemaError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('could not find the table') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

function isMissingRpcError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || msg.includes('could not find the function');
}

function isConflictError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === '40001' ||
    String(err.message || '').includes('CONFLICT_REVISION')
  );
}

function checkError(err: { code?: string; message?: string } | null | undefined, context: string) {
  if (!err) return;
  if (isMissingSchemaError(err)) {
    throw new SchemaNotInitializedError(err.message);
  }
  throw new Error(`${context}: ${err.message || 'Cloud database operation failed.'}`);
}

export class SupabaseCloudDriver implements CloudDriver {
  constructor(private getClient: () => SupabaseClient = getSupabaseClient) {}

  private get client(): SupabaseClient {
    return this.getClient();
  }

  async fetchWorkspace(userId: string) {
    const [songsRes, chartsRes, draftsRes, resultsRes, settingRes] = await Promise.all([
      this.client.from('songs').select('*').eq('user_id', userId),
      this.client.from('charts').select('*').eq('user_id', userId),
      this.client.from('drafts').select('*').eq('user_id', userId),
      this.client.from('results').select('*').eq('user_id', userId),
      this.client
        .from('user_settings')
        .select('value')
        .eq('user_id', userId)
        .eq('key', 'demo-seeded')
        .maybeSingle()
    ]);

    checkError(songsRes.error, 'Loading songs');
    checkError(chartsRes.error, 'Loading charts');
    checkError(draftsRes.error, 'Loading drafts');
    checkError(resultsRes.error, 'Loading results');
    checkError(settingRes.error, 'Loading settings');

    const songs = ((songsRes.data || []) as SongRow[]).map(rowToSong);
    const charts = ((chartsRes.data || []) as ChartRow[]).map(rowToChart);
    const drafts = ((draftsRes.data || []) as DraftRow[]).map(rowToDraft);
    const results = ((resultsRes.data || []) as ResultRow[]).map(rowToResult);
    const demoSeeded =
      typeof settingRes.data?.value === 'number' ? settingRes.data.value : undefined;

    return { songs, charts, drafts, results, demoSeeded };
  }

  async getSetting(userId: string, key: string): Promise<unknown> {
    const { data, error } = await this.client
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    checkError(error, 'Reading setting');
    return data ? data.value : undefined;
  }

  async setSetting(userId: string, key: string, value: unknown): Promise<void> {
    const { error } = await this.client.from('user_settings').upsert(
      {
        user_id: userId,
        key,
        value,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,key' }
    );
    checkError(error, 'Saving setting');
  }

  async seed(userId: string, songs: Song[], charts: Chart[]): Promise<void> {
    const currentSeed = await this.getSetting(userId, 'demo-seeded');
    if (currentSeed === 2) return;

    const existingSongsRes = await this.client
      .from('songs')
      .select('id')
      .eq('user_id', userId);
    checkError(existingSongsRes.error, 'Checking existing songs');
    const existingSongIds = new Set((existingSongsRes.data || []).map((r: { id: string }) => r.id));

    const existingChartsRes = await this.client
      .from('charts')
      .select('chart_id')
      .eq('user_id', userId);
    checkError(existingChartsRes.error, 'Checking existing charts');
    const existingChartIds = new Set(
      (existingChartsRes.data || []).map((r: { chart_id: string }) => r.chart_id)
    );

    const missingSongs = songs
      .filter(s => !existingSongIds.has(s.id))
      .map(s => songToRow(userId, s));

    const missingCharts = charts
      .filter(c => !existingChartIds.has(c.chartId))
      .map(c => chartToRow(userId, parseChart(c)));

    if (missingSongs.length > 0) {
      const { error } = await this.client
        .from('songs')
        .upsert(missingSongs, { onConflict: 'user_id,id', ignoreDuplicates: true });
      checkError(error, 'Seeding demo songs');
    }

    if (missingCharts.length > 0) {
      const { error } = await this.client
        .from('charts')
        .upsert(missingCharts, { onConflict: 'user_id,chart_id', ignoreDuplicates: true });
      checkError(error, 'Seeding demo charts');
    }

    await this.setSetting(userId, 'demo-seeded', 2);
  }

  async addSong(
    userId: string,
    song: Song,
    audioData: ArrayBuffer,
    mimeType: string
  ): Promise<void> {
    const path = `${userId}/${song.id}`;
    if (song.source === 'imported') {
      const blob = new Blob([audioData], { type: mimeType || 'audio/mpeg' });
      const uploadRes = await this.client.storage.from(AUDIO_BUCKET).upload(path, blob, {
        contentType: mimeType || 'audio/mpeg',
        upsert: true
      });
      if (uploadRes.error) {
        throw new Error(`Audio upload failed: ${uploadRes.error.message}`);
      }
    }

    const { error } = await this.client.from('songs').insert(songToRow(userId, song));
    if (error) {
      if (song.source === 'imported') {
        await this.client.storage.from(AUDIO_BUCKET).remove([path]).catch(() => {});
      }
      checkError(error, 'Saving song metadata');
    }
  }

  async updateSong(userId: string, song: Song): Promise<void> {
    const { error } = await this.client
      .from('songs')
      .upsert(songToRow(userId, song), { onConflict: 'user_id,id' });
    checkError(error, 'Updating song');
  }

  async relinkSong(
    userId: string,
    song: Song,
    audioData: ArrayBuffer,
    mimeType: string
  ): Promise<void> {
    const path = `${userId}/${song.id}`;
    const blob = new Blob([audioData], { type: mimeType || 'audio/mpeg' });
    const uploadRes = await this.client.storage.from(AUDIO_BUCKET).upload(path, blob, {
      contentType: mimeType || 'audio/mpeg',
      upsert: true
    });
    if (uploadRes.error) {
      throw new Error(`Audio relink upload failed: ${uploadRes.error.message}`);
    }

    const { error } = await this.client
      .from('songs')
      .upsert(songToRow(userId, { ...song, source: 'imported' }), { onConflict: 'user_id,id' });
    checkError(error, 'Updating relinked song');
  }

  async downloadAudio(userId: string, songId: string): Promise<Blob | undefined> {
    const path = `${userId}/${songId}`;
    const { data, error } = await this.client.storage.from(AUDIO_BUCKET).download(path);
    if (error || !data) return undefined;
    return data;
  }

  async saveChart(
    userId: string,
    chart: Chart,
    expectedRevision: number,
    onConflict: () => Error
  ): Promise<Chart> {
    const clean = parseChart(clone(chart));
    const rpcRes = await this.client.rpc('save_chart_atomic', {
      p_chart: clean,
      p_expected_revision: expectedRevision
    });

    if (!rpcRes.error && rpcRes.data) {
      return parseChart(rpcRes.data);
    }

    if (isConflictError(rpcRes.error)) {
      throw onConflict();
    }

    if (!isMissingRpcError(rpcRes.error)) {
      checkError(rpcRes.error, 'Saving chart');
    }

    // Fallback when RPC function is not installed yet
    const existing = await this.client
      .from('charts')
      .select('revision')
      .eq('user_id', userId)
      .eq('chart_id', clean.chartId)
      .maybeSingle();
    checkError(existing.error, 'Checking chart revision');

    const currentRevision = existing.data ? Number(existing.data.revision) : 0;
    if (currentRevision !== expectedRevision) {
      throw onConflict();
    }

    clean.revision = expectedRevision + 1;
    clean.updatedAt = new Date().toISOString();

    const upsertRes = await this.client
      .from('charts')
      .upsert(chartToRow(userId, clean), { onConflict: 'user_id,chart_id' });
    checkError(upsertRes.error, 'Saving chart');

    await this.deleteDraft(userId, clean.chartId);
    return clean;
  }

  async saveDraft(userId: string, draft: Draft, onConflict: () => Error): Promise<void> {
    const validChart = parseChart(clone(draft.chart));
    const rpcRes = await this.client.rpc('save_draft_atomic', {
      p_chart_id: draft.chartId,
      p_song_id: validChart.songId,
      p_chart: validChart,
      p_base_revision: draft.baseRevision,
      p_saved_at: draft.savedAt
    });

    if (!rpcRes.error) return;

    if (isConflictError(rpcRes.error)) {
      throw onConflict();
    }

    if (!isMissingRpcError(rpcRes.error)) {
      checkError(rpcRes.error, 'Saving draft');
    }

    // Fallback when RPC function is not installed yet
    const existing = await this.client
      .from('charts')
      .select('revision')
      .eq('user_id', userId)
      .eq('chart_id', draft.chartId)
      .maybeSingle();
    checkError(existing.error, 'Checking base revision for draft');

    const currentRevision = existing.data ? Number(existing.data.revision) : 0;
    if (currentRevision !== draft.baseRevision) {
      throw onConflict();
    }

    const { error } = await this.client.from('drafts').upsert(
      {
        user_id: userId,
        chart_id: draft.chartId,
        song_id: validChart.songId,
        chart: validChart,
        base_revision: draft.baseRevision,
        saved_at: draft.savedAt
      },
      { onConflict: 'user_id,chart_id' }
    );
    checkError(error, 'Saving draft');
  }

  async deleteDraft(userId: string, chartId: string): Promise<void> {
    const { error } = await this.client
      .from('drafts')
      .delete()
      .eq('user_id', userId)
      .eq('chart_id', chartId);
    checkError(error, 'Deleting draft');
  }

  async deleteChart(userId: string, chartId: string): Promise<void> {
    await Promise.all([
      this.client.from('drafts').delete().eq('user_id', userId).eq('chart_id', chartId),
      this.client.from('results').delete().eq('user_id', userId).eq('chart_id', chartId)
    ]);
    const { error } = await this.client
      .from('charts')
      .delete()
      .eq('user_id', userId)
      .eq('chart_id', chartId);
    checkError(error, 'Deleting chart');
  }

  async deleteSong(userId: string, songId: string): Promise<void> {
    const chartsRes = await this.client
      .from('charts')
      .select('chart_id')
      .eq('user_id', userId)
      .eq('song_id', songId);
    checkError(chartsRes.error, 'Finding song charts');
    const chartIds = (chartsRes.data || []).map((r: { chart_id: string }) => r.chart_id);

    if (chartIds.length > 0) {
      await Promise.all([
        this.client.from('results').delete().eq('user_id', userId).in('chart_id', chartIds),
        this.client.from('drafts').delete().eq('user_id', userId).in('chart_id', chartIds)
      ]);
    }
    await Promise.all([
      this.client.from('drafts').delete().eq('user_id', userId).eq('song_id', songId),
      this.client.from('charts').delete().eq('user_id', userId).eq('song_id', songId)
    ]);

    const { error } = await this.client
      .from('songs')
      .delete()
      .eq('user_id', userId)
      .eq('id', songId);
    checkError(error, 'Deleting song');

    await this.client.storage
      .from(AUDIO_BUCKET)
      .remove([`${userId}/${songId}`])
      .catch(() => {});
  }

  async addResult(userId: string, result: Result): Promise<void> {
    const { error } = await this.client.from('results').insert({
      user_id: userId,
      id: result.id,
      chart_id: result.chartId,
      revision: result.revision,
      title: result.title,
      score: result.score,
      accuracy: result.accuracy,
      max_combo: result.maxCombo,
      perfect: result.perfect,
      great: result.great,
      good: result.good,
      miss: result.miss,
      created_at: result.createdAt
    });
    checkError(error, 'Saving result');
  }
}
