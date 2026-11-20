// Updates that install themselves.
// 1. From the internet: the newest version on GitHub, branch "actualizari" (betleem-hub.tgz + betleem-hub.json).
// 2. In the church network: a Betleem that already has a newer version gives it to the others, no internet needed.
// Every package is signed; a package without a valid signature is never installed, wherever it came from.
// A new version is unpacked next to the running one and used from the next start; if it does not start,
// the desktop app falls back to the version inside the app.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAFc9Dhzjmu1rhomiT3Z/s8HOM3dPl+GNA8h9IYHbUz8Y=
-----END PUBLIC KEY-----`;
const PARTS = ['src', 'public', 'bibles', 'backgrounds', 'core-dist', 'package.json', 'node_modules'];   // never starter/: the songs stay in the installer

/** "2026.11.20.2" > "2026.11.20.1" */
export function newer(a, b) {
  const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** The manifest says which version and which bytes; the signature proves it was made by us. */
export function verify(manifest, buf, key = PUBLIC_KEY) {
  if (!manifest?.version || !manifest.sha256 || !manifest.sig) return false;
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== manifest.sha256) return false;
  try { return crypto.verify(null, Buffer.from(`${manifest.version}\n${manifest.sha256}`), key, Buffer.from(manifest.sig, 'base64')); }
  catch { return false; }
}

const run = (cmd, args, opts = {}) => new Promise((ok, no) => execFile(cmd, args, { timeout: 120000, ...opts }, (e, out) => e ? no(e) : ok(out)));

export function createUpdater({ root, dataDir, version, repo, publicKey = PUBLIC_KEY, onState = () => {}, log = () => {} }) {
  const UPDATE_DIR = path.join(dataDir, 'update');
  const state = { version, available: '', ready: '', checking: false, error: '', from: '' };
  let installing = false;
  const set = patch => { Object.assign(state, patch); onState({ ...state }); };

  async function install(manifest, buf, from) {
    if (installing || !newer(manifest.version, state.ready || version)) return false;
    if (!verify(manifest, buf, publicKey)) { log('update', new Error('pachet fără semnătură validă de la ' + from)); return false; }
    installing = true;
    try {
      fs.mkdirSync(UPDATE_DIR, { recursive: true });
      const tgz = path.join(UPDATE_DIR, 'hub-next.tgz'), next = path.join(UPDATE_DIR, 'hub-next');
      fs.rmSync(next, { recursive: true, force: true }); fs.mkdirSync(next);
      fs.writeFileSync(tgz, buf);
      await run('tar', ['-xzf', tgz, '-C', next]);
      const pkg = JSON.parse(fs.readFileSync(path.join(next, 'package.json'), 'utf8'));
      if (pkg.version !== manifest.version || !fs.existsSync(path.join(next, 'src', 'server.js'))) throw new Error('pachetul nu e complet');
      fs.writeFileSync(path.join(next, 'update.json'), JSON.stringify(manifest));      // so this computer can pass it on
      fs.copyFileSync(tgz, path.join(next, 'update.tgz'));
      fs.rmSync(tgz, { force: true });
      // swap: the running files are already in memory; the new ones are used from the next start
      const cur = path.join(UPDATE_DIR, 'hub'), old = path.join(UPDATE_DIR, 'hub-vechi');
      fs.rmSync(old, { recursive: true, force: true });
      if (fs.existsSync(cur)) fs.renameSync(cur, old);
      fs.renameSync(next, cur);
      set({ ready: manifest.version, available: manifest.version, from, error: '' });
      return true;
    } catch (e) { log('update', e); set({ error: 'Actualizarea nu s-a putut instala: ' + e.message }); return false; }
    finally { installing = false; }
  }

  async function fromGithub() {
    if (!repo) return;
    set({ checking: true });
    try {
      // the newest version sits on the "actualizari" branch of the repository (plain files, no account needed)
      const base = `https://raw.githubusercontent.com/${repo}/actualizari/`;
      const r = await fetch(base + 'betleem-hub.json?t=' + Date.now(), { headers: { 'user-agent': 'Betleem', 'cache-control': 'no-cache' } });
      if (!r.ok) return;
      const manifest = await r.json(), tUrl = base + 'betleem-hub.tgz?v=' + encodeURIComponent(manifest.version);
      if (!newer(manifest.version, state.ready || version)) return;
      set({ available: manifest.version });
      const buf = Buffer.from(await fetch(tUrl).then(x => x.arrayBuffer()));
      await install(manifest, buf, 'internet');
    } catch (e) { /* offline: try again later */ }
    finally { set({ checking: false }); }
  }

  /** Another Betleem in the network says it has `peerVersion`: take it from there. */
  async function fromPeer(url, peerVersion) {
    if (!newer(peerVersion, state.ready || version) || installing) return;
    try {
      const manifest = await fetch(url + '/api/update/manifest').then(r => r.ok ? r.json() : null);
      if (!manifest || !newer(manifest.version, state.ready || version)) return;
      const buf = Buffer.from(await fetch(url + '/api/update/package').then(r => r.arrayBuffer()));
      await install(manifest, buf, url.replace('http://', ''));
    } catch {}
  }

  /** What this computer can give to the others: the signed package it was installed from. */
  function packageForPeers() {
    const dir = root;
    const m = path.join(dir, 'update.json'), t = path.join(dir, 'update.tgz');
    if (fs.existsSync(m) && fs.existsSync(t)) return { manifest: JSON.parse(fs.readFileSync(m, 'utf8')), file: t };
    const n = path.join(UPDATE_DIR, 'hub');                                         // installed but not restarted yet
    if (fs.existsSync(path.join(n, 'update.json'))) return { manifest: JSON.parse(fs.readFileSync(path.join(n, 'update.json'), 'utf8')), file: path.join(n, 'update.tgz') };
    return null;
  }

  return { state, fromGithub, fromPeer, packageForPeers, install };
}

/** For whoever publishes: pack a hub folder and sign it with the private key. */
export async function pack(hubDir, outDir, privateKeyPem) {
  const version = JSON.parse(fs.readFileSync(path.join(hubDir, 'package.json'), 'utf8')).version;
  fs.mkdirSync(outDir, { recursive: true });
  const tgz = path.join(outDir, 'betleem-hub.tgz');
  await run('tar', ['-czf', tgz, '-C', hubDir, ...PARTS.filter(p => fs.existsSync(path.join(hubDir, p)))]);
  const buf = fs.readFileSync(tgz), sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sig = crypto.sign(null, Buffer.from(`${version}\n${sha256}`), privateKeyPem).toString('base64');
  const manifest = { version, sha256, sig, date: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'betleem-hub.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
