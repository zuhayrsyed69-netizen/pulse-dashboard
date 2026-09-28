/* Pulse v4 – daily health dashboard. Sleep, Recovery and Strain are always calculated from Google Health data
   (never typed in); missing data shows "–" with the reason. Nothing is invented. */
(() => {
  'use strict';

  const KEY = 'pulse.v1'; // storage key kept from v1; data is migrated in place (schema v2)
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const COL = { strain: '#1f8fff', sleep: '#6c5ce7', high: '#12b76a', mid: '#f5a800', low: '#f04438', text: '#0f1115', muted: '#6b7280', faint: '#b3b8c2', track: 'rgba(15,17,21,0.07)' };

  const RINGS = {
    sleep:    { label: 'Sleep',    title: 'Sleep quality', max: 100, step: 1,   dec: 0, bump: 1,   start: 75, sub: 'Sleep quality / score, 0–100%' },
    recovery: { label: 'Recovery', title: 'Recovery',      max: 100, step: 1,   dec: 0, bump: 1,   start: 50, sub: 'Recovery / readiness, 0–100%' },
    strain:   { label: 'Strain',   title: 'Strain',        max: 21,  step: 0.1, dec: 1, bump: 0.5, start: 10, sub: 'Day strain, 0–21 scale' }
  };
  const RING_ORDER = ['sleep', 'recovery', 'strain'];

  const HEALTH = {
    rhr:    { label: 'Resting HR',  unit: 'bpm',    min: 30, max: 120,   step: 1,   dec: 0, bump: 1,   start: 60,   color: '#f04438' },
    hrv:    { label: 'HRV',         unit: 'ms',     min: 5,  max: 200,   step: 1,   dec: 0, bump: 1,   start: 50,   color: '#6c5ce7' },
    spo2:   { label: 'SpO₂',        unit: '%',      min: 80, max: 100,   step: 1,   dec: 0, bump: 1,   start: 96,   color: '#1f8fff' },
    resp:   { label: 'Resp. rate',  unit: 'br/min', min: 6,  max: 30,    step: 0.1, dec: 1, bump: 0.5, start: 15,   color: '#0ea5a4' },
    weight: { label: 'Weight',      unit: 'kg',     min: 30, max: 250,   step: 0.1, dec: 1, bump: 0.5, start: 75,   color: '#475467' },
    steps:  { label: 'Steps',       unit: '',       min: 0,  max: 60000, step: 100, dec: 0, bump: 500, start: 8000, color: '#12b76a' },
    temp:   { label: 'Skin temp Δ', unit: '°C',     min: -5, max: 5,     step: 0.1, dec: 1, bump: 0.1, start: 0,    color: '#ea580c' },
    calories: { label: 'Calories',  unit: 'kcal',   min: 0,  max: 10000, step: 10,  dec: 0, bump: 50,  start: 2200, color: '#f5a800' }
  };
  const HEALTH_ORDER = ['rhr', 'hrv', 'spo2', 'resp', 'temp', 'weight', 'steps', 'calories'];

  const ACTIVITIES = {
    football:   { label: 'Football',      emoji: '⚽', color: '#12b76a' },
    padel:      { label: 'Padel',         emoji: '🎾', color: '#f5a800' },
    gym:        { label: 'Gym / Weights', emoji: '🏋️', color: '#475467' },
    running:    { label: 'Running',       emoji: '🏃', color: '#f04438' },
    walking:    { label: 'Walking',       emoji: '🚶', color: '#0ea5a4' },
    cycling:    { label: 'Cycling',       emoji: '🚴', color: '#1f8fff' },
    swimming:   { label: 'Swimming',      emoji: '🏊', color: '#0284c7' },
    basketball: { label: 'Basketball',    emoji: '🏀', color: '#ea580c' },
    tennis:     { label: 'Tennis',        emoji: '🥎', color: '#84cc16' },
    yoga:       { label: 'Yoga',          emoji: '🧘', color: '#a855f7' },
    hiit:       { label: 'HIIT',          emoji: '⚡', color: '#eab308' },
    boxing:     { label: 'Boxing',        emoji: '🥊', color: '#dc2626' },
    hiking:     { label: 'Hiking',        emoji: '🥾', color: '#65a30d' },
    other:      { label: 'Other',         emoji: '✨', color: '#6b7280' }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- state & migration ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function migrate(s) {
    const out = { v: 2, days: {}, workouts: [], hiddenSync: [], settings: { sleepGoal: 8, copyBg: 'white' } };
    if (!s || typeof s !== 'object') return out;
    if (s.days && typeof s.days === 'object') {
      for (const [k, d] of Object.entries(s.days)) if (d && typeof d === 'object') out.days[k] = Object.assign({}, d);
    }
    if (Array.isArray(s.workouts)) {
      out.workouts = s.workouts.filter((w) => w && typeof w.ts === 'number').map((w) => {
        const n = Object.assign({}, w);
        if (!n.activity) {
          const a = n.sport;
          if (a && ACTIVITIES[a]) n.activity = a;
          else { n.activity = 'custom'; n.name = n.name || String(a || 'Workout'); }
        }
        delete n.sport;
        n.duration = Math.max(0, Math.round(+n.duration || 0));
        n.rpe = Math.round(+n.rpe || 0);
        n.id = n.id || uid();
        return n;
      });
    }
    if (s.settings && typeof s.settings === 'object') Object.assign(out.settings, s.settings);
    if (Array.isArray(s.hiddenSync)) out.hiddenSync = s.hiddenSync.filter((x) => typeof x === 'string');
    return out;
  }
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    const st = migrate(raw);
    if (raw && raw.v !== 2) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }
    return st;
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save (storage full or blocked)'); }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  // All health values come from Google Health (synced cache). Old manually typed values (state.days) are kept in storage
  // but no longer used. Scores are calculated (metrics.js) and persisted per day in SCORES_KEY so they stay stable.
  let SYNC = null, MEMO = {};
  function refreshSync() { SYNC = window.PulseSync ? window.PulseSync.cache() : null; MEMO = {}; }
  const SERIES = ['rhr', 'hrv', 'spo2', 'resp', 'temp', 'weight', 'steps', 'calories'];
  const SCORE_KEYS = ['sleep', 'recovery', 'strain'];
  const ser = (f) => (SYNC && SYNC.series && SYNC.series[f]) || {};
  function syncedSleep(k) { return ser('sleep')[k] || null; }
  function syncedVal(f, k) {
    if (SERIES.includes(f)) { const v = ser(f)[k]; return isNum(v) ? v : null; }
    if (f === 'sleepHours') { const sl = syncedSleep(k); return sl && isNum(sl.sleepHours) ? sl.sleepHours : null; }
    return null;
  }

  // ---- automatic targets (Google Health API v4 exposes no goals, so they are derived from your own data) ----
  function sleepHoursSeries() { const o = {}; Object.entries(ser('sleep')).forEach(([k, v]) => { if (v && isNum(v.sleepHours)) o[k] = v.sleepHours; }); return o; }
  function sleepTargetInfo(k = dayKey()) {
    const ck = 'ST|' + k; if (ck in MEMO) return MEMO[ck];
    const PM = window.PulseMetrics;
    return (MEMO[ck] = PM ? PM.sleepTarget(k, sleepHoursSeries()) : { value: 8, source: 'default', days: 0, need: 7 });
  }
  const sleepGoal = (k = dayKey()) => sleepTargetInfo(k).value;
  function stepTargetInfo(k = dayKey()) {
    const ck = 'SP|' + k; if (ck in MEMO) return MEMO[ck];
    const PM = window.PulseMetrics;
    return (MEMO[ck] = PM ? PM.stepTarget(k, ser('steps')) : { value: 10000, source: 'default', days: 0, need: 7 });
  }
  function strainTargetInfo(k = dayKey()) { const PM = window.PulseMetrics; return PM ? PM.strainTarget(getVal('recovery', k)) : null; }
  const targetSrc = (t) => (t.source === 'default' ? `default until ${t.need} days of data (${t.days} so far)` : `personal · ${t.days}-day average`);
  const fmtBand = (t) => (t ? `${t.low.toFixed(1)}–${t.high.toFixed(1)}` : '–');

  // ---- persisted daily score history ----
  const SCORES_KEY = 'pulse.scores';
  function loadScores() {
    try { const s = JSON.parse(localStorage.getItem(SCORES_KEY) || 'null'); if (s && s.days && typeof s.days === 'object') return s; } catch (e) { /* ignore */ }
    return { v: 1, days: {} };
  }
  let SCORES = loadScores(), scoresDirty = false;
  function saveScores() {
    if (!scoresDirty) return;
    const keys = Object.keys(SCORES.days).sort();
    while (keys.length > 400) delete SCORES.days[keys.shift()];
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(SCORES)); } catch (e) { /* ignore */ }
    scoresDirty = false;
  }
  const slim = (r) => { const o = { value: r.value }; ['parts', 'trimp', 'method', 'baseline', 'hrvDays', 'weights', 'goal'].forEach((x) => { if (r[x] !== undefined) o[x] = r[x]; }); return o; };
  // Live calculation from the synced cache: returns {sig, res} or null when the inputs are not in the cache.
  function liveScore(f, k) {
    const PM = window.PulseMetrics;
    if (!PM || !SYNC || !SYNC.series) return null;
    const goal = sleepGoal(k);
    if (f === 'strain') {
      const z = ser('zones')[k], a = ser('azm')[k];
      if (!z && !a) return null;
      return { sig: JSON.stringify([z || null, a || null]), res: PM.computeStrain(z, a) };
    }
    if (f === 'sleep') {
      const sl = syncedSleep(k);
      if (!sl) return null;
      return { sig: JSON.stringify([sl.minutesAsleep, sl.efficiency, sl.stages || null]), res: Object.assign(PM.computeSleepQuality(sl, goal) || {}, { goal }) };
    }
    if (f === 'recovery') {
      const hrv = ser('hrv'), rhr = ser('rhr');
      if (!Object.keys(hrv).length) return null;
      const sh = syncedVal('sleepHours', k);
      const r = PM.computeRecovery(k, hrv, rhr, sh, goal);
      return { sig: JSON.stringify([hrv[k] ?? null, rhr[k] ?? null, sh]), res: r && Object.assign(r, { goal }) };
    }
    return null;
  }
  // Score for a day: recalculated when its inputs change (strain accumulates through the day); otherwise the stored
  // value is reused so the number stays stable. Falls back to history when the inputs are older than the cache window.
  function score(f, k) {
    const live = liveScore(f, k), day = SCORES.days[k] || {}, stored = day[f];
    if (live && live.res && isNum(live.res.value)) {
      if (stored && stored.sig === live.sig) return { v: stored.v, src: 'calc', info: stored.info, at: stored.at };
      const at = Date.now();
      SCORES.days[k] = Object.assign({}, day, { [f]: { v: live.res.value, info: slim(live.res), sig: live.sig, at } });
      scoresDirty = true;
      return { v: live.res.value, src: 'calc', info: live.res, at };
    }
    if (stored && isNum(stored.v)) return { v: stored.v, src: 'calc', info: stored.info, at: stored.at, history: true };
    return { v: null, src: null, info: live && live.res };
  }
  function metric(f, k = dayKey()) {
    const ck = f + '|' + k;
    if (ck in MEMO) return MEMO[ck];
    let r;
    if (SCORE_KEYS.includes(f)) r = score(f, k);
    else { const sv = syncedVal(f, k); r = sv !== null ? { v: sv, src: 'google' } : { v: null, src: null }; }
    return (MEMO[ck] = r);
  }
  function getVal(f, k = dayKey()) { return metric(f, k).v; }
  function getStr(f, k = dayKey()) { const sl = syncedSleep(k); return (f === 'bedtime' || f === 'wake') && sl && sl[f] ? sl[f] : null; }
  // Why a score is missing (shown instead of a number).
  function missingReason(f, k = dayKey()) {
    const st = window.PulseSync ? window.PulseSync.status() : 'no-client';
    if (!(SYNC && SYNC.fetchedAt)) return st === 'connected' ? 'Syncing with Google Health…' : st === 'expired' ? 'Reconnect Google Health' : 'Connect Google Health';
    const info = metric(f, k).info;
    if (f === 'recovery') return info && info.calibrating ? `Calibrating: ${info.hrvDays} of ${info.need} days of HRV` : 'No HRV recorded yet today';
    if (f === 'sleep') return 'No sleep recorded yet';
    return 'No heart-rate zone data yet today';
  }
  const SRC_LABEL = { google: 'Google Health', calc: 'Calculated' };
  const srcBadge = (src) => (src ? `<span class="src src-${src}">${SRC_LABEL[src]}</span>` : '');
  const hhmm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function updatedText() {
    const t = SYNC && SYNC.fetchedAt;
    if (!t) return '';
    const d = new Date(t);
    return `Updated ${dayKey(d) === dayKey() ? '' : d.toLocaleDateString([], { weekday: 'short' }) + ' '}${hhmm(t)}`;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const roundTo = (v, dec) => { const f = Math.pow(10, dec); return Math.round(v * f) / f; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const timeStr = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const longDate = (d = new Date()) => d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtHours = (h) => { if (!isNum(h)) return '–'; const t = Math.round(h * 60), hh = Math.floor(t / 60), mm = t % 60; return hh === 0 ? `${mm}m` : mm === 0 ? `${hh}h` : `${hh}h ${mm}m`; };
  const fmtNum = (v, dec) => (v === null ? '–' : dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
  const recColor = (v) => (v === null ? COL.mid : v >= 67 ? COL.high : v >= 34 ? COL.mid : COL.low);
  const recZone = (v) => (v === null ? '' : v >= 67 ? 'Green' : v >= 34 ? 'Yellow' : 'Red');
  const ringColor = (m, v) => (m === 'strain' ? COL.strain : m === 'sleep' ? COL.sleep : recColor(v));
  const ringPct = (m, v) => (v === null ? null : m === 'strain' ? Math.round((v / 21) * 100) : Math.round(v));
  function ringSub(m, v, forImage) {
    if (v === null) return forImage ? 'no data' : '';
    if (m === 'strain') return `${v.toFixed(1)} / 21`;
    if (m === 'sleep') { const h = getVal('sleepHours'); return h !== null ? fmtHours(h) : 'quality'; }
    return recZone(v);
  }
  function last7() {
    const out = [], base = new Date(); base.setHours(12, 0, 0, 0);
    for (let i = 6; i >= 0; i--) { const d = new Date(base); d.setDate(base.getDate() - i); out.push(d); }
    return out;
  }
  const actInfo = (w) => {
    const a = ACTIVITIES[w.activity];
    if (a && w.activity !== 'other') return a;
    return { label: w.name || (a ? a.label : 'Workout'), emoji: a ? a.emoji : '🏅', color: a ? a.color : '#6b7280' };
  };

  // ---------- ring widgets ----------
  const R = 52, CIRC = 2 * Math.PI * R;
  function ringWidgetHTML(m, size) {
    return `<button class="ringw ${size || ''}" type="button" data-ring="${m}" aria-label="${RINGS[m].title}: details">
      <span class="ringw-g">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="rt" cx="60" cy="60" r="${R}"/>
          <circle class="rv" cx="60" cy="60" r="${R}" transform="rotate(-90 60 60)" style="stroke-dasharray:${CIRC} ${CIRC};stroke-dashoffset:${CIRC};opacity:0"/>
        </svg>
        <span class="ringw-c"><span class="ringw-pct">–</span><span class="ringw-sub"></span></span>
      </span>
      <span class="ringw-label">${RINGS[m].label}</span>
      <span class="ringw-src"></span>
    </button>`;
  }
  $$('[data-rings]').forEach((el) => {
    el.innerHTML = el.dataset.rings.split(',').map((m) => ringWidgetHTML(m, el.dataset.size)).join('');
  });
  function updateRings() {
    $$('.ringw').forEach((w) => {
      const m = w.dataset.ring;
      const mt = metric(m);
      const v = mt.v;
      const p = v === null ? 0 : clamp(v / RINGS[m].max, 0, 1);
      const rv = $('.rv', w);
      rv.style.strokeDashoffset = String(CIRC * (1 - p));
      rv.style.opacity = p > 0 ? '1' : '0';
      rv.style.stroke = ringColor(m, v);
      const pct = ringPct(m, v);
      $('.ringw-pct', w).textContent = pct === null ? '–' : pct + '%';
      $('.ringw-sub', w).textContent = ringSub(m, v, false);
      $('.ringw-src', w).textContent = v === null ? missingReason(m) : '';
      w.classList.toggle('empty', v === null);
    });
  }
  function replayRings(root) {
    const els = $$('.rv', root);
    els.forEach((el) => { el.style.transition = 'none'; el.style.strokeDashoffset = String(CIRC); });
    if (els.length) els[0].getBoundingClientRect();
    els.forEach((el) => { el.style.transition = ''; });
    requestAnimationFrame(() => updateRings());
  }

  // ---------- charts (inline SVG) ----------
  function barChart(vals, o) {
    const W = 320, H = 150, top = 20, bottom = 24, left = 6, right = 6, n = vals.length;
    const max = Math.max(o.goal || 0, ...vals.map((v) => v || 0)) * 1.15 || 1;
    const slot = (W - left - right) / n, bw = Math.min(24, slot * 0.55), ih = H - top - bottom;
    const days = last7();
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">`;
    vals.forEach((v, i) => {
      const x = left + slot * i + (slot - bw) / 2, isToday = i === n - 1;
      if (v) {
        const h = Math.max(4, (v / max) * ih), y = H - bottom - h;
        s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${o.colorFn ? o.colorFn(v) : o.color}" opacity="${isToday ? 1 : 0.55}"/>`;
        s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#344054" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.fmt(v))}</text>`;
      } else {
        s += `<rect x="${x.toFixed(1)}" y="${H - bottom - 3}" width="${bw.toFixed(1)}" height="3" rx="1.5" fill="#e4e7ec"/>`;
      }
      const lbl = days[i].toLocaleDateString([], { weekday: 'short' }).slice(0, 3);
      s += `<text x="${(left + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="${isToday ? 800 : 500}" fill="${isToday ? '#0f1115' : '#98a2b3'}">${isToday ? 'Today' : esc(lbl)}</text>`;
    });
    if (o.goal) {
      const gy = H - bottom - (o.goal / max) * ih;
      s += `<line x1="${left}" x2="${W - right}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#98a2b3" stroke-width="1" stroke-dasharray="4 4"/>`;
    }
    return s + '</svg>';
  }
  function sparkline(vals, color) {
    const pts = vals.map((v, i) => (v === null ? null : [i, v])).filter(Boolean);
    if (!pts.length) return '<div class="spark-empty">No entries yet</div>';
    const W = 140, H = 34, p = 5;
    let lo = Math.min(...pts.map((q) => q[1])), hi = Math.max(...pts.map((q) => q[1]));
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const xy = pts.map(([i, v]) => [p + (i * (W - 2 * p)) / 6, H - p - ((v - lo) / (hi - lo)) * (H - 2 * p)]);
    let s = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
    if (xy.length > 1) s += `<polyline points="${xy.map((q) => q.map((z) => z.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    xy.forEach((q, j) => { s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${j === xy.length - 1 ? 3.2 : 2.2}" fill="${color}"/>`; });
    return s + '</svg>';
  }

  // ---------- insights (rule-based, only from entered data) ----------
  function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
  function priorVals(f, n = 7) {
    const out = [], base = new Date(); base.setHours(12, 0, 0, 0);
    for (let i = 1; i <= n; i++) { const d = new Date(base); d.setDate(base.getDate() - i); const v = getVal(f, dayKey(d)); if (v !== null) out.push(v); }
    return out;
  }
  function insights() {
    const list = [];
    const rec = getVal('recovery'), strain = getVal('strain'), sq = getVal('sleep'), sh = getVal('sleepHours');
    const goal = sleepGoal(), rhr = getVal('rhr'), hrv = getVal('hrv'), tgt = strainTargetInfo();
    if (rec !== null) {
      if (rec < 34) list.push({ t: 'bad', m: `Recovery is in the red (${rec}%). A lighter day could make sense: easy movement, mobility or rest.` });
      else if (rec < 67) list.push({ t: 'warn', m: `Recovery is yellow (${rec}%). Training is fine, but keep the intensity controlled.` });
      else list.push({ t: 'good', m: `Recovery is green (${rec}%). A good day for a harder session if you feel up to it.` });
    }
    if (tgt) {
      const st = strain === null ? 0 : strain;
      if (st > tgt.high) list.push({ t: 'warn', m: `Strain ${st.toFixed(1)} is above today's target of ${fmtBand(tgt)} (set by your recovery). Prioritise sleep, food and fluids tonight.` });
      else if (st >= tgt.low) list.push({ t: 'good', m: `Strain ${st.toFixed(1)} is inside today's target of ${fmtBand(tgt)}.` });
      else list.push({ t: 'info', m: `Today's strain target is ${fmtBand(tgt)} based on your recovery; you're at ${st.toFixed(1)} so far.` });
    }
    if (sh !== null) {
      const diff = goal - sh;
      if (diff >= 1) list.push({ t: 'warn', m: `You slept ${fmtHours(sh)}, ${fmtHours(diff)} short of your ${fmtHours(goal)} target. An earlier night could help.` });
      else if (diff > 0) list.push({ t: 'info', m: `You slept ${fmtHours(sh)}, just under your ${fmtHours(goal)} target.` });
      else list.push({ t: 'good', m: `You slept ${fmtHours(sh)}, meeting your ${fmtHours(goal)} target.` });
    }
    if (sq !== null && sq < 70) list.push({ t: 'warn', m: `Sleep quality was ${sq}%. A consistent bedtime and less screen time before bed often help.` });
    const psh = priorVals('sleepHours');
    if (psh.length >= 3) {
      const a = avg(psh);
      if (a < goal - 0.5) list.push({ t: 'info', m: `Your average over the previous ${psh.length} nights is ${fmtHours(a)}, below your ${fmtHours(goal)} target.` });
    }
    if (rhr !== null) {
      const p = priorVals('rhr');
      if (p.length >= 3 && rhr >= avg(p) + 5) list.push({ t: 'warn', m: `Resting HR is ${rhr} bpm, above your recent average of ${Math.round(avg(p))}. That can reflect fatigue, stress, heat or illness.` });
    }
    if (hrv !== null) {
      const p = priorVals('hrv');
      if (p.length >= 3 && hrv <= avg(p) * 0.85) list.push({ t: 'warn', m: `HRV is ${hrv} ms, lower than your recent average of ${Math.round(avg(p))} ms.` });
    }
    const since = Date.now() - 7 * 864e5;
    const wk = allWorkouts().filter((w) => w.ts >= since);
    if (wk.length) {
      const mins = wk.reduce((a, w) => a + w.duration, 0);
      list.push({ t: 'info', m: `${wk.length} workout${wk.length > 1 ? 's' : ''} (${mins} min) logged in the last 7 days.` });
    } else list.push({ t: 'info', m: 'No workouts in the last 7 days.' });
    const recInfo = metric('recovery').info;
    if (rec === null && recInfo && recInfo.calibrating) list.push({ t: 'info', m: `Recovery is calibrating: it needs HRV from at least ${recInfo.need} previous days (currently ${recInfo.hrvDays}).` });
    if (!(SYNC && SYNC.fetchedAt)) list.push({ t: 'none', m: 'Connect Google Health and your scores will be calculated automatically.' });
    return list;
  }

  // ---------- render ----------
  function render() {
    refreshSync();
    $$('[data-date]').forEach((el) => { el.textContent = longDate(); });
    renderSyncUI();
    fillHistory();
    updateRings();
    const any = RING_ORDER.some((m) => getVal(m) !== null);
    const up = updatedText();
    $('#rings-updated').hidden = !up; $('#rings-updated').textContent = up;
    const none = !(SYNC && SYNC.fetchedAt);
    $('#today-empty').hidden = any || !none;
    $('#today-empty').textContent = none ? 'Scores are calculated automatically from Google Health. Connect it to fill your rings.' : '';
    renderToday(); renderFitness(); renderSleep(); renderHealth();
    saveScores();
    scheduleCard();
  }
  // Calculate & store scores for every day present in the synced cache (keeps the daily history complete).
  function fillHistory() {
    if (!SYNC || !SYNC.series) return;
    const keys = new Set();
    ['sleep', 'zones', 'azm', 'hrv'].forEach((f) => Object.keys(ser(f)).forEach((k) => keys.add(k)));
    keys.forEach((k) => SCORE_KEYS.forEach((f) => metric(f, k)));
  }

  function tile(label, val, unit, sub, go, src) {
    const empty = val === null;
    return `<button class="tile${empty ? ' empty' : ''}" type="button" data-go="${go}">
      <span class="t-label">${esc(label)}</span>
      <span class="t-val">${empty ? '–' : esc(val)}${!empty && unit ? `<small>${esc(unit)}</small>` : ''}</span>
      <span class="t-sub">${esc(sub)}</span>${!empty ? srcBadge(src) : ''}</button>`;
  }
  function renderToday() {
    const today = workoutsFor(dayKey());
    const mins = today.reduce((a, w) => a + w.duration, 0);
    const shM = metric('sleepHours'), rhrM = metric('rhr'), stM = metric('steps');
    const sh = shM.v, rhr = rhrM.v, steps = stM.v;
    $('#glance').innerHTML =
      tile('Workouts today', today.length ? String(today.length) : null, today.length ? ` · ${mins} min` : '', today.length ? today.map((w) => actInfo(w).label).slice(0, 2).join(', ') : 'None yet', 'fitness') +
      tile('Sleep', sh !== null ? fmtHours(sh) : null, '', sh !== null ? `target ${fmtHours(sleepGoal())}` : 'No sleep recorded yet', 'sleep', shM.src) +
      tile('Resting HR', rhr !== null ? String(rhr) : null, 'bpm', rhr !== null ? 'today' : 'Not recorded yet', 'health', rhrM.src) +
      tile('Steps', steps !== null ? steps.toLocaleString() : null, '', steps !== null ? `of ${stepTargetInfo().value.toLocaleString()} target` : 'Not recorded yet', 'health', stM.src);
    $('#insights').innerHTML = insights().map((i) => `<li class="${i.t}"><span class="ind" aria-hidden="true"></span><span>${esc(i.m)}</span></li>`).join('');
  }

  // Workouts come only from Google Health exercise sessions (read-only).
  function allWorkouts() { return SYNC && Array.isArray(SYNC.workouts) ? SYNC.workouts : []; }
  function workoutsFor(key) {
    return allWorkouts().filter((w) => dayKey(new Date(w.ts)) === key).sort((a, b) => b.ts - a.ts);
  }
  function liHTML(w, showDate) {
    const a = actInfo(w);
    const when = showDate ? `${dateStr(w.ts)} · ${timeStr(w.ts)}` : timeStr(w.ts);
    return `<li data-id="${esc(w.id)}">
      <span class="ico" aria-hidden="true">${a.emoji}</span>
      <div class="info">
        <div class="title">${esc(a.label)} · ${w.duration} min</div>
        <div class="meta">${w.avgHr ? `avg ${w.avgHr} bpm · ` : ''}${w.calories ? `${w.calories} kcal · ` : ''}${w.azm ? `${w.azm} AZM · ` : ''}${esc(when)}</div>
      </div>
    </li>`;
  }
  function renderFitness() {
    const s = getVal('strain');
    $('#fit-strain').innerHTML = s === null ? '–' : `${s.toFixed(1)}<span class="muted"> / 21</span>`;
    const sm = metric('strain'), azmT = SYNC && SYNC.series && SYNC.series.azm && SYNC.series.azm[dayKey()];
    const tgt = strainTargetInfo();
    let fsub = (s === null ? missingReason('strain') : `${ringPct('strain', s)}% of max · builds through the day`) + (tgt ? ` · target ${fmtBand(tgt)}` : '');
    if (sm.src === 'calc' && sm.info) fsub += ` · load ${sm.info.trimp}`;
    if (azmT) fsub += ` · ${azmT.total} AZM`;
    $('#fit-strain-sub').textContent = fsub;
    const tk = dayKey();
    const today = workoutsFor(tk);
    const cutoff = Date.now() - 14 * 864e5;
    const recent = allWorkouts().filter((w) => dayKey(new Date(w.ts)) !== tk && w.ts >= cutoff).sort((a, b) => b.ts - a.ts).slice(0, 20);
    $('#today-list').innerHTML = today.length ? today.map((w) => liHTML(w, false)).join('') : '<li class="empty">No workouts recorded today</li>';
    $('#recent-list').innerHTML = recent.length ? recent.map((w) => liHTML(w, true)).join('') : '<li class="empty">No workouts in the last 14 days</li>';
    const mins = today.reduce((a, w) => a + w.duration, 0);
    $('#today-total').textContent = today.length ? `${today.length} today · ${mins} min` : '';
    const vals = last7().map((d) => workoutsFor(dayKey(d)).reduce((a, w) => a + w.duration, 0));
    const tot = vals.reduce((a, b) => a + b, 0);
    const n = last7().reduce((a, d) => a + workoutsFor(dayKey(d)).length, 0);
    $('#week-total').textContent = tot ? `${tot} min · ${n} session${n > 1 ? 's' : ''}` : 'No workouts yet';
    $('#week-chart').innerHTML = barChart(vals, { color: COL.strain, fmt: (v) => String(v), label: 'Workout minutes per day, last 7 days' });
    const sv = last7().map((d) => getVal('strain', dayKey(d))), sg = sv.filter((v) => v !== null);
    $('#strain-avg').textContent = sg.length ? `avg ${(avg(sg)).toFixed(1)}` : 'No data yet';
    $('#strain-chart').innerHTML = barChart(sv.map((v) => v || 0), { color: COL.strain, fmt: (v) => v.toFixed(1), label: 'Strain per day, last 7 days' });
  }
  function renderSleep() {
    const h = getVal('sleepHours'), q = getVal('sleep'), gi = sleepTargetInfo(), goal = gi.value, gl = `${fmtHours(goal)} target${gi.source === 'default' ? ' (default)' : ''}`;
    const bed = getStr('bedtime'), wake = getStr('wake');
    $('#sl-hours').textContent = h === null ? '–' : fmtHours(h);
    let sub;
    if (h === null) sub = `${missingReason('sleep')} · ${gl}`;
    else {
      const d = h - goal;
      sub = (bed && wake ? `${bed} → ${wake} · ` : '') + (d >= 0 ? `${gl} met` : `${fmtHours(-d)} under ${gl}`);
    }
    if (q !== null) sub += ` · quality ${q}%`;
    $('#sl-sub').textContent = sub;
    const hm = metric('sleepHours');
    $('#sl-src').innerHTML = srcBadge(hm.src);
    const sl = syncedSleep(dayKey());
    const box = $('#sl-stages');
    if (sl && sl.stages && sl.minutesAsleep) {
      const st = sl.stages, total = st.deep + st.light + st.rem + st.awake || 1;
      const segs = [['Deep', st.deep, '#3f2fb3'], ['Light', st.light, '#9d8cf5'], ['REM', st.rem, '#22b8cf'], ['Awake', st.awake, '#f79009']];
      box.innerHTML = `<div class="stagebar">${segs.map(([n, v, c]) => `<span style="width:${(v / total) * 100}%;background:${c}" title="${n}"></span>`).join('')}</div>
        <div class="stage-legend">${segs.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} <b>${fmtHours(v / 60)}</b></span>`).join('')}</div>
        <p class="muted small" style="margin:10px 0 0">Efficiency ${sl.efficiency}% · ${Math.round(((st.deep + st.rem) / sl.minutesAsleep) * 100)}% deep + REM</p>`;
      box.hidden = false;
    } else { box.hidden = true; box.innerHTML = ''; }
    const vals = last7().map((d) => getVal('sleepHours', dayKey(d)));
    const got = vals.filter((v) => v !== null);
    $('#sleep-avg').textContent = (got.length ? `avg ${fmtHours(avg(got))} · ` : '') + `target ${fmtHours(goal)}`;
    $('#sleep-chart').innerHTML = barChart(vals.map((v) => v || 0), { color: COL.sleep, goal, fmt: (v) => (Math.round(v * 10) / 10) + 'h', label: 'Sleep hours per night, last 7 days' });
  }
  function renderHealth() {
    const r = getVal('recovery');
    $('#hl-rec').textContent = r === null ? '–' : `${recZone(r)} zone`;
    $('#hl-rec').style.color = r === null ? '' : recColor(r);
    const rm = metric('recovery');
    $('#hl-rec-sub').textContent = r === null ? missingReason('recovery')
      : (r >= 67 ? 'Well recovered' : r >= 34 ? 'Moderately recovered' : 'Low recovery, go easy');
    if (r === null && rm.info && rm.info.calibrating) { $('#hl-rec').textContent = 'Calibrating'; }
    const rv = last7().map((d) => getVal('recovery', dayKey(d))), rg = rv.filter((v) => v !== null);
    $('#rec-avg').textContent = rg.length ? `avg ${Math.round(avg(rg))}%` : 'No data yet';
    $('#rec-chart').innerHTML = barChart(rv.map((v) => v || 0), { color: COL.high, fmt: (v) => Math.round(v) + '%', label: 'Recovery per day, last 7 days', colorFn: recColor });
    const days = last7();
    $('#vitals').innerHTML = HEALTH_ORDER.map((f) => {
      const c = HEALTH[f], v = getVal(f), vals = days.map((d) => getVal(f, dayKey(d)));
      if (f === 'calories' && v === null && !vals.some((x) => x !== null) && !(SYNC && SYNC.series)) return '';
      return `<button class="tile vital${v === null ? ' empty' : ''}" type="button" data-health="${f}">
        <span class="t-label">${esc(c.label)}</span>
        <span class="t-val">${v === null ? '–' : esc((f === 'temp' && v > 0 ? '+' : '') + fmtNum(v, c.dec))}${v !== null && c.unit ? `<small>${esc(c.unit)}</small>` : ''}</span>
        <span class="t-sub">${v === null ? 'Not recorded yet' : srcBadge(metric(f).src)}</span>
        ${sparkline(vals, c.color)}
      </button>`;
    }).join('');
  }

  // ---------- Google Health sync UI ----------
  const PS = window.PulseSync;
  const ago = (t) => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  let syncing = false;
  function renderSyncUI() {
    if (!PS) return;
    const st = PS.status(), c = SYNC, card = $('#connect-card'), bar = $('#syncbar');
    if (st === 'connected') {
      card.hidden = true; bar.hidden = false;
      bar.innerHTML = `<span class="dot-live"></span><span>Google Health · ${syncing ? 'syncing…' : 'synced ' + esc(ago(c && c.fetchedAt))}</span><button type="button" class="linkbtn" id="btn-sync-now">${syncing ? '' : 'Sync now'}</button>`;
    } else if (st === 'expired') {
      card.hidden = true; bar.hidden = false;
      bar.innerHTML = `<span class="dot-warn"></span><span>Google Health paused${c && c.fetchedAt ? ' · ' + esc(updatedText()) : ''}</span><button type="button" class="linkbtn" id="btn-connect">Reconnect</button>`;
    } else {
      bar.hidden = !(c && c.fetchedAt);
      if (!bar.hidden) bar.innerHTML = `<span class="dot-off"></span><span>Showing Google Health data from ${esc(ago(c.fetchedAt))}</span>`;
      card.hidden = false;
      const txt = st === 'no-client' ? ['Google Health not configured', 'The Google Client ID is missing in config.js.', 'Info']
        : ['Connect Google Health', 'Your rings, sleep, vitals and workouts are calculated automatically from the Google Health app.', 'Connect'];
      card.innerHTML = `<div><strong>${txt[0]}</strong><p class="muted small">${txt[1]}</p></div><button class="btn primary sm2" type="button" id="btn-connect">${txt[2]}</button>`;
    }
  }
  function startConnect() {
    if (!PS.clientId()) { toast('Google Client ID missing in config.js'); return; }
    PS.setMeta({ needsReconnect: false });
    PS.connect({ returnTab: currentTab || 'today' });
  }
  // quiet = automatic refresh (open / visible again / timer): no toasts on success, errors shown in the banner.
  function doSync(force, quiet) {
    if (!PS || !PS.tokenValid() || syncing) return Promise.resolve();
    syncing = true; renderSyncUI();
    return PS.sync(force).then((res) => {
      syncing = false;
      if (!res.skipped) PS.setMeta({ lastErrors: (res.errors || []).map((e) => `${e.type}: ${e.status || ''} ${e.message || ''}`.trim()), lastResult: res.error || 'ok' });
      if (res.error === 'profile') toast("Your Google Health profile isn't set up yet. Open the Google Health app first.");
      else if (!quiet) {
        if (res.error === 'auth') toast('Google Health session expired. Tap Reconnect.');
        else if (!res.ok) toast('Sync failed. Check Settings for details.');
        else if (!res.skipped) toast(res.errors.length ? `Synced (some data unavailable)` : 'Synced from Google Health');
      }
      render();
      if ($('#set-status')) openSettings();
    });
  }

  function openSettings() {
    const st = PS.status(), m = PS.meta(), c = PS.cache();
    const pill = st === 'connected' ? '<span class="pill ok">Connected</span>' : st === 'expired' ? '<span class="pill warn">Paused</span>' : '<span class="pill">Not connected</span>';
    const info = st === 'no-client' ? 'Google Client ID is missing in config.js.'
      : `${m.email ? esc(m.email) + ' · ' : ''}last synced ${esc(c && c.fetchedAt ? `${ago(c.fetchedAt)} (${hhmm(c.fetchedAt)})` : 'never')}`;
    const btns = st === 'connected'
      ? '<button class="btn primary" type="button" id="set-sync">Sync now</button><button class="btn danger" type="button" id="set-disc">Disconnect</button>'
      : st === 'no-client' ? '' : `<button class="btn primary" type="button" id="set-connect">${st === 'expired' ? 'Reconnect' : 'Connect'} Google Health</button>${m.linked ? '<button class="btn danger" type="button" id="set-disc">Disconnect</button>' : ''}`;
    const errs = (m.lastErrors || []).length ? `<p class="sheet-note">Last sync: some data could not be read (${esc(m.lastErrors.slice(0, 4).join('; '))}).</p>` : '';
    const html = `
      <h2 id="sheet-title">Settings</h2>
      <div class="set-card">
        <div class="set-row"><div><div class="set-title">Google Health</div><div class="muted small" id="set-status">${info}</div></div>${pill}</div>
        ${btns ? `<div class="actions">${btns}</div>` : ''}
        ${errs}
        <p class="muted small" style="margin:12px 0 0">Pulse refreshes automatically when you open it, when you come back to it, and every 15 minutes while it's open.</p>
      </div>
      <button class="btn block" type="button" data-explain>How scores are calculated</button>
      <p class="disclaimer">Privacy: Pulse has no server. Your Google access token, synced data and calculated scores stay in this browser and are sent only to Google's APIs. Revoke access any time at myaccount.google.com/permissions.</p>`;
    if ($('#sheet').hidden) openSheet(html); else replaceSheet(html);
    const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
    on('set-connect', startConnect);
    on('set-sync', () => doSync(true));
    on('set-disc', () => { PS.disconnect(); PS.clearCache(); SCORES = { v: 1, days: {} }; scoresDirty = true; saveScores(); toast('Disconnected · synced data removed from this device'); render(); openSettings(); });
  }

  function openExplainer() {
    const k = dayKey(), s = metric('strain'), r = metric('recovery'), q = metric('sleep');
    const z = SYNC && SYNC.series && SYNC.series.zones && SYNC.series.zones[k];
    const line = (m, fn) => (m.src === 'calc' && m.info && m.info.parts !== undefined || (m.src === 'calc' && m.info && m.info.trimp !== undefined) ? `<p class="calc-today">${fn(m.info)}</p>` : '');
    openSheet(`
      <h2 id="sheet-title">How scores are calculated</h2>
      <p class="sheet-sub">Scores are always calculated from your Google Health data and refresh automatically during the day. Missing data shows "–" with the reason. Strain builds up through the day; Recovery and Sleep are set once last night's sleep and this morning's HRV/RHR arrive, and only change if Google Health delivers new data for them.</p>
      <h3>Strain (0–21)</h3>
      <p class="calc">Heart-rate load (TRIMP) from minutes in Google Health heart-rate zones:<br><code>load = 1×light + 2×moderate + 3×vigorous + 4×peak</code><br><code>strain = 21 × ln(1 + load/25) ÷ ln(1 + 600/25)</code>, max 21.<br>Logarithmic like WHOOP: the first minutes of effort add the most. If zone minutes are unavailable, Active Zone Minutes are used (fat-burn×2, cardio/peak AZM×1.5/×2).</p>
      ${line(s, (i) => `Today: load ${i.trimp}${z ? ` (light ${z.light}, moderate ${z.moderate}, vigorous ${z.vigorous}, peak ${z.peak} min)` : ''} → strain ${i.value}.`)}
      <h3>Recovery (%)</h3>
      <p class="calc">Compares today with your own baseline from the previous 30 days:<br><code>HRV score = 60 + 20 × z</code>, z = (ln HRV today − mean ln HRV) ÷ SD<br><code>RHR score = 60 + 20 × z</code>, z = (mean RHR − RHR today) ÷ SD<br><code>sleep score = hours asleep ÷ goal × 100</code><br><code>recovery = 0.6×HRV + 0.2×RHR + 0.2×sleep</code> (each 0–100; weights re-balanced if a part is missing).<br>Shows "Calibrating" until at least 4 previous days of HRV exist. Green ≥ 67, yellow 34–66, red &lt; 34.</p>
      ${line(r, (i) => `Today: HRV ${i.parts.hrv}${i.parts.rhr !== undefined ? `, RHR ${i.parts.rhr}` : ''}${i.parts.sleep !== undefined ? `, sleep ${i.parts.sleep}` : ''} → ${i.value}% (baseline HRV ${i.baseline.hrv} ms over ${i.hrvDays} days).`)}
      ${r.v === null && r.info && r.info.calibrating ? `<p class="calc-today">Today: calibrating (${r.info.hrvDays}/${r.info.need} days of HRV).</p>` : ''}
      <h3>Sleep quality (%)</h3>
      <p class="calc">The Google Health API does not provide a sleep score, so Pulse uses:<br><code>0.5×efficiency + 0.3×duration + 0.2×restorative</code><br>efficiency = time asleep ÷ time in bed; duration = hours asleep ÷ goal (max 100); restorative = (deep + REM) share ÷ 40% (max 100). Without stages: 0.6×efficiency + 0.4×duration.</p>
      ${line(q, (i) => `Today: efficiency ${i.parts.efficiency}, duration ${i.parts.duration}${i.parts.restorative !== undefined ? `, restorative ${i.parts.restorative}` : ''} → ${i.value}%.`)}
      <h3>Targets (automatic)</h3>
      <p class="calc">The Google Health API does not share your app goals, so targets come from your own data:<br><b>Sleep target</b> = average time asleep over the previous 14 nights, kept within 7–9 h (8 h default until 7 nights exist).<br><b>Step target</b> = average of the previous 30 days, rounded to 500 (10,000 default until 7 days exist).<br><b>Strain target</b> = 6 + 0.1 × today's recovery, ±2 (e.g. recovery 100% → 14–18, 50% → 9–13, 0% → 4–8).</p>
      <p class="calc-today">Today: sleep ${esc(fmtHours(sleepGoal()))} (${esc(targetSrc(sleepTargetInfo()))}) · steps ${stepTargetInfo().value.toLocaleString()} (${esc(targetSrc(stepTargetInfo()))}) · strain ${esc(fmtBand(strainTargetInfo()))}${strainTargetInfo() ? '' : ' (needs today\'s recovery)'}</p>
      <p class="disclaimer">These are Pulse's own estimates for personal insight, not WHOOP or Fitbit scores and not medical advice.</p>
      <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn primary" type="button" id="ex-close">Done</button></div>`);
    $('#ex-close').addEventListener('click', closeSheet);
  }

  // ---------- tabs ----------
  const TABS = ['today', 'fitness', 'sleep', 'health'];
  let currentTab = null;
  function showTab(t, animate = true) {
    if (!TABS.includes(t)) t = 'today';
    const changed = t !== currentTab;
    currentTab = t;
    $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    try { history.replaceState(null, '', '#' + t); } catch (e) { /* ignore */ }
    if (changed) window.scrollTo(0, 0);
    if (animate && changed) replayRings($('#tab-' + t));
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---------- sheet ----------
  let onSheetClose = null;
  function openSheet(html, onClose) {
    $('#sheet-body').innerHTML = html;
    onSheetClose = onClose || null;
    const sheet = $('#sheet'), bd = $('#backdrop');
    sheet.hidden = false; bd.hidden = false; sheet.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('open'); bd.classList.add('open'); }));
  }
  function replaceSheet(html, onClose) { $('#sheet-body').innerHTML = html; onSheetClose = onClose || null; $('#sheet').scrollTop = 0; }
  function closeSheet() {
    const sheet = $('#sheet'), bd = $('#backdrop');
    if (sheet.hidden) return;
    sheet.classList.remove('open'); bd.classList.remove('open');
    const cb = onSheetClose; onSheetClose = null;
    if (cb) cb();
    setTimeout(() => { if (!sheet.classList.contains('open')) { sheet.hidden = true; bd.hidden = true; } }, 320);
  }
  $('#backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  // ---------- read-only detail sheets ----------
  const row = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v === null || v === undefined || v === '' ? '–' : esc(String(v))}</b></div>`;
  function historyRows(m) {
    return last7().slice().reverse().map((d) => { const k = dayKey(d), v = getVal(m, k); return row(k === dayKey() ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), v === null ? null : m === 'strain' ? v.toFixed(1) : v + '%'); }).join('');
  }
  function openScoreDetail(m) {
    const k = dayKey(), mt = metric(m), v = mt.v, i = mt.info || {}, c = RINGS[m], goal = i.goal || sleepGoal();
    const big = v === null ? '–' : m === 'strain' ? v.toFixed(1) + ' / 21' : v + '%';
    let inputs = '', how = '';
    if (m === 'strain') {
      const z = ser('zones')[k], a = ser('azm')[k];
      inputs = row('Light zone', z ? z.light + ' min' : null) + row('Moderate zone', z ? z.moderate + ' min' : null) + row('Vigorous zone', z ? z.vigorous + ' min' : null) + row('Peak zone', z ? z.peak + ' min' : null) +
        row('Active Zone Minutes', a ? a.total : null) + row('Heart-rate load (TRIMP)', i.trimp ?? null) + row('Target today', strainTargetInfo() ? fmtBand(strainTargetInfo()) + ' (from recovery)' : 'needs today\'s recovery') + row('Method', i.method === 'azm' ? 'Active Zone Minutes (no zone minutes)' : i.method ? 'Heart-rate zone minutes' : null);
      how = 'load = 1×light + 2×moderate + 3×vigorous + 4×peak minutes; strain = 21 × ln(1 + load/25) ÷ ln(25), max 21. Recalculated at every sync, so it builds up through the day.';
    } else if (m === 'recovery') {
      const p = i.parts || {}, b = i.baseline || {};
      inputs = row('HRV today', syncedVal('hrv', k) !== null ? Math.round(syncedVal('hrv', k)) + ' ms' : null) + row('HRV baseline (30 d)', b.hrv ? b.hrv + ' ms' : null) +
        row('Resting HR today', syncedVal('rhr', k) !== null ? syncedVal('rhr', k) + ' bpm' : null) + row('Resting HR baseline', b.rhr ? b.rhr + ' bpm' : null) +
        row('Sleep last night', syncedVal('sleepHours', k) !== null ? fmtHours(syncedVal('sleepHours', k)) : null) + row('Sleep target', fmtHours(goal)) + row('Days of HRV history', i.hrvDays ?? null) +
        row('HRV score', p.hrv ?? null) + row('Resting HR score', p.rhr ?? null) + row('Sleep score', p.sleep ?? null);
      how = 'HRV score = 60 + 20 × z (today vs your 30-day baseline, log scale); RHR score = 60 + 20 × z (lower is better); sleep score = hours ÷ goal. Recovery = 0.6×HRV + 0.2×RHR + 0.2×sleep. Set once per day; recalculated only if new sleep/HRV/RHR data arrives. Needs 4 previous days of HRV.';
    } else {
      const sl = syncedSleep(k), p = i.parts || {};
      inputs = row('Asleep', sl ? fmtHours(sl.sleepHours) : null) + row('Bedtime → wake', sl && sl.bedtime ? `${sl.bedtime} → ${sl.wake}` : null) + row('Efficiency', sl && isNum(sl.efficiency) ? sl.efficiency + '%' : null) +
        row('Deep + REM', sl && sl.stages && sl.minutesAsleep ? Math.round(((sl.stages.deep + sl.stages.rem) / sl.minutesAsleep) * 100) + '%' : null) + row('Sleep target', `${fmtHours(goal)} (${sleepTargetInfo().source})`) +
        row('Efficiency score', p.efficiency ?? null) + row('Duration score', p.duration ?? null) + row('Restorative score', p.restorative ?? null);
      how = '0.5×efficiency + 0.3×duration + 0.2×restorative (deep+REM share ÷ 40%). Without stages: 0.6×efficiency + 0.4×duration. Uses last night\'s main sleep from Google Health (naps ignored).';
    }
    openSheet(`
      <h2 id="sheet-title">${esc(c.title)}</h2>
      <p class="sheet-sub">Calculated automatically from Google Health${mt.at ? ` · calculated ${hhmm(mt.at)}` : ''}${updatedText() ? ` · data ${esc(updatedText().toLowerCase())}` : ''}</p>
      <div class="readout" style="color:${v === null ? '#98a2b3' : ringColor(m, v)}">${esc(big)}</div>
      <div class="readout-sub">${v === null ? esc(missingReason(m)) : m === 'recovery' ? recZone(v) + ' zone' : m === 'strain' ? ringPct('strain', v) + '% of max' : ''}</div>
      <h3>Today's inputs</h3><div class="kvs">${inputs}</div>
      <h3>How it's calculated</h3><p class="calc">${esc(how)}</p>
      <h3>Last 7 days</h3><div class="kvs">${historyRows(m)}</div>
      <div class="sheet-actions" style="grid-template-columns:1fr 1fr"><button class="btn" type="button" data-explain>All formulas</button><button class="btn primary" type="button" id="sd-close">Done</button></div>`);
    $('#sd-close').addEventListener('click', closeSheet);
  }
  function openVitalDetail(f) {
    const c = HEALTH[f];
    const rows = last7().slice().reverse().map((d) => { const k = dayKey(d), v = getVal(f, k); return row(k === dayKey() ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), v === null ? null : (f === 'temp' && v > 0 ? '+' : '') + fmtNum(v, c.dec) + (c.unit ? ' ' + c.unit : '')); }).join('');
    openSheet(`
      <h2 id="sheet-title">${esc(c.label)}</h2>
      <p class="sheet-sub">From Google Health${updatedText() ? ' · ' + esc(updatedText()) : ''}. Read-only.</p>
      ${f === 'steps' ? `<p class="calc-today">Step target ${stepTargetInfo().value.toLocaleString()} · ${esc(targetSrc(stepTargetInfo()))}</p>` : ''}
      <div class="kvs">${rows}</div>
      <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn primary" type="button" id="vd-close">Done</button></div>`);
    $('#vd-close').addEventListener('click', closeSheet);
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
    if (action) $('button', t).addEventListener('click', () => { action.fn(); t.hidden = true; });
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, action ? 5000 : 2400);
  }

  // ---------- canvas drawing ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawRing(ctx, cx, cy, r, lw, m, v, sz) {
    const pct = ringPct(m, v);
    ctx.save();
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.strokeStyle = COL.track; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const p = v === null ? 0 : clamp(v / RINGS[m].max, 0, 1);
    if (p > 0) {
      ctx.strokeStyle = ringColor(m, v);
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(p, 0.9999)); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = v === null ? COL.faint : COL.text;
    ctx.font = `800 ${sz.pct}px ${FONT}`;
    ctx.fillText(pct === null ? '–' : pct + '%', cx, cy + sz.pct * 0.3);
    ctx.fillStyle = COL.muted; ctx.font = `600 ${sz.sub}px ${FONT}`;
    ctx.fillText(ringSub(m, v, true), cx, cy + sz.pct * 0.3 + sz.sub * 1.35);
    if (sz.label) {
      ctx.fillStyle = COL.text; ctx.font = `700 ${sz.label}px ${FONT}`;
      ctx.fillText(RINGS[m].label, cx, cy + r + lw / 2 + sz.label * 1.35);
    }
    ctx.restore();
  }

  // Rings image for clipboard: metrics = subset of RING_ORDER; bg = 'white' | 'transparent'.
  function ringsCanvas(metrics, bg) {
    const cell = 300, padX = 36, padY = 44, n = metrics.length;
    const W = padX * 2 + cell * n, H = padY * 2 + 330;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (bg !== 'transparent') {
      ctx.fillStyle = '#ffffff'; roundRect(ctx, 1, 1, W - 2, H - 2, 44); ctx.fill();
      ctx.strokeStyle = '#e7e9ee'; ctx.lineWidth = 2; ctx.stroke();
    }
    metrics.forEach((m, i) => drawRing(ctx, padX + cell * i + cell / 2, padY + 124, 110, 24, m, getVal(m), { pct: 60, sub: 24, label: 30 }));
    return c;
  }

  const CW = 1080, CH = 1350;
  function drawCard() {
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, CW, CH);
    ctx.save(); ctx.shadowColor = 'rgba(16,24,40,0.08)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 48, 48, CW - 96, CH - 96, 56); ctx.fill(); ctx.restore();

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.muted; ctx.font = `700 28px ${FONT}`; ctx.fillText('PULSE · DAILY SUMMARY', 112, 150);
    ctx.fillStyle = COL.text; ctx.font = `800 60px ${FONT}`; ctx.fillText(longDate(), 112, 224);

    RING_ORDER.forEach((m, i) => drawRing(ctx, 256 + i * 284, 430, 108, 26, m, getVal(m), { pct: 56, sub: 24, label: 30 }));

    // stat tiles
    const sh = getVal('sleepHours'), rhr = getVal('rhr'), hrv = getVal('hrv'), steps = getVal('steps');
    const stats = [
      ['Sleep', sh === null ? null : fmtHours(sh), ''],
      ['Resting HR', rhr === null ? null : String(rhr), ' bpm'],
      ['HRV', hrv === null ? null : String(hrv), ' ms'],
      ['Steps', steps === null ? null : steps.toLocaleString(), '']
    ];
    const tw = (CW - 224 - 24) / 2;
    stats.forEach(([lab, val, unit], i) => {
      const x = 112 + (i % 2) * (tw + 24), y = 660 + Math.floor(i / 2) * 150;
      ctx.fillStyle = '#f3f4f7'; roundRect(ctx, x, y, tw, 126, 28); ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = COL.muted; ctx.font = `600 26px ${FONT}`; ctx.fillText(lab, x + 28, y + 46);
      ctx.fillStyle = val === null ? COL.faint : COL.text; ctx.font = `800 46px ${FONT}`;
      const txt = val === null ? '–' : val; ctx.fillText(txt, x + 28, y + 100);
      if (val !== null && unit) { const w = ctx.measureText(txt).width; ctx.fillStyle = COL.muted; ctx.font = `600 26px ${FONT}`; ctx.fillText(unit, x + 30 + w, y + 100); }
    });

    // workouts
    const today = workoutsFor(dayKey()).slice().reverse();
    const mins = today.reduce((a, w) => a + w.duration, 0);
    ctx.fillStyle = COL.muted; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(today.length ? `WORKOUTS · ${mins} MIN` : 'WORKOUTS', 112, 1000);
    if (!today.length) {
      ctx.fillStyle = COL.faint; ctx.font = `600 32px ${FONT}`; ctx.fillText('None recorded today', 112, 1052);
    } else {
      let x = 112, y = 1022, row = 0, shown = 0;
      ctx.font = `700 28px ${FONT}`;
      for (const w of today) {
        const a = actInfo(w);
        const label = `${a.label} ${w.duration}′`;
        const cw = ctx.measureText(label).width + 60;
        if (x + cw > CW - 112) { row++; if (row > 1) break; x = 112; y += 72; }
        ctx.fillStyle = '#f3f4f7'; roundRect(ctx, x, y, cw, 58, 29); ctx.fill();
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(x + 28, y + 29, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.text; ctx.fillText(label, x + 44, y + 39);
        x += cw + 12; shown++;
      }
      if (shown < today.length) { ctx.fillStyle = COL.muted; ctx.fillText(`+${today.length - shown} more`, 112, y + 110); }
    }
    ctx.fillStyle = '#98a2b3'; ctx.font = `600 24px ${FONT}`;
    ctx.fillText(SYNC && SYNC.fetchedAt ? `Calculated from Google Health · ${updatedText()}` : 'No Google Health data yet', 112, CH - 104);
    return c;
  }

  // ---------- image export helpers ----------
  function dataURLToBlob(url) {
    const [head, b64] = url.split(',');
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.slice(5).split(';')[0] });
  }
  const canvasBlobSync = (c) => dataURLToBlob(c.toDataURL('image/png'));
  const canvasBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function shareOrDownload(blob, name, title) {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title }).catch((e) => {
        if (e && e.name === 'AbortError') return;
        download(blob, name); toast('Sharing unavailable, image downloaded');
      });
    }
    download(blob, name); toast('Image downloaded');
    return Promise.resolve();
  }
  const clipboardImageSupported = () => typeof window.ClipboardItem !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function';

  // Must be called synchronously from a click handler (iOS Safari needs clipboard.write inside the gesture;
  // the PNG itself is passed as a Promise<Blob>).
  function copyRingsImage(metrics, bg) {
    const canvas = ringsCanvas(metrics, bg);
    const name = `pulse-rings-${dayKey()}.png`;
    if (clipboardImageSupported()) {
      let item;
      try { item = new ClipboardItem({ 'image/png': canvasBlob(canvas) }); }
      catch (e) { item = null; }
      if (item) {
        navigator.clipboard.write([item]).then(
          () => toast('Copied, paste anywhere'),
          () => { openRingsSheet(); toast('Copy was blocked. Long-press the image to save, or use Share.'); }
        );
        return;
      }
    }
    shareOrDownload(canvasBlobSync(canvas), name, 'Pulse rings');
  }

  function openRingsSheet() {
    const bg = state.settings.copyBg === 'transparent' ? 'transparent' : 'white';
    const sheetHTML = `
      <h2 id="sheet-title">Rings image</h2>
      <p class="sheet-sub">Copy and paste into chats, notes or docs. You can also long-press the image to save it.</p>
      <div class="seg" role="group" aria-label="Background">
        <button type="button" data-bg="white" class="${bg === 'white' ? 'on' : ''}">White card</button>
        <button type="button" data-bg="transparent" class="${bg === 'transparent' ? 'on' : ''}">Transparent</button>
      </div>
      <div class="img-prev ${bg === 'transparent' ? 'checker' : ''}"><img id="rc-img" alt="Rings image"></div>
      <span class="lbl" style="margin-top:14px">Copy</span>
      <div class="copy-row">
        <button class="btn primary" type="button" data-copy="all">All</button>
        ${RING_ORDER.map((m) => `<button class="btn" type="button" data-copy="${m}">${RINGS[m].label}</button>`).join('')}
      </div>
      <div class="actions">
        <button class="btn" type="button" id="rc-dl">Download</button>
        <button class="btn" type="button" id="rc-share">Share</button>
      </div>`;
    if ($('#sheet').hidden) openSheet(sheetHTML); else replaceSheet(sheetHTML);
    const cur = () => (state.settings.copyBg === 'transparent' ? 'transparent' : 'white');
    const paintImg = () => {
      $('#rc-img').src = ringsCanvas(RING_ORDER, cur()).toDataURL('image/png');
      $('.img-prev', $('#sheet')).classList.toggle('checker', cur() === 'transparent');
      $$('.seg button', $('#sheet')).forEach((b) => b.classList.toggle('on', b.dataset.bg === cur()));
    };
    $$('.seg button', $('#sheet')).forEach((b) => b.addEventListener('click', () => { state.settings.copyBg = b.dataset.bg; save(); paintImg(); }));
    $$('[data-copy]', $('#sheet')).forEach((b) => b.addEventListener('click', () => {
      copyRingsImage(b.dataset.copy === 'all' ? RING_ORDER : [b.dataset.copy], cur());
    }));
    $('#rc-dl').addEventListener('click', () => download(canvasBlobSync(ringsCanvas(RING_ORDER, cur())), `pulse-rings-${dayKey()}.png`));
    $('#rc-share').addEventListener('click', () => shareOrDownload(canvasBlobSync(ringsCanvas(RING_ORDER, cur())), `pulse-rings-${dayKey()}.png`, 'Pulse rings'));
    paintImg();
  }

  $('#btn-copy-rings').addEventListener('click', () => copyRingsImage(RING_ORDER, state.settings.copyBg === 'transparent' ? 'transparent' : 'white'));
  $('#btn-rings-options').addEventListener('click', openRingsSheet);

  // summary card preview + actions
  let cardTimer = null, cardUrl = null;
  function scheduleCard() {
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      canvasBlob(drawCard()).then((b) => {
        if (cardUrl) URL.revokeObjectURL(cardUrl);
        cardUrl = URL.createObjectURL(b);
        $('#card-preview').src = cardUrl;
      }).catch(() => {});
    }, 120);
  }
  const cardName = () => `pulse-${dayKey()}.png`;
  $('#btn-download').addEventListener('click', () => download(canvasBlobSync(drawCard()), cardName()));
  $('#btn-share').addEventListener('click', () => shareOrDownload(canvasBlobSync(drawCard()), cardName(), 'Pulse daily summary'));

  // ---------- global events ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-settings]')) { openSettings(); return; }
    if (t.closest('[data-explain]')) { if (!$('#sheet').hidden) { closeSheet(); setTimeout(openExplainer, 330); } else openExplainer(); return; }
    if (t.closest('#btn-connect')) { startConnect(); return; }
    if (t.closest('#btn-sync-now')) { doSync(true); return; }
    const ring = t.closest('.ringw'); if (ring) { openScoreDetail(ring.dataset.ring); return; }
    const er = t.closest('[data-detail]'); if (er) { openScoreDetail(er.dataset.detail); return; }
    const hv = t.closest('[data-health]'); if (hv) { openVitalDetail(hv.dataset.health); return; }
    const go = t.closest('[data-go]'); if (go) { showTab(go.dataset.go); return; }
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  // ---------- auto refresh: on open, when visible again (visibilitychange/focus/pageshow) and every 15 min ----------
  const AUTO_EVERY = 15 * 60 * 1000;
  let lastKey = dayKey(), lastAuto = 0;
  function autoRefresh(reason) {
    if (document.visibilityState === 'hidden') return 'hidden';
    if (dayKey() !== lastKey) { lastKey = dayKey(); render(); }
    if (reason !== 'timer' && Date.now() - lastAuto < 3000) return 'debounced';
    lastAuto = Date.now();
    if (!PS) return 'no-sync';
    if (PS.tokenValid()) { doSync(false, true); return 'sync'; }
    // Token expired: try a silent (prompt=none) re-auth, but never while a sheet is open; otherwise show the banner.
    if ($('#sheet').hidden && PS.maybeSilentReconnect()) return 'silent';
    renderSyncUI();
    return 'banner';
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoRefresh('visible'); });
  window.addEventListener('focus', () => autoRefresh('focus'));
  window.addEventListener('pageshow', (e) => { if (e.persisted) autoRefresh('pageshow'); });
  setInterval(() => autoRefresh('timer'), AUTO_EVERY);
  setInterval(() => { if (document.visibilityState === 'visible') { renderSyncUI(); const up = updatedText(); if ($('#rings-updated').textContent !== up) render(); } }, 60 * 1000);
  window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); render(); } });

  // ---------- boot ----------
  let redirect = { handled: false };
  if (PS) {
    redirect = PS.handleRedirect();
    if (!redirect.handled && PS.maybeSilentReconnect()) return; // navigating to Google (prompt=none); comes straight back
  }
  render();
  showTab(location.hash.slice(1) || 'today', false);
  requestAnimationFrame(() => replayRings($('#tab-' + currentTab)));
  if (redirect.handled) {
    if (redirect.ok) toast('Google Health connected');
    else if (redirect.error === 'access_denied') toast('Google Health access was not granted');
    else if (!redirect.silent) toast(`Could not connect Google Health (${redirect.error})`);
  }
  if (PS && PS.tokenValid()) { lastAuto = Date.now(); doSync(!!redirect.ok, !redirect.ok); }

  // Pull to refresh (Today tab)
  (function () {
    let y0 = null, pulled = false;
    const ind = $('#ptr');
    window.addEventListener('touchstart', (e) => { y0 = window.scrollY <= 0 && currentTab === 'today' && $('#sheet').hidden ? e.touches[0].clientY : null; pulled = false; }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      pulled = dy > 80;
      ind.hidden = dy < 20;
      ind.textContent = pulled ? 'Release to sync' : 'Pull to sync';
    }, { passive: true });
    window.addEventListener('touchend', () => {
      ind.hidden = true;
      if (y0 !== null && pulled) {
        if (PS && PS.tokenValid()) doSync(true);
        else if (PS && PS.status() !== 'no-client') toast('Connect Google Health to sync');
      }
      y0 = null; pulled = false;
    });
  })();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}); });
  }

  window.__pulse = { drawCard, ringsCanvas, dayKey, migrate, metric, doSync, autoRefresh, scores: () => SCORES };
})();
