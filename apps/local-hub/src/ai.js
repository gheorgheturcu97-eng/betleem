// Betleem assistant: chat in Romanian, it changes the app through the same commands the
// operator uses (program, songs, tags, look of the screens, backgrounds, live slides).
// Works with Claude (API key) or a local model through Ollama.

const SYSTEM = `Ești asistentul aplicației Betleem, folosită de o biserică pentru proiecția versurilor și programul serviciului.
Vorbești în română, scurt și prietenos. Faci lucrurile cerute folosind uneltele, apoi spui în una-două propoziții ce ai făcut.
Reguli:
- Când nu știi ce e acum în program sau pe ecrane, apelează întâi get_state.
- Cântările le PUI EFECTIV în program, niciodată nu scrii doar titlurile în răspuns. Ai titluri → add_songs (o singură dată, cu toată lista, în ordine). Vrei „N cântări de laudă / necântate de mult / cele mai cântate” → pick_songs. Altfel search_songs + add_song_to_program. Nu inventa id-uri.
- Nu întreba utilizatorul după o listă dacă poți alege singur din bibliotecă cu pick_songs.
- Pozițiile din program încep de la 1.
- Mărimea textului e în procente din înălțimea ecranului: 2.5 foarte mic, 6 normal pe proiector, 9 mare, 12 foarte mare.
- „Sală”/„proiector”/„ecranul mare” = screen "main". „Scenă”/„monitor”/„muzicieni” = screen "stage".
- Ordinea strofelor („aranjamentul”): citește întâi get_song_structure, apoi set_arrangement cu numele secțiunilor exact cum apar (ex. ["Strofa 1","Refren","Strofa 2","Refren","Bridge","Refren"]). O secțiune se poate repeta.
- Când primești o listă (scrisă, dintr-un fișier sau dintr-o poză) cu cântări și structuri: pune-le toate cu add_songs (cu tonurile, dacă sunt scrise), apoi pune structura cu set_arrangement. Track-urile vin singure cu cântarea; volumul sau mut-ul lor le schimbi cu set_track. La final spune ce n-ai găsit în bibliotecă.
- Pentru „cântări necântate de mult”, „ceva din categoria X” sau „să nu repetăm” folosește song_usage.
- Dacă get_state spune că ești în Planificare, lucrezi pe serviciul ales acolo (programul planificat), nu pe ecrane: fundalul, slide-urile și aspectul nu se schimbă de aici.
- Dacă cererea e neclară sau ar șterge mult, întreabă înainte.`;

