// Reverb: the church computer (the app on the Mac mini) talking to Reverb online, with its own key (no person signs in).
//   pull  : the church's program (services, departments, people placed) + who has a link (names, departments; no phones)
//   push  : the merged program back, only if nobody else saved meanwhile (version check)
//   hello : the computer says where it is on the church Wi-Fi (so the links can open Proiectez / MD&TRACK)
// Only the program travels: services, departments, people's names and blocked days. Never phones, e-mails or links.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return ''; } })();
const admin = createClient(Deno.env.get('SUPABASE_URL')!, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const LAN = /^http:\/\/((10|127)\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|[A-Za-z0-9-]+\.local)(:[0-9]{2,5})?$/;

async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
// the shared part of the program, without anything personal
// deno-lint-ignore no-explicit-any
function clean(doc: any) {
  const arr = (v: unknown) => Array.isArray(v) ? v : [];
  return {
    services: arr(doc?.services).slice(0, 400),
    departments: arr(doc?.departments).slice(0, 40),
    // deno-lint-ignore no-explicit-any
    volunteers: arr(doc?.volunteers).slice(0, 800).map(({ phone, email, token, ...v }: any) => v),
  };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return out(405, { error: 'Doar POST' });
  // deno-lint-ignore no-explicit-any
  let m: any;
  try { m = await req.json(); } catch { return out(400, { error: 'Cerere greșită' }); }
  const key = String(m.key || '');
  if (key.length < 24 || key.length > 80) return out(403, { error: 'Cheia calculatorului nu e bună' });
  const { data: dev } = await admin.from('hub_devices').select('*').eq('token_hash', await sha256(key)).maybeSingle();
  if (!dev || dev.revoked_at) return out(403, { error: 'Cheia calculatorului nu mai e valabilă. Fă una nouă din Reverb online.' });
  const church = dev.church_id as string;
  try {
    await admin.from('hub_devices').update({ last_seen: new Date().toISOString() }).eq('id', dev.id);
    if (m.action === 'hello') {
      const url = String(m.hub_url || '');
      if (url && LAN.test(url)) await admin.from('churches').update({ hub_url: url }).eq('id', church);
      return out(200, { ok: true });
    }
    if (m.action === 'pull') {
      const [{ data: c }, { data: plan }, { data: own }, { data: guests }, { data: deps }] = await Promise.all([
        admin.from('churches').select('id, name').eq('id', church).single(),
        admin.from('plans').select('doc, version').eq('church_id', church).maybeSingle(),
        admin.from('invites').select('id, person_id, display_name, departments').eq('church_id', church).is('revoked_at', null),
        admin.from('invites').select('id, person_id, display_name, also').is('revoked_at', null),
        admin.from('departments').select('name').eq('church_id', church).order('sort'),
      ]);
      const people = [...(own || []).map(i => ({ id: i.person_id || i.id, name: i.display_name || '', departments: i.departments || [] })),
        // deno-lint-ignore no-explicit-any
        ...(guests || []).flatMap(i => (i.also || []).filter((x: any) => x?.church_id === church).map((x: any) => ({ id: i.person_id || i.id, name: i.display_name || '', departments: x.departments || [] })))];
      return out(200, { church: c, doc: plan?.doc ? clean(plan.doc) : null, version: plan?.version || 0, people, departments: (deps || []).map(d => d.name) });
    }
    if (m.action === 'push') {
      const doc = clean(m.doc), body = JSON.stringify(doc);
      if (body.length > 1_800_000) return out(413, { error: 'Programul e prea mare' });
      const v = Number(m.version) || 0;
      const { data: row } = await admin.from('plans').select('doc, version').eq('church_id', church).maybeSingle();
      if ((row?.version || 0) !== v) return out(409, { conflict: true, version: row?.version || 0 });
      // keep whatever else the web page keeps in the document (nothing personal is ever in it)
      const full = { ...(row?.doc || {}), ...doc };
      const q = row
        ? admin.from('plans').update({ doc: full, version: v + 1, updated_at: new Date().toISOString(), updated_by: null }).eq('church_id', church).eq('version', v).select('version')
        : admin.from('plans').insert({ church_id: church, doc: full, version: 1 }).select('version');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data?.length) return out(409, { conflict: true });
      await admin.from('plan_ops').insert({ church_id: church, op: { op: 'hubSync', version: data[0].version } });
      // 🔔 people newly placed from the church computer get their notification too
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/reverb-notify`, { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', apikey: SECRET, authorization: 'Bearer ' + SECRET }, body: JSON.stringify({ action: 'scan', church_id: church }) }).catch(() => {});
      return out(200, { version: data[0].version });
    }
    // 🎵 the song library: what changed online (written or corrected from a link) comes to the computer, and back
    if (m.action === 'songsPull') {
      const since = typeof m.since === 'string' && m.since ? m.since : '1970-01-01T00:00:00Z';
      const { data } = await admin.from('songs').select('local_id, title, author, key, bpm, body, arrangement, tags, updated_at')
        .eq('church_id', church).gt('updated_at', since).order('updated_at').limit(300);
      return out(200, { songs: data || [] });
    }
    if (m.action === 'songsPush') {
      const str = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
      // deno-lint-ignore no-explicit-any
      const list = (Array.isArray(m.songs) ? m.songs : []).slice(0, 150).filter((x: any) => x?.local_id && x?.title);
      if (!list.length) return out(200, { saved: 0 });
      const { data: have } = await admin.from('songs').select('local_id, updated_at').eq('church_id', church).in('local_id', list.map((x: { local_id: unknown }) => String(x.local_id)));
      const newer = new Map((have || []).map(h => [h.local_id, h.updated_at]));
      // deno-lint-ignore no-explicit-any
      const rows = list.filter((x: any) => !newer.has(String(x.local_id)) || Date.parse(String(newer.get(String(x.local_id)))) < (Date.parse(x.updatedAt) || 0)).map((x: any) => ({
        church_id: church, local_id: str(x.local_id, 80), title: str(x.title, 200)!, author: str(x.author, 200) || null, key: str(x.key, 8) || null,
        bpm: Number(x.bpm) > 0 && Number(x.bpm) < 400 ? Number(x.bpm) : null, body: str(x.body, 40000) || '',
        arrangement: Array.isArray(x.arrangement) ? x.arrangement.slice(0, 60).map((a: unknown) => String(a).slice(0, 20)) : null,
        tags: Array.isArray(x.tags) ? x.tags.slice(0, 12).map((a: unknown) => String(a).slice(0, 40)) : [],
        updated_at: x.updatedAt && !isNaN(Date.parse(x.updatedAt)) ? x.updatedAt : new Date().toISOString() }));
      if (rows.length) { const { error } = await admin.from('songs').upsert(rows, { onConflict: 'church_id,local_id' }); if (error) throw new Error(error.message); }
      return out(200, { saved: rows.length });
    }
    return out(400, { error: 'Acțiune necunoscută' });
  } catch (e) {
    console.error('reverb-hub', (e as Error).message);
    return out(500, { error: 'N-a mers. Mai încearcă peste un minut.' });
  }
});
