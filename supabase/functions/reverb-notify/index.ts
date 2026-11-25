// Reverb: 🔔 a notification on the phone when someone is placed in a service ("Ai fost programat").
//   key  : the public Web Push key (made here the first time and kept server-side; the private half never leaves)
//   scan : looks at a church's program and tells every newly placed person, once per service and place.
//          Called by the page after a leader saves, and by reverb-hub after the church computer syncs.
// Only people who said "yes" on their phone get anything; nobody else's data is read or sent.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return ''; } })();
const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function keys() {
  const { data } = await admin.from('app_secrets').select('name, value').in('name', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data || []).map(r => [r.name, r.value]));
  if (m.vapid_public && m.vapid_private) return m;
  const k = webpush.generateVAPIDKeys();
  await admin.from('app_secrets').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }]);
  return { vapid_public: k.publicKey, vapid_private: k.privateKey };
}
const ro = (iso: string) => new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'Doar POST' });
  // deno-lint-ignore no-explicit-any
  let m: any; try { m = await req.json(); } catch { return out(400, { error: 'Cerere greșită' }); }
  try {
    if (m.action === 'key') return out(200, { key: (await keys()).vapid_public });
    if (m.action !== 'scan') return out(400, { error: 'Acțiune necunoscută' });
    const church = String(m.church_id || '');
    // who may ask: the functions themselves, or a member of that church
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (jwt !== SECRET) {
      const { data: u } = await admin.auth.getUser(jwt);
      if (!u.user) return out(401, { error: 'Intră cu linkul tău' });
      const { data: mem } = await admin.from('members').select('role').eq('church_id', church).eq('user_id', u.user.id).maybeSingle();
      if (!mem) return out(403, { error: 'Nu ești în această biserică' });
    }
    const { data: plan } = await admin.from('plans').select('doc').eq('church_id', church).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const doc: any = plan?.doc || {}, now = new Date().toISOString(), until = new Date(Date.now() + 70 * 864e5).toISOString();
    // deno-lint-ignore no-explicit-any
    const posName: Record<string, string> = {}; for (const d of doc.departments || []) for (const p of d.positions || []) posName[p.id] = p.name;
    const wanted: { person: string; service: string; place: string; title: string; body: string }[] = [];
    for (const s of doc.services || []) {
      if (!(s.date >= now && s.date <= until)) continue;
      for (const [place, a] of Object.entries(s.assignments || {}) as [string, { volunteer: string; status: string }][]) {
        if (!a?.volunteer || a.status === 'declined') continue;
        wanted.push({ person: a.volunteer, service: s.id, place, title: 'Ai fost programat',
          body: `${posName[place.split('#')[0]] || 'Slujești'} · ${ro(s.date)} · ${s.title}. Apasă ca să confirmi.` });
      }
    }
    if (!wanted.length) return out(200, { sent: 0 });
    const { data: done } = await admin.from('push_sent').select('person_id, service_id, place').eq('church_id', church);
    const seen = new Set((done || []).map(d => `${d.person_id}|${d.service_id}|${d.place}`));
    const fresh = wanted.filter(w => !seen.has(`${w.person}|${w.service}|${w.place}`));
    if (!fresh.length) return out(200, { sent: 0 });
    const persons = [...new Set(fresh.map(f => f.person))];
    const { data: mems } = await admin.from('members').select('user_id, person_id').eq('church_id', church).in('person_id', persons);
    const users = [...new Set((mems || []).map(x => x.user_id))];
    const { data: subs } = users.length ? await admin.from('push_subs').select('endpoint, user_id, keys').in('user_id', users) : { data: [] };
    const k = await keys();
    webpush.setVapidDetails('mailto:contact@reverbw.com', k.vapid_public, k.vapid_private);
    let sent = 0;
    for (const f of fresh) {
      const uids = (mems || []).filter(x => x.person_id === f.person).map(x => x.user_id);
      const mine = (subs || []).filter(s => uids.includes(s.user_id));
      if (!mine.length) continue;                      // no phone said yes yet: he is told when he turns notifications on
      for (const s of mine) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: f.title, body: f.body, url: './?tab=vProg', tag: f.service + f.place }), { TTL: 86400 });
          sent++;
        } catch (e) {
          // deno-lint-ignore no-explicit-any
          const code = (e as any)?.statusCode;
          if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint);   // phone said no / gone
          else console.error('push', code, (e as Error).message);
        }
      }
      await admin.from('push_sent').upsert({ church_id: church, person_id: f.person, service_id: f.service, place: f.place });
    }
    return out(200, { sent });
  } catch (e) {
    console.error('reverb-notify', (e as Error).message);
    return out(500, { error: 'N-a mers' });
  }
});
