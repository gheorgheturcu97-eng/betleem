import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createUpdater, newer, pack, verify } from '../src/updater.js';

test('versions compare as numbers', () => {
  assert.ok(newer('2026.11.20.2', '2026.11.20.1'));
  assert.ok(newer('2026.12.1.1', '2026.11.30.9'));
  assert.ok(!newer('2026.11.20.1', '2026.11.20.1'));
  assert.ok(!newer('', '2026.1.1'));
});

test('a signed package installs next to the running one; a changed or unsigned one never does', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'betleem-upd-'));
  const hub = path.join(tmp, 'hub'); fs.mkdirSync(path.join(hub, 'src'), { recursive: true });
  fs.writeFileSync(path.join(hub, 'src', 'server.js'), '// v2');
  fs.writeFileSync(path.join(hub, 'package.json'), JSON.stringify({ version: '2026.12.1.1' }));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const manifest = await pack(hub, path.join(tmp, 'out'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const buf = fs.readFileSync(path.join(tmp, 'out', 'betleem-hub.tgz'));
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  assert.ok(verify(manifest, buf, pub));
  const bad = Buffer.concat([buf, Buffer.from('x')]);
  assert.ok(!verify(manifest, bad, pub), 'changed bytes');
  assert.ok(!verify({ ...manifest, version: '2099.1.1.1' }, buf, pub), 'changed version');
  const states = [];
  const data = path.join(tmp, 'data');
  const u = createUpdater({ root: hub, dataDir: data, version: '2026.11.20.1', publicKey: pub, onState: s => states.push(s) });
  assert.equal(await u.install(manifest, bad, 'test'), false);
  assert.equal(await u.install(manifest, buf, 'test'), true);
  assert.equal(fs.readFileSync(path.join(data, 'update', 'hub', 'src', 'server.js'), 'utf8'), '// v2');
  assert.equal(states.at(-1).ready, '2026.12.1.1');
  assert.equal(u.packageForPeers().manifest.version, '2026.12.1.1', 'can pass it on to the next computer');
  assert.equal(await u.install(manifest, buf, 'test'), false, 'not twice');
});
