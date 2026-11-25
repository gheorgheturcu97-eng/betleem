// 🔗 Reverb online ⇄ Planificarea of this computer.
// The church computer is linked once with a key made by a coordinator on the web page (no person signs in here).
// Every minute (and a few seconds after a change here) it brings the program from Reverb online and sends its own:
// a three-way merge per service / department / person against the copy both sides last agreed on, so a change made
// on a phone and another made here both survive. Only the program travels: services, departments, people's names
// and blocked days. Phones, e-mails, personal links and journals never leave this computer.
// Sunday safety: without internet nothing changes here; the screens use their own copy of the program anyway.

export const REVERB = { url: 'https://wkkqvlnjauwpnuiwldem.supabase.co', key: 'sb_publishable_-a0JcujMA1Bm4MjksNJiuA_VAe242mt' };
const PRIVATE = ['phone', 'email', 'token', 'journal'];
export const pub = v => Object.fromEntries(Object.entries(v || {}).filter(([k]) => !PRIVATE.includes(k)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = a => new Map((a || []).filter(x => x?.id).map(x => [x.id, x]));
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Three-way merge of one list (by id). prefer(id) says who wins when both sides changed the same thing. */
export function merge3(local, base, cloud, prefer = () => 'cloud') {
  const L = byId(local), B = byId(base), C = byId(cloud), out = [];
  const order = [...new Set([...C.keys(), ...L.keys(), ...B.keys()])];
  for (const id of order) {
    const l = L.get(id), b = B.get(id), c = C.get(id);
    if (!b) { if (l && c) out.push(prefer(id) === 'local' ? l : c); else if (l || c) out.push(l || c); continue; }
    if (!l && !c) continue;                                       // deleted on both sides
    if (!l) { if (!same(c, b)) out.push(c); continue; }           // deleted here: gone, unless changed meanwhile in the cloud
    if (!c) { if (!same(l, b)) out.push(l); continue; }           // deleted online: gone, unless changed meanwhile here
    out.push(same(l, b) ? c : same(c, b) ? l : prefer(id) === 'local' ? l : c);
  }
  return out;
}

/** The people with a link become this church's volunteers: a local volunteer with the same name takes the link's id
 *  (his places in every service follow him); people not here yet are added. Returns true if anything changed. */
export function adoptPeople(plan, people, newToken) {
  let changed = false;
  const ids = new Set(plan.volunteers.map(v => v.id));
  for (const p of people || []) {
    if (!p?.id || ids.has(p.id)) continue;
    const v = plan.volunteers.find(x => !people.some(q => q.id === x.id) && fold(x.name) === fold(p.name));
    if (v) {
      const old = v.id; v.id = p.id; ids.add(p.id);
      for (const s of plan.services) for (const a of Object.values(s.assignments || {})) if (a.volunteer === old) a.volunteer = p.id;
      for (const t of plan.tasks || []) if (t.who === old) t.who = p.id;
    } else {
      const pos = plan.departments.filter(d => (p.departments || []).includes(d.name)).flatMap(d => d.positions.map(x => x.id));
      plan.volunteers.push({ id: p.id, name: p.name || '', phone: '', email: '', positions: pos, away: [], maxPerMonth: 0, leader: false, photographer: false, token: newToken() });
      ids.add(p.id);
    }
    changed = true;
  }
  return changed;
}

/** The first time: a department made online with the same name as one here is the same department (positions by name). */
export function alignDepartments(plan, cloud) {
  if (!cloud?.departments?.length) return;
  const posMap = {};
  cloud.departments = cloud.departments.filter(cd => {
    const ld = plan.departments.find(d => fold(d.name) === fold(cd.name)); if (!ld) return true;
    for (const cp of cd.positions || []) { const lp = ld.positions.find(p => fold(p.name) === fold(cp.name)); if (lp) posMap[cp.id] = lp.id; }
    return false;
  });
  for (const s of cloud.services || []) {
    const a = {};
    for (const [k, v] of Object.entries(s.assignments || {})) { const [pid, slot] = k.split('#'); a[`${posMap[pid] || pid}#${slot}`] = v; }
    s.assignments = a;
  }
  for (const v of cloud.volunteers || []) v.positions = (v.positions || []).map(x => posMap[x] || x);
}

/** Merge the cloud's program into the local plan (in place). Returns the shared copy both sides now agree on. */
export function mergePlan(plan, base, cloud, { liveId, newToken }) {
  const prefer = id => (id === liveId ? 'local' : 'cloud');       // the program on the screens: this computer wins
  plan.services = merge3(plan.services, base?.services, cloud?.services, prefer).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  plan.departments = merge3(plan.departments, base?.departments, cloud?.departments);
  const mine = byId(plan.volunteers);
  const vols = merge3(plan.volunteers.map(pub), base?.volunteers, cloud?.volunteers);
  plan.volunteers = vols.map(v => {
    const old = mine.get(v.id);
    return { phone: '', email: '', ...Object.fromEntries(PRIVATE.map(k => [k, old?.[k]]).filter(([, x]) => x !== undefined)), ...v, token: old?.token || newToken() };
  });
  return shared(plan);
}
export const shared = plan => ({ services: plan.services, departments: plan.departments, volunteers: plan.volunteers.map(pub) });

/** The runner: keeps the key and the agreed copy in a private file (0600), syncs every minute and soon after a change. */
export function createReverbSync({ file, fs, getPlan, applied, liveId, newToken, hubUrl, songs = null, log = () => {}, fetchImpl = fetch, every = 60000 }) {
  let st = {}; try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let timer = null, soon = null, running = false, again = false, saidHello = '';
  const status = { state: st.key ? 'linked' : 'off', church: st.church || null, lastSync: st.lastSync || null, error: '' };
  const keep = () => { try { fs.writeFileSync(file, JSON.stringify(st), { mode: 0o600 }); } catch (e) { log('reverb: ' + e.message); } };
  async function call(action, extra = {}) {
    let r;
    try {
      r = await fetchImpl(`${REVERB.url}/functions/v1/reverb-hub`, { method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'content-type': 'application/json', apikey: REVERB.key }, body: JSON.stringify({ action, key: st.key, ...extra }) });
    } catch { throw Object.assign(new Error('Fără internet: lucrez cu programul de aici.'), { offline: true }); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return { conflict: true };
    if (!r.ok) throw Object.assign(new Error(j.error || `Reverb online a răspuns ${r.status}`), { status: r.status });
    return j;
  }
  async function syncNow() {
    if (!st.key) return status;
    if (running) { again = true; return status; }
    running = true;
    try {
      for (let round = 0; round < 3; round++) {
        const url = hubUrl(); if (url && url !== saidHello) { await call('hello', { hub_url: url }); saidHello = url; }
        const r = await call('pull');
        st.church = r.church; status.church = r.church;
        const plan = getPlan(st.local); if (!plan) throw new Error('Biserica legată nu mai e pe acest calculator.');
        if (!st.base && r.doc) alignDepartments(plan, r.doc);
        const peopleChanged = adoptPeople(plan, r.people, newToken);
        const agreed = mergePlan(plan, st.base, r.doc || { services: [], departments: [], volunteers: [] }, { liveId: liveId(st.local), newToken });
        applied(peopleChanged || !same(agreed, st.base), st.local);
        if (r.doc && same(agreed, { services: r.doc.services, departments: r.doc.departments, volunteers: r.doc.volunteers })) { st.base = agreed; st.version = r.version; break; }
        const p = await call('push', { doc: agreed, version: r.version });
        if (p.conflict) continue;                                 // someone saved online meanwhile: once more, on the newest
        st.base = agreed; st.version = p.version; break;
      }
      if (songs) await syncSongs();
      st.lastSync = new Date().toISOString(); Object.assign(status, { state: 'linked', lastSync: st.lastSync, error: '' });
    } catch (e) {
      status.error = e.message;
      if (e.status === 403) { status.state = 'bad-key'; }
      log('reverb: ' + e.message);
    } finally { keep(); running = false; if (again) { again = false; setTimeout(syncNow, 500); } }
    return status;
  }
  // 🎵 songs written or corrected from a link come into the library here; songs changed here go up (newest wins)
  async function syncSongs() {
    const lib = songs.list(); let changed = 0;
    for (let page = 0; page < 20; page++) {
      const r = await call('songsPull', { since: st.songsSince || '' });
      for (const c of r.songs || []) {
        changed += songs.apply(c) ? 1 : 0;
        if (!st.songsSince || Date.parse(c.updated_at) > Date.parse(st.songsSince)) st.songsSince = c.updated_at;
      }
      if ((r.songs || []).length < 300) break;
    }
    if (changed) songs.saved(changed);
    const since = Date.parse(st.songsPushed || 0) || 0, startedAt = new Date().toISOString();
    const up = lib.filter(x => x?.id && x?.title && (Date.parse(x.updatedAt || x.createdAt || 0) || 1) > since)
      .map(x => ({ local_id: x.id, title: x.title, author: x.author || '', key: x.key || '', bpm: x.bpm || null, body: x.body || '',
        arrangement: Array.isArray(x.arrangement) ? x.arrangement : null, tags: x.tags || [], updatedAt: x.updatedAt || x.createdAt || '2000-01-01T00:00:00Z' }));
    for (let i = 0; i < up.length; i += 120) await call('songsPush', { songs: up.slice(i, i + 120) });
    st.songsPushed = startedAt;
  }
  function start() { clearInterval(timer); if (st.key) { timer = setInterval(syncNow, every); timer.unref?.(); setTimeout(syncNow, 1500); } }
  return {
    status: () => ({ ...status, linked: !!st.key, local: st.local || null }),
    async link(key, local) { st = { key: String(key || '').trim(), local }; status.state = 'linked'; saidHello = ''; keep(); start(); return syncNow(); },
    unlink() { st = {}; keep(); clearInterval(timer); Object.assign(status, { state: 'off', church: null, lastSync: null, error: '' }); return status; },
    changed() { if (!st.key) return; clearTimeout(soon); soon = setTimeout(syncNow, 3000); soon.unref?.(); },
    syncNow, start,
  };
}
