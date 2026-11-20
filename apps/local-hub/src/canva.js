// Canva: the church's designs straight into the program.
// The leader makes a free "integration" at canva.dev once (Client ID + Secret, kept only on this computer),
// signs in with Canva in the browser, then picks a design: every page comes in as a slide (PNG, 1920 wide).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AUTH = 'https://www.canva.com/api/oauth/authorize';
const API = 'https://api.canva.com/rest/v1';
const SCOPES = 'design:meta:read design:content:read profile:read';

export function createCanva({ dataDir, port, mediaDir, log = () => {} }) {
  const FILE = path.join(dataDir, 'canva.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
  const write = v => { fs.writeFileSync(FILE, JSON.stringify(v, null, 1), { mode: 0o600 }); };
  const redirect = `http://127.0.0.1:${port}/api/canva/callback`;
  const pending = new Map();                                   // state -> { verifier, at }

  function status() {
    const c = read();
    return { configured: !!(c.clientId && c.clientSecret), connected: !!c.refresh, user: c.user || '', redirect };
  }
  function setCredentials({ clientId, clientSecret }) {
    const c = read();
    if (typeof clientId === 'string') c.clientId = clientId.trim().slice(0, 200);
    if (typeof clientSecret === 'string' && clientSecret.trim()) c.clientSecret = clientSecret.trim().slice(0, 400);
    delete c.refresh; delete c.access; delete c.expires; delete c.user;
    write(c); return status();
  }
  function disconnect() { const c = read(); delete c.refresh; delete c.access; delete c.expires; delete c.user; write(c); return status(); }

  /** The address the leader opens in the browser to say "yes, Betleem may read my designs". */
  function loginUrl() {
    const c = read(); if (!c.clientId) throw new Error('Pune întâi Client ID și Secret');
    const verifier = crypto.randomBytes(64).toString('base64url');
    const state = crypto.randomBytes(24).toString('base64url');
    pending.set(state, { verifier, at: Date.now() });
    for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60_000) pending.delete(k);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const q = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 'S256', scope: SCOPES, response_type: 'code',
      client_id: c.clientId, state, redirect_uri: redirect });
    return `${AUTH}?${q}`;
  }

  async function token(params) {
    const c = read();
    const r = await fetch(`${API}/oauth/token`, { method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('Canva nu a acceptat conectarea' + (j.error_description || j.message ? ': ' + (j.error_description || j.message) : ''));
    Object.assign(c, { access: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 - 60_000, ...(j.refresh_token ? { refresh: j.refresh_token } : {}) });
    write(c); return c;
  }

  async function callback(state, code) {
    const p = pending.get(state); pending.delete(state);
    if (!p || !code) throw new Error('Conectarea a expirat. Încearcă din nou.');
    await token({ grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: redirect });
    try { const me = await call('/users/me/profile'); const c = read(); c.user = me.profile?.display_name || ''; write(c); } catch {}
  }

  async function access() {
    let c = read();
    if (!c.refresh && !c.access) throw new Error('Canva nu e conectat');
    if (!c.access || Date.now() > (c.expires || 0)) c = await token({ grant_type: 'refresh_token', refresh_token: c.refresh });  // each refresh token works once: the new one is saved
    return c.access;
  }
  async function call(p, opts = {}) {
    const r = await fetch(API + p, { ...opts, headers: { authorization: 'Bearer ' + await access(), 'content-type': 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { const c = read(); delete c.access; write(c); }
    if (!r.ok) throw new Error('Canva: ' + (j.message || j.error?.message || r.status));
    return j;
  }

  /** The leader's designs, newest first; search by title. */
  async function designs(query = '', continuation = '') {
    const q = new URLSearchParams({ ownership: 'any', sort_by: 'modified_descending' });
    if (query) q.set('query', String(query).slice(0, 100));
    if (continuation) q.set('continuation', continuation);
    const j = await call('/designs?' + q);
    return { items: (j.items || []).map(d => ({ id: d.id, title: d.title || 'Fără titlu', thumb: d.thumbnail?.url || '', pages: d.page_count || 0, updated: d.updated_at || 0 })), continuation: j.continuation || '' };
  }

  /** Every page of a design as a picture in the media folder; returns the slide addresses. */
  async function importDesign(id, title = 'Canva', progress = () => {}) {
    if (!/^[\w-]{4,60}$/.test(id)) throw new Error('Design greșit');
    let job = (await call('/exports', { method: 'POST', body: JSON.stringify({ design_id: id, format: { type: 'png', width: 1920 } }) })).job;
    for (let n = 0; job?.status === 'in_progress' && n < 90; n++) {
      progress('Canva pregătește paginile…');
      await new Promise(r => setTimeout(r, 2000));
      job = (await call('/exports/' + encodeURIComponent(job.id))).job;
    }
    if (job?.status !== 'success' || !job.urls?.length) throw new Error('Canva nu a putut exporta designul' + (job?.error?.message ? ': ' + job.error.message : ''));
    const base = 'pres-canva-' + String(title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Date.now().toString(36);
    const slides = [];
    for (const [i, u] of job.urls.entries()) {
      const url = new URL(u); if (url.protocol !== 'https:') continue;
      const buf = Buffer.from(await fetch(url, { signal: AbortSignal.timeout(60_000) }).then(r => { if (!r.ok) throw new Error('Nu am putut descărca pagina ' + (i + 1)); return r.arrayBuffer(); }));
      const name = `${base}-${String(i + 1).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(mediaDir, name), buf);
      slides.push('/media/' + name);
    }
    return { title, slides };
  }

  return { status, setCredentials, disconnect, loginUrl, callback, designs, importDesign, redirect };
}
