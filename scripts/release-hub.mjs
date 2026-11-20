// Publish a Betleem update: pack + sign the hub folder, then (with gh) upload it as a GitHub release.
//   node scripts/release-hub.mjs <hubDir> <outDir> <privateKey.pem> [owner/repo]
// Every Betleem checks the latest release, verifies the signature, and passes it on in the church network.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pack } from '../apps/local-hub/src/updater.js';

const [hubDir, outDir, keyPath, repo] = process.argv.slice(2);
if (!hubDir || !outDir || !keyPath) { console.error('folosire: node scripts/release-hub.mjs <hub> <out> <cheie.pem> [owner/repo]'); process.exit(1); }
const m = await pack(hubDir, outDir, fs.readFileSync(keyPath, 'utf8'));
console.log('pregătit', m.version, m.sha256.slice(0, 12));
if (repo) {
  // the "actualizari" branch holds only the newest package (replaced each time, so the repository stays small)
  const dir = fs.mkdtempSync('/tmp/betleem-rel-'), git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'inherit' });
  git('init', '-q', '-b', 'actualizari');
  fs.copyFileSync(`${outDir}/betleem-hub.tgz`, `${dir}/betleem-hub.tgz`); fs.copyFileSync(`${outDir}/betleem-hub.json`, `${dir}/betleem-hub.json`);
  fs.writeFileSync(`${dir}/README.md`, `# Actualizări Betleem\n\nVersiunea ${m.version}. Fiecare Betleem verifică aici, descarcă, verifică semnătura și se actualizează singur.\n`);
  git('add', '-A'); git('-c', 'user.name=Betleem', '-c', 'user.email=betleem@users.noreply.github.com', 'commit', '-qm', 'Betleem ' + m.version);
  git('push', '-f', `https://github.com/${repo}`, 'actualizari');
  console.log('publicat pe', repo, 'ramura actualizari');
}
