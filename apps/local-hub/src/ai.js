// Betleem assistant: chat in Romanian, it changes the app through the same commands the
// operator uses (program, songs, tags, look of the screens, backgrounds, live slides).
// Works with Claude (API key) or a local model through Ollama.

const SYSTEM = `Ești asistentul aplicației Betleem, folosită de o biserică pentru proiecția versurilor și programul serviciului.
Vorbești în română, scurt și prietenos. Faci lucrurile cerute folosind uneltele, apoi spui în una-două propoziții ce ai făcut.
Reguli:
- Când nu știi ce e acum în program sau pe ecrane, apelează întâi get_state.
- Pentru cântări folosește search_songs (caută după titlu, vers sau etichetă) și folosește id-urile primite. Nu inventa id-uri.
- Pozițiile din program încep de la 1.
- Mărimea textului e în procente din înălțimea ecranului: 2.5 foarte mic, 6 normal pe proiector, 9 mare, 12 foarte mare.
- „Sală”/„proiector”/„ecranul mare” = screen "main". „Scenă”/„monitor”/„muzicieni” = screen "stage".
- Dacă cererea e neclară sau ar șterge mult, întreabă înainte.`;

export const TOOLS = [
  { name: 'get_state', description: 'Programul serviciului, ce e pe ecran acum și setările de aspect ale ecranelor.', params: {} },
  { name: 'search_songs', description: 'Caută cântări în bibliotecă după titlu sau vers și/sau după etichetă (ex. Laudă, Adorare).',
    params: { query: { type: 'string', description: 'text de căutat (poate lipsi)' }, tag: { type: 'string', description: 'etichetă (poate lipsi)' } } },
  { name: 'add_song_to_program', description: 'Adaugă o cântare la sfârșitul programului.',
    params: { song_id: { type: 'string' }, key: { type: 'string', description: 'tonul pentru acest serviciu, opțional' } }, required: ['song_id'] },
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
  { name: 'set_service', description: 'Schimbă titlul serviciului și/sau data și ora (ISO, ex. 2026-11-22T10:00).', params: { title: { type: 'string' }, starts_at: { type: 'string' } } },
];

/** Run a tool against the hub. `hub` = { state(), run(msg) -> error|null, searchSongs(q, tag), media(), song(id) } */
export function runTool(hub, name, a = {}) {
  const pos = p => Math.round(Number(p)) - 1;
  const done = (err, ok) => err ? { error: err } : { ok: ok || 'gata' };
  switch (name) {
    case 'get_state': return hub.state();
    case 'search_songs': return hub.searchSongs(a.query || '', a.tag || '').slice(0, 25);
    case 'add_song_to_program': {
      const s = hub.song(a.song_id); if (!s) return { error: 'Nu există cântarea cu acest id. Folosește search_songs.' };
      return done(hub.run({ type: 'addItem', kind: 'song', songId: s.id, key: a.key || s.key, minutes: 5 }), `adăugată: ${s.title}`);
    }
    case 'add_item_to_program': return done(hub.run({ type: 'addItem', kind: a.kind, title: a.title, minutes: a.minutes || 5 }));
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

export async function runClaude(settings, history, hub, { fetchImpl = fetch, maxSteps = 8 } = {}) {
  if (!settings.claudeKey) throw new Error('Pune cheia Claude în setările asistentului (⚙).');
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  const actions = [];
  for (let step = 0; step < maxSteps; step++) {
    const res = await claudeTurn(settings, messages, fetchImpl);
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter(b => b.type === 'tool_use');
    if (!calls.length) return { reply: res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(), actions };
    messages.push({ role: 'user', content: calls.map(c => {
      const out = runTool(hub, c.name, c.input);
      if (c.name !== 'get_state' && c.name !== 'search_songs' && c.name !== 'list_backgrounds') actions.push(c.name);
      return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) };
    }) });
  }
  return { reply: 'Am făcut ce am putut; spune-mi dacă mai e ceva.', actions };
}

// ------------------------------------------------------------------ Ollama (local)
export async function runOllama(settings, history, hub, { fetchImpl = fetch, maxSteps = 8 } = {}) {
  const base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const messages = [{ role: 'system', content: SYSTEM }, ...history.map(m => ({ role: m.role, content: m.content }))];
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
      if (!['get_state', 'search_songs', 'list_backgrounds'].includes(c.function?.name)) actions.push(c.function?.name);
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
