// Planning Center Services → Betleem: songs (lyrics + chords + order) and upcoming plans.
// Uses a Personal Access Token (Client ID + Secret from api.planningcenteronline.com/personal_access_tokens).
// One way only: Betleem reads from Planning Center, it never changes anything there.

const API = 'https://api.planningcenteronline.com/services/v2';

/** GET every page of a Planning Center list (follows links.next). */
export async function pcoGet(creds, url, { fetchImpl = fetch, max = 2000 } = {}) {
  if (!creds?.appId || !creds?.secret) throw new Error('Pune întâi Client ID și Secret de la Planning Center.');
  const auth = 'Basic ' + Buffer.from(`${creds.appId}:${creds.secret}`).toString('base64');
  let next = url.startsWith('http') ? url : API + url;
  const data = [], included = [];
  while (next && data.length < max) {
    let r;
    for (let tries = 0; ; tries++) {
      r = await fetchImpl(next, { headers: { authorization: auth, accept: 'application/json' } });
      if (r.status !== 429 || tries > 4) break;     // rate limit: wait as Planning Center asks
      await new Promise(ok => setTimeout(ok, (Number(r.headers.get('retry-after')) || 2) * 1000));
    }
    if (r.status === 401) throw new Error('Planning Center nu acceptă cheia. Verifică Client ID și Secret.');
    if (r.status === 403) throw new Error('Contul tău Planning Center nu are acces la Services.');
    if (!r.ok) throw new Error('Planning Center a răspuns cu eroarea ' + r.status);
    const j = await r.json();
    data.push(...(Array.isArray(j.data) ? j.data : [j.data]));
    if (j.included) included.push(...j.included);
    next = j.links?.next || null;
  }
  return { data, included };
}

const withPerPage = u => u + (u.includes('?') ? '&' : '?') + 'per_page=100';

/** Planning Center chord charts: drop page/column breaks; the rest is understood by normalizeImported. */
export function cleanChordChart(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(l => !/^\s*(COLUMN_BREAK|PAGE_BREAK)\s*$/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function serviceTypes(creds, opt) {
  const { data } = await pcoGet(creds, withPerPage('/service_types'), opt);
  return data.map(t => ({ id: t.id, name: t.attributes.name }));
}

/** All songs with their first arrangement that has words. */
export async function fetchSongs(creds, { onProgress = () => {}, onlyIds = null, ...opt } = {}) {
  const songs = onlyIds
    ? (await Promise.all(onlyIds.map(id => pcoGet(creds, `/songs/${id}`, opt)))).map(r => r.data[0])
    : (await pcoGet(creds, withPerPage('/songs?where[hidden]=false&order=title'), opt)).data;
  const out = [];
  for (const [i, s] of songs.entries()) {
    onProgress({ done: i, total: songs.length, current: s.attributes.title });
    const { data: arrs } = await pcoGet(creds, withPerPage(`/songs/${s.id}/arrangements`), opt);
    const pick = arrs.find(a => a.attributes.chord_chart) || arrs.find(a => a.attributes.lyrics) || arrs[0];
    const a = pick?.attributes || {};
    const body = cleanChordChart(a.chord_chart || a.lyrics || '');
    out.push({
      pcoId: s.id, arrangementId: pick?.id || '', title: (s.attributes.title || '').trim(), author: s.attributes.author || '',
      ccli: s.attributes.ccli_number ? String(s.attributes.ccli_number) : '', key: a.chord_chart_key || '', bpm: Number(a.bpm) || 0,
      body, sequence: Array.isArray(a.sequence) ? a.sequence : [],
    });
  }
  onProgress({ done: songs.length, total: songs.length });
  return out;
}

/** Plans to choose from: the upcoming ones and the last few that already happened. */
export async function listPlans(creds, typeId, { past = 4, ...opt } = {}) {
  const shape = (p, when) => ({ id: p.id, typeId: String(typeId), when, title: p.attributes.title || p.attributes.series_title || '',
    dates: p.attributes.dates || '', date: p.attributes.sort_date, items: p.attributes.items_count ?? null });
  const { data: future } = await pcoGet(creds, withPerPage(`/service_types/${typeId}/plans?filter=future&order=sort_date`), { ...opt, max: 30 });
  const { data: gone } = past ? await pcoGet(creds, `/service_types/${typeId}/plans?filter=past&order=-sort_date&per_page=${past}`, { ...opt, max: past }) : { data: [] };
  return [...future.map(p => shape(p, 'future')), ...gone.slice(0, past).map(p => shape(p, 'past'))];
}

/** One plan with its items (songs, sermon, etc.). */
export async function fetchPlan(creds, typeId, plan, opt = {}) {
  const p = plan.attributes ? plan : (await pcoGet(creds, `/service_types/${typeId}/plans/${plan.id}`, opt)).data[0];
  const { data: items } = await pcoGet(creds, withPerPage(`/service_types/${typeId}/plans/${p.id}/items?include=song,arrangement`), opt);
  return {
    pcoId: p.id,
    title: p.attributes.title || p.attributes.series_title || p.attributes.dates || 'Serviciu',
    date: p.attributes.sort_date,
    items: items.map(it => ({
      type: it.attributes.item_type, title: it.attributes.title || '', key: it.attributes.key_name || '',
      seconds: Number(it.attributes.length) || 0,
      songId: it.relationships?.song?.data?.id || '',
    })).filter(it => it.type !== 'header'),
  };
}

/** Upcoming plans of the chosen service types (or only the chosen plans: [{ typeId, id }]). */
export async function fetchPlans(creds, typeIds, { only = null, ...opt } = {}) {
  const plans = [];
  if (only) { for (const r of only) plans.push(await fetchPlan(creds, r.typeId, { id: r.id }, opt)); return plans; }
  for (const tid of typeIds) {
    const { data } = await pcoGet(creds, withPerPage(`/service_types/${tid}/plans?filter=future&order=sort_date`), { ...opt, max: 60 });
    for (const p of data) plans.push(await fetchPlan(creds, tid, p, opt));
  }
  return plans;
}

/** Guess what kind of program item a Planning Center item is, from its title. */
export function itemKind(title) {
  const t = String(title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/predic|sermon|mesaj|message|cuvant/.test(t)) return 'sermon';
  if (/rugaciun|prayer/.test(t)) return 'prayer';
  if (/anunt|announce/.test(t)) return 'announcement';
  return 'other';
}
