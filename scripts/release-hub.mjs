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
  execFileSync('gh', ['release', 'create', 'v' + m.version, `${outDir}/betleem-hub.tgz`, `${outDir}/betleem-hub.json`,
    '--repo', repo, '--title', 'Betleem ' + m.version, '--notes', 'Actualizare Betleem ' + m.version], { stdio: 'inherit' });
}
