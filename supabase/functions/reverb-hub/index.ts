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
      return out(200, { version: data[0].version });
    }
    return out(400, { error: 'Acțiune necunoscută' });
  } catch (e) {
    console.error('reverb-hub', (e as Error).message);
    return out(500, { error: 'N-a mers. Mai încearcă peste un minut.' });
  }
});