export const TOOLS = [
  { name: 'get_state', description: 'Programul serviciului, ce e pe ecran acum și setările de aspect ale ecranelor.', params: {} },
  { name: 'search_songs', description: 'Caută cântări în bibliotecă după titlu sau vers și/sau după etichetă (ex. Laudă, Adorare).',
    params: { query: { type: 'string', description: 'text de căutat (poate lipsi)' }, tag: { type: 'string', description: 'etichetă (poate lipsi)' } } },
  { name: 'add_song_to_program', description: 'Adaugă o cântare la sfârșitul programului.',
    params: { song_id: { type: 'string' }, key: { type: 'string', description: 'tonul pentru acest serviciu, opțional' } }, required: ['song_id'] },
  { name: 'add_songs', description: 'Pune în program cântări din bibliotecă după titlu (caută singur cea mai potrivită). Trimite toată lista odată, în ordine. Răspunde ce a pus și ce n-a găsit.',
    params: { titles: { type: 'array', items: { type: 'string' }, description: 'titlurile, în ordine' }, keys: { type: 'array', items: { type: 'string' }, description: 'tonurile, în aceeași ordine (opțional)' } }, required: ['titles'] },
  { name: 'pick_songs', description: 'Alege singur cântări din bibliotecă și le pune în program: câte, din ce categorie (etichetă) și cum: "rar" = necântate de mult, "des" = cele mai cântate, "oricare".',
    params: { count: { type: 'number' }, tag: { type: 'string', description: 'categoria, ex. Laudă, Închinare (opțional)' }, how: { type: 'string', enum: ['rar', 'des', 'oricare'] } }, required: ['count'] },
  { name: 'add_item_to_program', description: 'Adaugă în program altceva decât o cântare (predică, rugăciune, anunțuri, altceva).',
    params: { kind: { type: 'string', enum: ['sermon', 'prayer', 'announcement', 'other'] }, title: { type: 'string' }, minutes: { type: 'number' } }, required: ['kind', 'title'] },
  { name: 'remove_from_program', description: 'Scoate din program elementul de la poziția dată (1 = primul).', params: { position: { type: 'number' } }, required: ['position'] },
  { name: 'move_in_program', description: 'Mută un element din program de la o poziție la alta.', params: { from: { type: 'number' }, to: { type: 'number' } }, required: ['from', 'to'] },
  { name: 'set_key', description: 'Schimbă tonul unei cântări din program (ex. A, Bb, F#m).', params: { position: { type: 'number' }, key: { type: 'string' } }, required: ['position', 'key'] },
  { name: 'set_display', description: 'Schimbă aspectul textului pe un ecran. Trimite doar ce se schimbă.',
    params: {
      screen: { type: 'string', enum: ['main', 'stage'] },
      position: { type: 'number', description: 'opțional: doar pentru cântarea de la această poziție din program (doar main)' },
      font: { type: 'string', enum: ['Montserrat', 'Figtree', 'Poppins', 'Inter', 'Raleway', 'Arial', 'Segoe UI', 'Bahnschrift', 'Calibri', 'Verdana', 'Oswald', 'Bebas Neue', 'Impact', 'Playfair Display', 'Lora', 'Georgia', 'Times New Roman', 'Caveat', 'Kalam', 'Patrick Hand', 'Dancing Script', 'Great Vibes', 'Pacifico', 'Amatic SC'] },
      size: { type: 'number' }, color: { type: 'string', description: '#rrggbb' }, chord_color: { type: 'string', description: '#rrggbb, doar stage' },
      align: { type: 'string', enum: ['left', 'center', 'right'] }, valign: { type: 'string', enum: ['top', 'middle', 'bottom'], description: 'doar main' },
      weight: { type: 'number', enum: [400, 600, 700, 800] }, upper: { type: 'boolean' }, shadow: { type: 'boolean' },
      dim: { type: 'number', description: 'cât se întunecă fundalul, 0-90' }, show_next: { type: 'boolean', description: 'doar stage' },
    }, required: ['screen'] },
  { name: 'set_song_tags', description: 'Pune etichetele unei cântări (înlocuiește lista).', params: { song_id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['song_id', 'tags'] },
  { name: 'list_backgrounds', description: 'Lista fundalurilor disponibile.', params: {} },
  { name: 'set_background', description: 'Pune un fundal pe ecranul mare (nume din list_backgrounds; gol = fără fundal).', params: { name: { type: 'string' } }, required: ['name'] },
  { name: 'show_slide', description: 'Trimite pe ecran un slide: poziția din program și numărul slide-ului (1 = primul).', params: { position: { type: 'number' }, slide: { type: 'number' } }, required: ['position'] },
  { name: 'get_song_structure', description: 'Secțiunile unei cântări din program (Strofa 1, Refren, Bridge…), ordinea de acum și track-urile ei.', params: { position: { type: 'number' } }, required: ['position'] },
  { name: 'set_arrangement', description: 'Ordinea secțiunilor pentru o cântare din program, cu numele lor (se pot repeta). Listă goală = ordinea originală.',
    params: { position: { type: 'number' }, sections: { type: 'array', items: { type: 'string' } } }, required: ['position', 'sections'] },
  { name: 'set_track', description: 'Schimbă un track al unei cântări din program (click, guide, tobe, bas…): volum în procente (0-150) și/sau mut.',
    params: { position: { type: 'number' }, track: { type: 'string' }, volume: { type: 'number' }, muted: { type: 'boolean' } }, required: ['position', 'track'] },
  { name: 'song_usage', description: 'Cât s-a cântat fiecare cântare în ultimele zile (din programele trecute): count, last (data), tags. Folosește-l ca să alegi cântări necântate de mult sau cele mai cântate, opțional dintr-o categorie.',
    params: { days: { type: 'number' }, tag: { type: 'string' } } },
  { name: 'set_item', description: 'Schimbă un element din program: titlu (nu la cântări), minute, cine îl conduce.',
    params: { position: { type: 'number' }, title: { type: 'string' }, minutes: { type: 'number' }, leader: { type: 'string' } }, required: ['position'] },
  { name: 'set_service', description: 'Schimbă titlul serviciului și/sau data și ora (ISO, ex. 2026-11-22T10:00).', params: { title: { type: 'string' }, starts_at: { type: 'string' } } },
];

/** Run a tool against the hub. `hub` = { state(), run(msg) -> error|null, searchSongs(q, tag), media(), song(id) } */
export function runTool(hub, name, a = {}) {
  const pos = p => Math.round(Number(p)) - 1;
  const done = (err, ok) => err ? { error: err } : { ok: ok || 'gata' };
  switch (name) {
    case 'get_state': return hub.state();
    case 'search_songs': {
      const r = hub.searchSongs(a.query || '', a.tag || '', true).slice(0, 25);
      return r.length ? r : { results: [], tags: hub.tags?.() || [], hint: 'Nimic găsit. Încearcă fără etichetă, cu mai puține cuvinte, sau folosește pick_songs.' };
    }
    case 'add_song_to_program': {
      const s = hub.song(a.song_id); if (!s) return { error: 'Nu există cântarea cu acest id. Folosește search_songs.' };
      return done(hub.run({ type: 'addItem', kind: 'song', songId: s.id, key: a.key || s.key, minutes: 5 }), `adăugată: ${s.title}`);
    }
    case 'add_songs': {
      const titles = (Array.isArray(a.titles) ? a.titles : String(a.titles || '').split(/\n|;|,(?=\s*[A-ZĂÂÎȘȚ])/)).map(t => String(t).trim()).filter(Boolean).slice(0, 30);
      const keys = Array.isArray(a.keys) ? a.keys : [];
      const added = [], missing = [];
      titles.forEach((t, i) => { const s = hub.findSong?.(t);
        if (!s) { missing.push(t); return; }
        const err = hub.run({ type: 'addItem', kind: 'song', songId: s.id, key: keys[i] || s.key, minutes: 5 });
        err ? missing.push(t + ' (' + err + ')') : added.push(s.title); });
      return { added, missing, ...(missing.length ? { hint: 'Spune-i utilizatorului ce n-ai găsit; poate fi scris altfel sau nu e în bibliotecă.' } : {}) };
    }
    case 'pick_songs': {
      const n = Math.max(1, Math.min(15, Math.round(Number(a.count) || 3)));
      const picked = hub.pickSongs ? hub.pickSongs(n, a.tag || '', a.how || 'oricare') : [];
      if (!picked.length) return { error: 'Nu am găsit cântări' + (a.tag ? ' cu eticheta ' + a.tag : '') + '. Etichete existente: ' + (hub.tags?.() || []).join(', ') };
      const added = [];
      for (const s of picked) if (!hub.run({ type: 'addItem', kind: 'song', songId: s.id, key: s.key, minutes: 5 })) added.push(s.title);
      return { added };
    }
    case 'add_item_to_program': {
      const s = a.kind === 'other' || a.kind === 'song' ? hub.findSong?.(a.title || '', true) : null;   // a song title written as text → the real song
      if (s) return done(hub.run({ type: 'addItem', kind: 'song', songId: s.id, key: s.key, minutes: 5 }), `adăugată cântarea: ${s.title}`);
      return done(hub.run({ type: 'addItem', kind: a.kind, title: a.title, minutes: a.minutes || 5 }));
    }
    case 'remove_from_program': return done(hub.run({ type: 'removeItem', item: pos(a.position) }));
    case 'move_in_program': return done(hub.run({ type: 'moveItem', item: pos(a.from), to: pos(a.to) }));
    case 'set_key': return done(hub.run({ type: 'updateItem', item: pos(a.position), patch: { key: String(a.key || '') } }));
    case 'set_display': {
      const patch = { font: a.font, size: a.size, color: a.color, chordColor: a.chord_color, align: a.align, valign: a.valign,
        weight: a.weight, upper: a.upper, shadow: a.shadow, dim: a.dim, next: a.show_next };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
      if (a.position && a.screen !== 'stage') {
        const it = hub.state().program[pos(a.position)];
        if (!it) return { error: 'Nu există poziția ' + a.position };
        return done(hub.run({ type: 'itemDisplay', item: pos(a.position), patch: { ...(it.display || {}), ...patch } }));
      }
      return done(hub.run({ type: 'display', screen: a.screen === 'stage' ? 'stage' : 'main', patch }));
    }
    case 'set_song_tags': {
      const s = hub.song(a.song_id); if (!s) return { error: 'Nu există cântarea cu acest id.' };
      return done(hub.run({ type: 'saveSong', song: { ...s, tags: a.tags } }));
    }
    case 'list_backgrounds': return hub.media();
    case 'set_background': return done(hub.run({ type: 'background', value: a.name || '' }));
    case 'show_slide': return done(hub.run({ type: 'go', item: pos(a.position), slide: Math.max(0, Math.round(Number(a.slide || 1)) - 1) }));
    case 'set_service': return done(hub.run({ type: 'service', value: { ...(a.title ? { title: a.title } : {}), ...(a.starts_at ? { startsAt: new Date(a.starts_at).toISOString() } : {}) } }));
    case 'song_usage': {
      const list = hub.usage ? hub.usage(a.days, a.tag) : [];
      return list.sort((x, y) => x.count - y.count || x.last - y.last).slice(0, 80)
        .map(u => ({ id: u.id, title: u.title, key: u.key, tags: u.tags, sung: u.count, last: u.last ? new Date(u.last).toISOString().slice(0, 10) : 'niciodată' }));
    }
    case 'set_item': {
      const patch = {}; if (a.title) patch.title = String(a.title); if (Number.isFinite(Number(a.minutes))) patch.minutes = Number(a.minutes); if (a.leader !== undefined) patch.leader = String(a.leader);
      return done(hub.run({ type: 'updateItem', item: pos(a.position), patch }));
    }
    case 'get_song_structure': {
      const it = hub.state().program[pos(a.position)]; if (!it) return { error: 'Nu există poziția ' + a.position };
      return hub.structure ? hub.structure(pos(a.position)) : { error: 'indisponibil' };
    }
    case 'set_arrangement': {
      const st = hub.structure?.(pos(a.position)); if (!st || st.error) return st || { error: 'Nu e o cântare' };
      const names = st.sections.map(x => x.label.toLowerCase());
      const want = (Array.isArray(a.sections) ? a.sections : []).map(x => String(x).trim()).filter(Boolean);
      const bad = want.filter(w => !names.includes(w.toLowerCase()));
      if (bad.length) return { error: 'Secțiuni necunoscute: ' + bad.join(', ') + '. Există: ' + st.sections.map(x => x.label).join(', ') };
      const fix = w => st.sections.find(x => x.label.toLowerCase() === w.toLowerCase()).label;
      return done(hub.run({ type: 'arrangement', item: pos(a.position), value: want.length ? want.map(fix) : null }), want.length ? want.map(fix).join(' → ') : 'ordinea originală');
    }
    case 'set_track': {
      const st = hub.structure?.(pos(a.position)); if (!st || st.error) return st || { error: 'Nu e o cântare' };
      const q = String(a.track || '').toLowerCase();
      const stems = st.stems.map(x => ({ ...x }));
      const t = stems.find(x => x.name.toLowerCase() === q) || stems.find(x => x.name.toLowerCase().includes(q) || q.includes(x.name.toLowerCase()));
      if (!t) return { error: 'Track-ul nu există. Track-uri: ' + (stems.map(x => x.name).join(', ') || 'niciunul') };
      if (Number.isFinite(Number(a.volume))) t.vol = Math.min(1.5, Math.max(0, Number(a.volume) / 100));
      if (typeof a.muted === 'boolean') t.muted = a.muted;
      return done(hub.run({ type: 'setStems', item: pos(a.position), stems }), `${t.name}: ${Math.round(t.vol * 100)}%${t.muted ? ', mut' : ''}`);
    }
    default: return { error: 'unealtă necunoscută' };
  }
}

const jsonSchema = t => ({ type: 'object', properties: t.params, ...(t.required ? { required: t.required } : {}) });

// ------------------------------------------------------------------ Claude
async function claudeTurn(settings, messages, fetchImpl) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'x-api-key': settings.claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: settings.claudeModel || 'claude-sonnet-5-5', max_tokens: 1024, system: SYSTEM, messages,
      tools: TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: jsonSchema(t) })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'Cheia Claude nu e bună. Verific-o în setările asistentului.' : (j.error?.message || 'Eroare Claude ' + r.status));
  return j;
}

