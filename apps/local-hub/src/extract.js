// Pull song text out of a lyrics web page.
// Strategy (generic, works on most lyric/chord sites):
//   1. a <pre> block (chord sites)  2. an element whose class/id says lyrics/versuri/text
//   3. the largest block of <br>-separated short lines.
// Site-specific rules go in SITE_RULES.

const SITE_RULES = [
  // resursecrestine.ro: lyrics (/cantece/) and chords (/acorduri/) both live in <div class="resized-text">
  // (checked on the live site, Nov 2026)
  { host: /(^|\.)resursecrestine\.ro$/, select: /<div[^>]+class="[^"]*\bresized-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function htmlToText(html) {
  // Source line breaks next to tags are not real breaks (only <br>, </p>, </div> are).
  // Leave plain text (e.g. the inside of a <pre>) alone.
  if (/<(br|\/p|\/div|\/li)\b/i.test(html)) html = html.replace(/[ \t]*\r?\n\s*(?=<)|(?<=>)[ \t]*\r?\n\s*/g, '').replace(/\s*\r?\n\s*/g, ' ');
  return html
    .replace(/<(script|style|noscript|form|button|select)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function title(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = htmlToText((og?.[1] ?? h1?.[1] ?? t?.[1] ?? '').trim());
  return raw.split(/\s[|\-–]\s/)[0].trim();
}

function score(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 3) return 0;
  const short = lines.filter(l => l.length < 70).length;
  return short * (short / lines.length);       // many short lines = lyrics
}

export function extractLyrics(html, host = '') {
  for (const rule of SITE_RULES) {
    if (rule.host.test(host)) { const m = html.match(rule.select); if (m) return { title: title(html), body: htmlToText(m[1]) }; }
  }
  const candidates = [];
  for (const m of html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)) candidates.push(htmlToText(m[1]));
  for (const m of html.matchAll(/<(div|section|article|p)[^>]+(?:class|id)=["'][^"']*(lyric|versuri|text-cantare|song|chord|acorduri|content)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)) {
    candidates.push(htmlToText(m[3]));
  }
  // fallback: every run of <br>-separated lines
  for (const m of html.matchAll(/((?:[^<]{1,120}<br\s*\/?>\s*){3,}[^<]{0,120})/gi)) candidates.push(htmlToText(m[1]));
  candidates.sort((a, b) => score(b) - score(a));
  return { title: title(html), body: candidates[0] ?? '' };
}
