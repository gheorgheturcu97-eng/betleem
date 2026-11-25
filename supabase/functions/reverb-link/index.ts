// Reverb: personal links (no passwords). The only place that uses the secret key (it bypasses the rules), so every
// check is done here, in code:
//   redeem  : anyone with a valid link → a session for that person (the account is made on first use)
//   create  : a coordinator (or the Reverb admin) makes a link for someone in HIS church
//   renew   : a new link for the same person; the old one stops working and every session is closed (lost phone)
//   remove  : the person leaves the church; link cancelled, sessions closed
// The link itself is never stored: only its SHA-256 fingerprint.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
// the secret key is given to the function by Supabase itself (never typed by anyone)
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return ''; } })();
const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const ROLES = ['member', 'leader', 'coordinator'];
const list = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 12);

async function sha256(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function caller(req: Request) {               // the signed-in person calling create / renew / remove
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user || null;
}
async function canManage(uid: string, church: string) {
  const { data: adm } = await admin.from('reverb_admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (adm) return true;
  const { data: m } = await admin.from('members').select('role').eq('church_id', church).eq('user_id', uid).maybeSingle();
  return m?.role === 'coordinator';
}
async function makeInvite(church: string, by: string | null, x: Record<string, unknown>, keepUser?: string | null) {
  const token = newToken();
  const days = Math.min(365, Math.max(1, Number(x.days) || 60));
  const row = {
    church_id: church, token_hash: await sha256(token), role: ROLES.includes(String(x.role)) ? String(x.role) : 'member',
    departments: list(x.departments), leads: String(x.role) === 'leader' ? list(x.leads) : [], person_id: x.person_id ? String(x.person_id).slice(0, 80) : null,
    display_name: x.display_name ? String(x.display_name).slice(0, 80) : null, created_by: by,
    expires_at: new Date(Date.now() + days * 864e5).toISOString(), user_id: keepUser ?? null,
  };
  const { data, error } = await admin.from('invites').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  if (!row.person_id) await admin.from('invites').update({ person_id: data.id }).eq('id', data.id);   // the person in the program: kept on ↻ Link nou
  return { id: data.id, token, expires_at: row.expires_at };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return out(405, { error: 'Doar POST' });
  let m: Record<string, unknown>;
  try { m = await req.json(); } catch { return out(400, { error: 'Cerere greșită' }); }
  try {
    if (m.action === 'redeem') {
      const t = String(m.token || '');
      if (t.length < 24 || t.length > 64) return out(404, { error: 'Linkul nu e bun. Cere unul nou coordonatorului.' });
      const { data: inv } = await admin.from('invites').select('*').eq('token_hash', await sha256(t)).maybeSingle();
      if (!inv || inv.revoked_at || (inv.expires_at && Date.parse(inv.expires_at) < Date.now()))
        return out(404, { error: 'Linkul nu mai e valabil. Cere unul nou coordonatorului.' });
      let uid = inv.user_id as string | null, email = '';
      if (uid) { const { data } = await admin.auth.admin.getUserById(uid); email = data.user?.email || ''; if (!email) uid = null; }
      if (!uid) {                                     // first use: the account (no real e-mail, no password to remember)
        email = `${inv.id}@membri.reverbw.com`;
        const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: inv.display_name || '' } });
        if (error) throw new Error(error.message);
        uid = data.user.id;
        await admin.from('invites').update({ user_id: uid }).eq('id', inv.id);
      }
      await admin.from('members').upsert({ church_id: inv.church_id, user_id: uid, role: inv.role, departments: inv.departments || [], leads: inv.leads || [],
        person_id: inv.person_id || inv.id, display_name: inv.display_name }, { onConflict: 'church_id,user_id' });
      for (const x of Array.isArray(inv.also) ? inv.also : []) {   // the same person in other churches (one link, one account)
        if (!x?.church_id) continue;
        await admin.from('members').upsert({ church_id: x.church_id, user_id: uid, role: ROLES.includes(x.role) ? x.role : 'member',
          departments: list(x.departments), leads: x.role === 'leader' ? list(x.leads) : [], person_id: inv.person_id || inv.id, display_name: inv.display_name },
          { onConflict: 'church_id,user_id', ignoreDuplicates: true });
      }
      const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      if (error) throw new Error(error.message);
      await admin.from('invites').update({ last_used_at: new Date().toISOString() }).eq('id', inv.id);
      return out(200, { token_hash: link.properties.hashed_token, type: 'magiclink' });
    }

    const me = await caller(req);
    if (!me) return out(401, { error: 'Intră întâi cu linkul tău.' });

    if (m.action === 'create') {
      const church = String(m.church_id || '');
      if (!(await canManage(me.id, church))) return out(403, { error: 'Doar coordonatorul bisericii face linkuri.' });
      return out(200, await makeInvite(church, me.id, { ...m, person_id: null }));   // a new person: his id is made here, never sent by a page
    }
    if (m.action === 'hubKey') {                     // 🔗 a key for the church computer (pasted once into the app); the old ones stop working
      const church = String(m.church_id || '');
      if (!(await canManage(me.id, church))) return out(403, { error: 'Doar coordonatorul leagă calculatorul bisericii.' });
      await admin.from('hub_devices').update({ revoked_at: new Date().toISOString() }).eq('church_id', church).is('revoked_at', null);
      const key = newToken() + newToken().slice(0, 8);
      const { error } = await admin.from('hub_devices').insert({ church_id: church, token_hash: await sha256(key), name: String(m.name || 'Calculatorul bisericii').slice(0, 60), created_by: me.id });
      if (error) throw new Error(error.message);
      return out(200, { key });
    }
    if (m.action === 'update') {                     // role and departments, from the coordinator's page (link stays the same)
      const { data: inv } = await admin.from('invites').select('*').eq('id', String(m.invite_id || '')).maybeSingle();
      if (!inv || !(await canManage(me.id, inv.church_id))) return out(403, { error: 'Nu poți schimba această persoană.' });
      const role = ROLES.includes(String(m.role)) ? String(m.role) : inv.role;
      const ch = { role, departments: list(m.departments), leads: role === 'leader' ? list(m.leads) : [],
        ...(m.display_name ? { display_name: String(m.display_name).slice(0, 80) } : {}) };
      await admin.from('invites').update(ch).eq('id', inv.id);
      if (inv.user_id) await admin.from('members').update(ch).eq('church_id', inv.church_id).eq('user_id', inv.user_id);
      return out(200, { ok: true });
    }
    if (m.action === 'renew' || m.action === 'remove') {
      const { data: inv } = await admin.from('invites').select('*').eq('id', String(m.invite_id || '')).maybeSingle();
      if (!inv || !(await canManage(me.id, inv.church_id))) return out(403, { error: 'Nu poți schimba acest link.' });
      await admin.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', inv.id);
      if (inv.user_id) await admin.rpc('reverb_kill_sessions', { uid: inv.user_id });
      if (m.action === 'remove') {
        if (inv.user_id) await admin.from('members').delete().eq('church_id', inv.church_id).eq('user_id', inv.user_id);
        return out(200, { ok: true });
      }
      const nu = await makeInvite(inv.church_id, me.id, { ...inv, days: m.days }, inv.user_id);
      if (Array.isArray(inv.also) && inv.also.length) await admin.from('invites').update({ also: inv.also }).eq('id', nu.id);
      return out(200, nu);
    }
    return out(400, { error: 'Acțiune necunoscută' });
  } catch (e) {
    console.error('reverb-link', (e as Error).message);
    return out(500, { error: 'N-a mers. Mai încearcă peste un minut.' });
  }
});
