/* Pulse sync: Google Health API v4 (the successor of the Fitbit Web API; serves Google Health app / Fitbit data).
   Browser-only: Google OAuth 2.0 token flow (response_type=token) via full-page redirect. No backend, no secrets.
   Tokens and synced data stay in this browser's localStorage. */
(function () {
  'use strict';
  const M = window.PulseMetrics;
  const TOKEN_KEY = 'pulse.gh.token', STATE_KEY = 'pulse.gh.oauthState', CID_KEY = 'pulse.gh.clientId',
    CACHE_KEY = 'pulse.gh.cache', META_KEY = 'pulse.gh.meta';
  const API = 'https://health.googleapis.com/v4/users/me/';
  const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const SCOPES = [
    'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
    'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
    'email'
  ];
  const MIN_INTERVAL = 10 * 60 * 1000; // don't auto-refetch more often than every 10 minutes
  const SILENT_GAP = 10 * 60 * 1000;

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; };

  function redirectUri() {
    let p = location.pathname.replace(/index\.html$/, '');
    if (!p.endsWith('/')) p += '/';
    return location.origin + p;
  }
  function clientId() {
    const cfg = (window.PULSE_CONFIG && window.PULSE_CONFIG.GOOGLE_CLIENT_ID || '').trim();
    return cfg || (localStorage.getItem(CID_KEY) || '').trim();
  }
  function clientIdSource() { return (window.PULSE_CONFIG && (window.PULSE_CONFIG.GOOGLE_CLIENT_ID || '').trim()) ? 'config' : (localStorage.getItem(CID_KEY) ? 'settings' : null); }
  function setClientId(v) { v = (v || '').trim(); if (v) localStorage.setItem(CID_KEY, v); else localStorage.removeItem(CID_KEY); }
  const validClientId = (v) => /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(v || '');

  function token() { return read(TOKEN_KEY, null); }
  function tokenValid() { const t = token(); return !!(t && t.access_token && t.expires_at > Date.now() + 60 * 1000); }
  function meta() { return read(META_KEY, {}); }
  function setMeta(patch) { write(META_KEY, Object.assign(meta(), patch)); }
  function status() {
    const m = meta(), t = token();
    if (!clientId()) return 'no-client';
    if (tokenValid()) return 'connected';
    if (m.linked) return 'expired';
    return 'disconnected';
  }

  function randomState() {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  /** Full-page redirect to Google's consent screen. silent=true uses prompt=none (no UI if already consented). */
  function connect(opts = {}) {
    const cid = clientId();
    if (!cid) throw new Error('no-client-id');
    const state = randomState();
    write(STATE_KEY, { state, at: Date.now(), silent: !!opts.silent, returnTab: opts.returnTab || 'today' });
    const p = new URLSearchParams({
      client_id: cid, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPES.join(' '),
      include_granted_scopes: 'true', state
    });
    if (opts.silent) p.set('prompt', 'none');
    const m = meta(); if (m.email) p.set('login_hint', m.email);
    if (opts.silent) setMeta({ lastSilentAt: Date.now() });
    location.assign(AUTH_URL + '?' + p.toString());
  }

  /** Handle the OAuth redirect (#access_token=... or #error=...). Returns {handled, ok, error, returnTab}. */
  function handleRedirect() {
    const h = location.hash.slice(1);
    if (!/(^|&)(access_token|error)=/.test(h)) return { handled: false };
    const q = new URLSearchParams(h);
    const saved = read(STATE_KEY, null);
    write(STATE_KEY, null);
    const clean = () => { try { history.replaceState(null, '', location.pathname + location.search + '#' + ((saved && saved.returnTab) || 'today')); } catch (e) { location.hash = ''; } };
    if (!saved || q.get('state') !== saved.state) { clean(); return { handled: true, ok: false, error: 'state_mismatch' }; }
    if (q.get('error')) {
      const err = q.get('error');
      if (saved.silent) setMeta({ needsReconnect: true });
      clean(); return { handled: true, ok: false, error: err, silent: saved.silent, returnTab: saved.returnTab };
    }
    const at = q.get('access_token'), exp = parseInt(q.get('expires_in') || '3600', 10);
    write(TOKEN_KEY, { access_token: at, expires_at: Date.now() + exp * 1000, scope: q.get('scope') || '' });
    setMeta({ linked: true, needsReconnect: false, connectedAt: Date.now() });
    clean();
    return { handled: true, ok: true, returnTab: saved.returnTab };
  }

  function disconnect() {
    const t = token();
    if (t && t.access_token) {
      // Revoke at Google (endpoint has no CORS, so use a no-cors form-style POST; result is not readable).
      try { fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=' + encodeURIComponent(t.access_token) }).catch(() => {}); } catch (e) { /* ignore */ }
    }
    write(TOKEN_KEY, null); write(META_KEY, null); write(STATE_KEY, null);
  }
  function clearCache() { write(CACHE_KEY, null); }

  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  async function api(path, opts = {}) {
    const t = token();
    if (!t || !tokenValid()) throw new ApiError(401, 'Not signed in');
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + t.access_token, Accept: 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = (j.error && (j.error.message || j.error.status)) || msg; } catch (e) { /* ignore */ }
      if (res.status === 401) { write(TOKEN_KEY, null); setMeta({ needsReconnect: true }); }
      throw new ApiError(res.status, msg);
    }
    return res.json();
  }
  async function listAll(type, filter, pageSize, maxPages = 4) {
    let out = [], token_ = '';
    for (let i = 0; i < maxPages; i++) {
      const p = new URLSearchParams({ filter, pageSize: String(pageSize) });
      if (token_) p.set('pageToken', token_);
      const j = await api(`dataTypes/${type}/dataPoints?${p}`);
      out = out.concat(j.dataPoints || []);
      token_ = j.nextPageToken; if (!token_) break;
    }
    return out;
  }
  function rollup(type, startKey, endKeyExcl) {
    return api(`dataTypes/${type}/dataPoints:dailyRollUp`, {
      method: 'POST',
      body: { range: { start: { date: M.keyToDate(startKey) }, end: { date: M.keyToDate(endKeyExcl) } }, windowSizeDays: 1 }
    }).then((j) => j.rollupDataPoints || []);
  }

  let inflight = null;
  /** Fetch & normalise. Returns {ok, skipped?, errors:[], cache}. */
  function sync(force) {
    if (inflight) return inflight;
    const c = read(CACHE_KEY, null);
    if (!force && c && Date.now() - c.fetchedAt < MIN_INTERVAL) return Promise.resolve({ ok: true, skipped: true, cache: c, errors: [] });
    if (!tokenValid()) return Promise.resolve({ ok: false, error: 'auth', errors: [] });
    const now = new Date(), today = keyOf(now), tomorrow = keyOf(addDays(now, 1));
    const d7 = keyOf(addDays(now, -6)), d14 = keyOf(addDays(now, -13)), d15 = keyOf(addDays(now, -14)), d31 = keyOf(addDays(now, -30));
    const jobs = {
      sleep: () => listAll('sleep', `sleep.interval.civil_end_time >= "${d15}" AND sleep.interval.civil_end_time < "${tomorrow}"`, 25, 3).then(M.mapSleep),
      rhr: () => listAll('daily-resting-heart-rate', `daily_resting_heart_rate.date >= "${d31}"`, 100, 1).then((p) => M.mapDaily('rhr', p)),
      hrv: () => listAll('daily-heart-rate-variability', `daily_heart_rate_variability.date >= "${d31}"`, 100, 1).then((p) => M.mapDaily('hrv', p)),
      spo2: () => listAll('daily-oxygen-saturation', `daily_oxygen_saturation.date >= "${d7}"`, 20, 1).then((p) => M.mapDaily('spo2', p)),
      resp: () => listAll('daily-respiratory-rate', `daily_respiratory_rate.date >= "${d7}"`, 20, 1).then((p) => M.mapDaily('resp', p)),
      temp: () => listAll('daily-sleep-temperature-derivations', `daily_sleep_temperature_derivations.date >= "${d7}"`, 20, 1).then((p) => M.mapDaily('temp', p)),
      weight: () => listAll('weight', `weight.sample_time.civil_time >= "${d31}"`, 100, 1).then(M.mapWeight),
      steps: () => rollup('steps', d31, tomorrow).then((r) => M.mapRollup('steps', r)),
      calories: () => rollup('total-calories', d7, tomorrow).then((r) => M.mapRollup('calories', r)),
      azm: () => rollup('active-zone-minutes', d7, tomorrow).then((r) => M.mapRollup('azm', r)),
      zones: () => rollup('time-in-heart-rate-zone', d7, tomorrow).then((r) => M.mapRollup('zones', r)),
      workouts: () => listAll('exercise', `exercise.interval.civil_start_time >= "${d14}"`, 25, 2).then(M.mapExercise)
    };
    const names = Object.keys(jobs);
    inflight = Promise.allSettled(names.map((n) => jobs[n]())).then(async (results) => {
      const prev = c || {};
      const cache = { fetchedAt: Date.now(), today, series: Object.assign({}, prev.series), workouts: prev.workouts || [] };
      const errors = [];
      results.forEach((r, i) => {
        const n = names[i];
        if (r.status === 'fulfilled') { if (n === 'workouts') cache.workouts = r.value; else cache.series[n] = r.value; }
        else errors.push({ type: n, status: r.reason && r.reason.status, message: r.reason && r.reason.message });
      });
      const allFailed = errors.length === names.length;
      if (!allFailed) write(CACHE_KEY, cache);
      if (!meta().email) {
        try { const u = await api('https://openidconnect.googleapis.com/v1/userinfo'); if (u && u.email) setMeta({ email: u.email }); } catch (e) { /* optional */ }
      }
      inflight = null;
      const authErr = errors.find((e) => e.status === 401);
      return { ok: !allFailed, errors, cache: allFailed ? c : cache, error: authErr ? 'auth' : (allFailed ? (errors[0] && errors[0].status === 412 ? 'profile' : 'failed') : null) };
    }, (e) => { inflight = null; return { ok: false, errors: [{ message: String(e) }], error: 'failed' }; });
    return inflight;
  }

  /** Auto-reconnect on open: if the token expired but the user linked before, try a silent (prompt=none) redirect
      at most once every 10 minutes. Returns true if navigating away. */
  function maybeSilentReconnect() {
    const m = meta();
    if (!clientId() || tokenValid() || !m.linked || m.needsReconnect || m.autoReconnect === false) return false;
    if (m.lastSilentAt && Date.now() - m.lastSilentAt < SILENT_GAP) return false;
    if (!navigator.onLine) return false;
    connect({ silent: true, returnTab: (location.hash.slice(1) || 'today') });
    return true;
  }

  window.PulseSync = {
    SCOPES, redirectUri, clientId, clientIdSource, setClientId, validClientId, token, tokenValid, status, meta, setMeta,
    connect, handleRedirect, disconnect, clearCache, sync, maybeSilentReconnect,
    cache: () => read(CACHE_KEY, null), MIN_INTERVAL
  };
})();
