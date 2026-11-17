// Minimal Supabase client (auth + REST + RPC) with no dependencies.
// Keeps the session (refresh token) so the desktop app stays signed in.

const AUTH_MESSAGES = {
  invalid_credentials: 'Email sau parolă greșită',
  user_already_exists: 'Există deja un cont cu acest email. Apasă „Intră”.',
  email_exists: 'Există deja un cont cu acest email. Apasă „Intră”.',
  weak_password: 'Parola trebuie să aibă cel puțin 6 caractere',
  email_not_confirmed: 'Contul nu e confirmat. În Supabase oprește „Confirm email” și încearcă din nou.',
  signup_disabled: 'Crearea de conturi e oprită în Supabase (Authentication → Sign In / Providers).',
  validation_failed: 'Email sau parolă invalidă',
};

export function createCloud({ url, key, session = null, onSession = () => {}, fetchImpl = fetch }) {
  if (!/^https?:\/\//.test(url || '')) throw new Error('Adresa proiectului trebuie să înceapă cu https://');
  if (!key) throw new Error('Lipsește cheia proiectului (anon / publishable key)');
  const base = url.replace(/\/+$/, '');
  let s = session;

  async function auth(path, body) {
    let r;
    try {
      r = await fetchImpl(`${base}/auth/v1/${path}`, {
        method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('Nu mă pot conecta la internet sau la Supabase'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = j.error_code || j.code || j.error;
      throw new Error(AUTH_MESSAGES[code] || j.msg || j.error_description || j.message || `Eroare de conectare (${r.status})`);
    }
    return j;
  }
  function keep(j) {
    s = {
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user: { id: j.user?.id ?? s?.user?.id, email: j.user?.email ?? s?.user?.email },
    };
    onSession(s);
    return s;
  }
  async function token() {
    if (!s) throw new Error('Nu ești conectat');
    if (s.expires_at - 60 < Date.now() / 1000) keep(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
    return s.access_token;
  }
  async function req(method, path, body, headers = {}) {
    const t = await token();
    let r;
    try {
      r = await fetchImpl(`${base}/rest/v1/${path}`, {
        method, signal: AbortSignal.timeout(20000),
        headers: { apikey: key, authorization: `Bearer ${t}`, 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error('Fără internet. Lucrez local și sincronizez când revine.'); }
    const text = await r.text();
    const j = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error(j?.message || `Eroare ${r.status}`);
    return j;
  }

  return {
    get session() { return s; },
    get email() { return s?.user?.email || ''; },
    async signUp(email, password) {
      const j = await auth('signup', { email, password });
      if (!j.access_token) throw new Error(AUTH_MESSAGES.email_not_confirmed);
      return keep(j);
    },
    async signIn(email, password) { return keep(await auth('token?grant_type=password', { email, password })); },
    signOut() { s = null; onSession(null); },
    rpc: (fn, args = {}) => req('POST', `rpc/${fn}`, args),
    select: (pathAndQuery) => req('GET', pathAndQuery),
    upsert: (table, rows) => req('POST', `${table}?on_conflict=id`, rows, { prefer: 'resolution=merge-duplicates,return=representation' }),
  };
}
