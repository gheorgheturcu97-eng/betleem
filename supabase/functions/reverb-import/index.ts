// Reverb: send a church's song library to the cloud (so its members, and its network, can open songs on the phone).
// Needs a one-time key (its SHA-256 is in import_tokens). Songs are matched by (church_id, local_id): sending again
// updates them, never duplicates. The secret key is given to the function by Supabase itself.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return ''; } })();
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const str = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));

async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async req => {
  if (req.method !== 'POST') return out(405, { error: 'Doar POST' });
  let m: { token?: string; songs?: Record<string, unknown>[]; done?: boolean };
  try { m = await req.json(); } catch { return out(400, { error: 'Cerere greșită' }); }
  const t = String(m.token || '');
  if (t.length < 24 || t.length > 64) return out(403, { error: 'Cheie greșită' });
  const { data: key } = await admin.from('import_tokens').select('*').eq('token_hash', await sha256(t)).maybeSingle();
  if (!key || key.used_at || Date.parse(key.expires_at) < Date.now()) return out(403, { error: 'Cheia nu mai e valabilă' });
  const songs = (Array.isArray(m.songs) ? m.songs : []).slice(0, 300).filter(s => s && s.id && s.title).map(s => ({
    church_id: key.church_id, local_id: str(s.id, 80), title: str(s.title, 200)!, author: str(s.author, 200) || null,
    key: str(s.key, 8) || null, bpm: Number(s.bpm) > 0 && Number(s.bpm) < 400 ? Number(s.bpm) : null,
    body: str(s.body, 40000) || '', arrangement: Array.isArray(s.arrangement) ? s.arrangement.slice(0, 60).map(x => String(x).slice(0, 20)) : null,
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 12).map(x => String(x).slice(0, 40)) : [], ccli: str(s.ccli, 20) || null,
    updated_at: new Date().toISOString(),
  }));
  if (songs.length) {
    const { error } = await admin.from('songs').upsert(songs, { onConflict: 'church_id,local_id' });
    if (error) { console.error('reverb-import', error.message); return out(500, { error: 'N-a mers' }); }
  }
  if (m.done) await admin.from('import_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', key.token_hash);
  return out(200, { ok: true, saved: songs.length });
});
