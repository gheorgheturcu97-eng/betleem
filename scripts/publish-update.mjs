// Publish a Betleem update in one command (used by Claude Code or by hand).
//   node scripts/publish-update.mjs <cheie-privata.pem>            → new version, signed, pushed to the "actualizari" branch
//   node scripts/publish-update.mjs <cheie-privata.pem> --local    → only builds build/out (nothing is published)
// The key never goes into the repository. On the leader's Mac it is in Documents/Betleem/cheie-actualizari/.
// Every Betleem checks the branch every 30 minutes, verifies the signature and updates at the next start.
import fs from 'node:fs';
import path from 'node:path';
import nodeModule from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB = path.join(ROOT, 'apps/local-hub');
const [keyPath, ...flags] = process.argv.slice(2);
const local = flags.includes('--local');
if (!keyPath || !fs.existsSync(keyPath)) { console.error('folosire: node scripts/publish-update.mjs <cheie-privata.pem> [--local]'); process.exit(1); }

// 1. tests first: a broken update must never reach a church on Sunday
execFileSync('npm', ['test'], { cwd: HUB, stdio: 'inherit' });

// 2. next version: YYYY.MM.DD.N (N grows during the same day)
const pkgFile = path.join(HUB, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const d = new Date(), today = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
const [y, m, dd, n] = String(pkg.version).split('.');
pkg.version = `${y}.${m}.${dd}` === today ? `${today}.${Number(n || 0) + 1}` : `${today}.1`;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log('versiunea', pkg.version);

// 3. the package folder: exactly what an installed Betleem runs (never starter/: the song lyrics stay out of public updates)
const stage = path.join(ROOT, 'build/hub');
fs.rmSync(path.join(ROOT, 'build'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const p of ['src', 'public', 'bibles', 'backgrounds', 'package.json'])
  if (fs.existsSync(path.join(HUB, p))) fs.cpSync(path.join(HUB, p), path.join(stage, p), { recursive: true });
fs.cpSync(path.join(HUB, 'node_modules/ws'), path.join(stage, 'node_modules/ws'), { recursive: true });
fs.mkdirSync(path.join(stage, 'core-dist'));
fs.writeFileSync(path.join(stage, 'core-dist/song.js'),
  nodeModule.stripTypeScriptTypes(fs.readFileSync(path.join(ROOT, 'packages/core/src/song.ts'), 'utf8')));

// 4. sign and (unless --local) publish
execFileSync('node', [path.join(ROOT, 'scripts/release-hub.mjs'), stage, path.join(ROOT, 'build/out'), keyPath,
  ...(local ? [] : ['gheorgheturcu97-eng/betleem'])], { stdio: 'inherit' });
console.log(local ? 'gata local: build/out (nepublicat)' : `publicat ${pkg.version}. Commit + push pentru cod: git add -A && git commit && git push`);