export async function runClaude(settings, history, hub, { fetchImpl = fetch, maxSteps = 12, images = [] } = {}) {
  if (!settings.claudeKey) throw new Error('Pune cheia Claude în setările asistentului (⚙).');
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  if (images?.length) { const last = messages.at(-1);       // a photo of a song list, a structure on paper…
    last.content = [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data } })), { type: 'text', text: last.content }]; }
  const actions = [];
  for (let step = 0; step < maxSteps; step++) {
    const res = await claudeTurn(settings, messages, fetchImpl);
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter(b => b.type === 'tool_use');
    if (!calls.length) return { reply: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), actions };
    messages.push({ role: 'user', content: calls.map(c => {
      const out = runTool(hub, c.name, c.input);
      if (!['get_state', 'search_songs', 'list_backgrounds', 'song_usage', 'get_song_structure'].includes(c.name)) actions.push(c.name);
      return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) };
    }) });
  }
  return { reply: 'Am făcut ce am putut; spune-mi dacă mai e ceva.', actions };
}

// ------------------------------------------------------------------ Ollama (local)
export async function runOllama(settings, history, hub, { fetchImpl = fetch, maxSteps = 12, images = [] } = {}) {
  const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const messages = [{ role: 'system', content: SYSTEM }, ...history.map(m => ({ role: m.role, content: m.content }))];
  if (images?.length) {                                       // the local model reads the photo first (a vision model), then works with the text
    const vm = settings.ollamaVisionModel || 'qwen2.5vl:7b';
    let r;
    try {
      r = await fetchImpl(`${base}/api/chat`, { method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: vm, stream: false, messages: [{ role: 'user', images: images.map(im => im.data),
          content: 'Transcrie exact textul din imagine (titluri de cântări, tonuri, structuri ca Strofa 1, Refren, Bridge, ordinea). Doar textul, fără comentarii.' }] }) });
    } catch { throw new Error('Nu găsesc AI-ul local. Instalează Ollama (ollama.com) și pornește-l.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.includes('not found') ? `Pentru poze, AI-ul local are nevoie de un model care vede. În Terminal: ollama pull ${vm}` : (j.error || 'Eroare AI local'));
    messages.at(-1).content += '\n\n[Textul din poză]\n' + (j.message?.content || '').trim();
  }
  const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: jsonSchema(t) } }));
  const actions = [];
  for (let step = 0; step < maxSteps; step++) {
    let r;
    try {
      r = await fetchImpl(`${base}/api/chat`, { method: 'POST', signal: AbortSignal.timeout(120000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: settings.ollamaModel || 'qwen2.5:7b', messages, tools, stream: false }) });
    } catch { throw new Error('Nu găsesc AI-ul local. Instalează Ollama (ollama.com) și pornește-l.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.includes('not found') ? `Modelul nu e instalat. În Terminal: ollama pull ${settings.ollamaModel || 'qwen2.5:7b'}` : (j.error || 'Eroare AI local'));
    const msg = j.message || {};
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) return { reply: (msg.content || '').trim(), actions };
    for (const c of calls) {
      let args = c.function?.arguments; if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      const out = runTool(hub, c.function?.name, args || {});
      if (!['get_state', 'search_songs', 'list_backgrounds', 'song_usage', 'get_song_structure'].includes(c.function?.name)) actions.push(c.function?.name);
      messages.push({ role: 'tool', content: JSON.stringify(out), tool_name: c.function?.name });
    }
  }
  return { reply: 'Am făcut ce am putut; spune-mi dacă mai e ceva.', actions };
}

