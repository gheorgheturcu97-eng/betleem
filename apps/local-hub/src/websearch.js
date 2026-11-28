// Automatic lyrics search: type a title, get back ready-to-use lyrics.
// 1. ask DuckDuckGo (no-JS HTML page) for pages — Resurse Creștine first, then any site
// 2. download the best few pages in parallel
// 3. pull out only the lyrics (or chords) and return them, best first.

import { extractLyrics } from './extract.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36';
const SKIP = /(youtube\.|youtu\.be|facebook\.|instagram\.|tiktok\.|spotify\.|deezer\.|apple\.com|shazam\.|wikipedia\.|\.pdf($|\?)|download\.resursecrestine|audio\.resursecrestine|video\.resursecrestine)/i;

async function get(url, ms = 8000) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ro-RO,ro;q=0.9,en;q=0.6' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

/** Parse a DuckDuckGo HTML results page into [{title, url}]. Exported for tests. */
export function parseDuckDuckGo(html) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    let href = decode(m[1]);
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:/.test(href)) continue;
    out.push({ url: href, title: decode(m[2].replace(/<[^>]+>/g, '')).trim() });
  }
  return out;
}

/** Bing as a fallback if DuckDuckGo refuses. */
export function parseBing(html) {
  const out = [];
  for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    out.push({ url: decode(m[1]), title: decode(m[2].replace(/<[^>]+>/g, '')).trim() });
  }
  return out;
}

/** Resurse Creștine's own search: song pages and chord pages, without going through a search engine. Exported for tests. */
export function rcLinks(html) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+href="((?:https?:\/\/www\.resursecrestine\.ro)?\/(cantece|acorduri)\/\d+\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = m[1].startsWith('http') ? m[1] : 'https://www.resursecrestine.ro' + m[1];
    if (!out.some(x => x.url === url)) out.push({ url, title: decode(m[3].replace(/<[^>]+>/g, '')).trim(), chords: m[2] === 'acorduri' });
  }
  return out;
}
async function searchRC(q) {
  try { return rcLinks(await get('https://www.resursecrestine.ro/cauta/' + encodeURIComponent(q) + '/1/titlu')); } catch { return []; }
}

async function searchWeb(query, lang = 'ro') {
  const kl = lang === 'en' ? 'us-en' : 'ro-ro';
  try {
    const r = parseDuckDuckGo(await get(`https://html.duckduckgo.com/html/?kl=${kl}&q=` + encodeURIComponent(query)));
    if (r.length) return r;
  } catch {}
  try { return parseBing(await get(`https://www.bing.com/search?setlang=${lang}&q=` + encodeURIComponent(query))); }
  catch { return []; }
}

function goodUrl(url, chords) {
  if (SKIP.test(url)) return false;
  if (/resursecrestine\.ro/i.test(url)) return chords ? /\/acorduri\/\d+\//.test(url) : /\/(cantece|acorduri)\/\d+\//.test(url);
  return true;
}

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function similarity(a, b) {
  const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' '));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, 1);
}

/**
 * Search the web for a song and return candidates with clean lyrics.
 * @param {string} q        title or first line
 * @param {object} opts     { chords: boolean, normalize: (text)=>text, limit }
 */
export async function searchLyrics(q, { chords = false, normalize = t => t, limit = 6 } = {}) {
  q = String(q || '').trim().slice(0, 120);
  if (!q) return [];
  const queries = chords
    ? [`site:resursecrestine.ro acorduri ${q}`, `${q} acorduri versuri`]
    : [`site:resursecrestine.ro ${q}`, `${q} versuri`];
  const seen = new Set(), links = [];
  // 1. Resurse Creștine's own search. The chord pages come too (marked "acorduri"), so a song can always be taken with chords.
  const rc = await searchRC(q);
  for (const r of [...rc.filter(x => x.chords === chords).slice(0, 3), ...rc.filter(x => x.chords !== chords).slice(0, chords ? 1 : 2)]) {
    const key = r.url; if (seen.has(key)) continue; seen.add(key); links.push(r);
  }
  // deeper: more Romanian searches, then the English song with chords (Worship Together, WorshipChords, songs with
  // an English title in brackets: „Apa vie (Living Water)” looks for „Living Water chords” too)
  const en = (q.match(/\(([^)]+)\)/) || [])[1] || (/^[\x20-\x7e]+$/.test(q) ? q : '');
  const deep = [...queries.map(x => [x, 'ro']),
    ...(chords || en ? [[`site:worshiptogether.com ${en || q}`, 'en'], [`${en || q} chords lyrics`, 'en'], [`site:worshipchords.com ${en || q}`, 'en']] : [])];
  for (const [query, lang] of deep) {
    for (const r of await searchWeb(query, lang)) {
      const key = r.url.replace(/[#?].*$/, '');
      if (seen.has(key) || !goodUrl(r.url, chords)) continue;
      seen.add(key); links.push(r);
    }
    if (links.length >= limit * 2) break;
  }

  const pages = await Promise.allSettled(links.slice(0, limit * 2).map(async (l, i) => {
    const html = await get(l.url);
    const host = new URL(l.url).hostname.replace(/^www\./, '');
    const found = extractLyrics(html, host);
    const body = normalize(found.body || '');
    const lines = body.split('\n').filter(x => x.trim() && !/^\[[^\]]+\](\s*\[[^\]]+\])*$/.test(x.trim()));
    if (lines.length < 4) return null;
    const title = (found.title || l.title).replace(/\s[-|–]\s*Resurse Cre[sș]tine.*$/i, '').trim();
    const hasChords = /\[[A-G][^\]]*\]/.test(body);
    const score = (host.endsWith('resursecrestine.ro') ? 3 : 0) + (host.endsWith('worshiptogether.com') ? 1.5 : 0) + similarity(en || q, title) * 2 + (chords && hasChords ? 2 : 0) - i * 0.1;
    return { title, url: l.url, site: host, body, hasChords, preview: lines.slice(0, 2).map(x => x.replace(/\[[^\]]*\]/g, '')).join(' / '), score };
  }));
  return pages.map(p => p.status === 'fulfilled' ? p.value : null).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit + 2);
}
