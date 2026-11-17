import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistant, runTool } from '../src/ai.js';

function fakeHub() {
  const log = [];
  return {
    log,
    state: () => ({ program: [{ position: 1, kind: 'song', title: 'Maranata' }], display: {} }),
    run: m => { log.push(m); return null; },
    searchSongs: q => [{ id: 's1', title: 'Biruitor', tags: ['Laudă'] }].filter(s => !q || s.title.toLowerCase().includes(q.toLowerCase())),
    media: () => ['01 Noapte violet.jpg'],
    song: id => id === 's1' ? { id: 's1', title: 'Biruitor', key: 'C', body: 'x' } : null,
  };
}

test('tools map to the same commands the operator uses', () => {
  const hub = fakeHub();
  runTool(hub, 'set_display', { screen: 'stage', align: 'center', size: 6 });
  runTool(hub, 'add_song_to_program', { song_id: 's1' });
  runTool(hub, 'show_slide', { position: 1, slide: 2 });
  assert.deepEqual(hub.log, [
    { type: 'display', screen: 'stage', patch: { align: 'center', size: 6 } },
    { type: 'addItem', kind: 'song', songId: 's1', key: 'C', minutes: 5 },
    { type: 'go', item: 0, slide: 1 },
  ]);
  assert.match(runTool(hub, 'add_song_to_program', { song_id: 'nu-exista' }).error, /search_songs/);
});

test('Claude: tool calls run, then the reply comes back', async () => {
  const hub = fakeHub();
  const turns = [
    { content: [{ type: 'tool_use', id: 't1', name: 'search_songs', input: { query: 'biruitor' } }] },
    { content: [{ type: 'tool_use', id: 't2', name: 'add_song_to_program', input: { song_id: 's1' } },
                { type: 'tool_use', id: 't3', name: 'set_display', input: { screen: 'stage', align: 'center' } }] },
    { content: [{ type: 'text', text: 'Am adăugat Biruitor și am pus Scena pe mijloc.' }] },
  ];
  const sent = [];
  const fetchImpl = async (url, opt) => { sent.push(JSON.parse(opt.body)); assert.equal(opt.headers['x-api-key'], 'k'); return { ok: true, status: 200, json: async () => turns.shift() }; };
  const r = await runAssistant({ provider: 'claude', claudeKey: 'k' }, [{ role: 'user', content: 'adaugă Biruitor și scena pe mijloc' }], hub, { fetchImpl });
  assert.equal(r.reply, 'Am adăugat Biruitor și am pus Scena pe mijloc.');
  assert.deepEqual(r.actions, ['add_song_to_program', 'set_display']);
  assert.equal(hub.log.length, 2);
  assert.equal(sent[1].messages.at(-1).content[0].type, 'tool_result');
  assert.ok(sent[0].tools.some(t => t.name === 'set_display' && t.input_schema.type === 'object'));
});

test('Ollama: same tools through the local model', async () => {
  const hub = fakeHub();
  const turns = [
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'set_display', arguments: { screen: 'main', size: 9 } } }] } },
    { message: { role: 'assistant', content: 'Gata, textul e mai mare.' } },
  ];
  const r = await runAssistant({ provider: 'ollama' }, [{ role: 'user', content: 'mai mare' }], hub,
    { fetchImpl: async () => ({ ok: true, json: async () => turns.shift() }) });
  assert.equal(r.reply, 'Gata, textul e mai mare.');
  assert.deepEqual(hub.log, [{ type: 'display', screen: 'main', patch: { size: 9 } }]);
});

test('auto: no key -> local model; missing key with claude gives a clear message', async () => {
  const hub = fakeHub();
  let called = '';
  const r = await runAssistant({ provider: 'auto' }, [{ role: 'user', content: 'salut' }], hub,
    { fetchImpl: async url => { called = url; return { ok: true, json: async () => ({ message: { role: 'assistant', content: 'Salut!' } }) }; } });
  assert.match(called, /11434/); assert.equal(r.reply, 'Salut!');
  await assert.rejects(runAssistant({ provider: 'claude' }, [{ role: 'user', content: 'x' }], hub), /cheia Claude/);
});