/** provider: 'claude' | 'ollama' | 'auto' (Claude when there is a key and internet, otherwise the local model) */
export async function runAssistant(settings, history, hub, opts) {
  if (settings.provider === 'ollama') return runOllama(settings, history, hub, opts);
  if (settings.provider === 'claude' || !settings.provider) return runClaude(settings, history, hub, opts);
  if (settings.claudeKey) {
    try { return await runClaude(settings, history, hub, opts); }
    catch (e) { if (!/fetch|network|internet|timeout|ENOTFOUND|aborted/i.test(e.message + (e.cause?.code || ''))) throw e; }
  }
  try { return await runOllama(settings, history, hub, opts); }
  catch (e) {
    if (!settings.claudeKey && /Nu găsesc/.test(e.message)) throw new Error('Asistentul nu are încă un AI: pune cheia Claude la ⚙, sau instalează Ollama (ollama.com) pe acest PC sau pe serverul bisericii.');
    throw e;
  }
}

// ---- Feedback → a proposal for how to develop the app ------------------------------------------------
const FEEDBACK_SYSTEM = `Ești analistul de produs al aplicației „Echipa Betleem” (planificare servicii, proiecție versuri/prezentări, MD&TRACK pentru trupă cu track-uri și mixer, telefoane cu acorduri, asistent AI). Utilizatorii sunt voluntari dintr-o biserică, nu programatori.
Primești o părere (feedback) de la un utilizator, cu locul din aplicație unde era. Răspunde în română, scurt și concret, EXACT în acest format:
Problema: <ce nu merge sau ce lipsește, într-o propoziție>
Propunere: <ce să schimbăm în aplicație, concret: unde, ce buton, ce face>
Pași: <2-4 pași mici de implementare, numerotați>
Cât de important: <mare / mediu / mic> — <de ce, o propoziție>
Întrebare: <o întrebare pentru utilizator dacă ceva nu e clar, altfel „—”>
Nu promite că e gata; e o propunere pentru echipa care dezvoltă aplicația.`;

/** One question to the AI, no tools: used to turn feedback into a development proposal. */
export async function askAI(settings, system, text, { fetchImpl = fetch } = {}) {
  const claude = async () => {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'x-api-key': settings.claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.claudeModel || 'claude-sonnet-5-5', max_tokens: 900, system, messages: [{ role: 'user', content: text }] }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Eroare Claude ' + r.status);
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  };
  const ollama = async () => {
    const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    let r; try { r = await fetchImpl(`${base}/api/chat`, { method: 'POST', signal: AbortSignal.timeout(120000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: settings.ollamaModel || 'qwen2.5:7b', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: text }] }) }); }
    catch { throw new Error('Nu găsesc AI-ul local (Ollama).'); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Eroare AI local'); return String(j.message?.content || '').trim();
  };
  if (settings.provider === 'ollama') return ollama();
  if (settings.claudeKey) { try { return await claude(); } catch (e) { if (settings.provider === 'claude') throw e; } }
  return ollama();
}
export const feedbackProposal = (settings, text, where, opts) => askAI(settings, FEEDBACK_SYSTEM, `Unde era: ${where || 'necunoscut'}\nPărerea: ${text}`, opts);
