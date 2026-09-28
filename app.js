/* Pulse v2 – manual-entry daily health dashboard. No network data sources; nothing is invented. */
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
  const PICKER = ['gym', 'running', 'walking', 'cycling', 'swimming', 'basketball', 'tennis', 'yoga', 'hiit', 'boxing', 'hiking', 'other'];

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
  // Manual entries (typed in by the user) always win; then Google Health synced values; then values calculated from them.
  function manualVal(f, k = dayKey()) { const d = state.days[k]; return d && isNum(d[f]) ? d[f] : null; }
  let SYNC = null, COMPUTED = {};
  function refreshSync() { SYNC = window.PulseSync ? window.PulseSync.cache() : null; COMPUTED = {}; }
  const SERIES = ['rhr', 'hrv', 'spo2', 'resp', 'temp', 'weight', 'steps', 'calories'];
  function syncedSleep(k) { return SYNC && SYNC.series && SYNC.series.sleep ? SYNC.series.sleep[k] || null : null; }
  function syncedVal(f, k) {
    if (!SYNC || !SYNC.series) return null;
    if (SERIES.includes(f)) { const ser = SYNC.series[f]; const v = ser && ser[k]; return isNum(v) ? v : null; }
    if (f === 'sleepHours') { const sl = syncedSleep(k); return sl && isNum(sl.sleepHours) ? sl.sleepHours : null; }
    return null;
  }
  function mergedSeries(f) {
    const out = {};
    if (SYNC && SYNC.series && SYNC.series[f]) Object.assign(out, SYNC.series[f]);
    Object.keys(state.days).forEach((k) => { const v = manualVal(f, k); if (v !== null) out[k] = v; });
    return out;
  }
  function computed(f, k) {
    const ck = f + '|' + k;
    if (ck in COMPUTED) return COMPUTED[ck];
    const PM = window.PulseMetrics, goal = state.settings.sleepGoal || 8;
    let r = null;
    if (PM) {
      const ser = SYNC && SYNC.series;
      if (f === 'strain' && ser) { const z = ser.zones && ser.zones[k], a = ser.azm && ser.azm[k]; if (z || a) r = PM.computeStrain(z, a); }
      else if (f === 'sleep') { const sl = syncedSleep(k); if (sl) r = PM.computeSleepQuality(sl, goal); }
      else if (f === 'recovery') {
        const hrv = mergedSeries('hrv');
        if (Object.keys(hrv).length) r = PM.computeRecovery(k, hrv, mergedSeries('rhr'), getVal('sleepHours', k), goal);
      }
    }
    COMPUTED[ck] = r;
    return r;
  }
  function metric(f, k = dayKey()) {
    const man = manualVal(f, k);
    if (man !== null) return { v: man, src: 'manual' };
    if (f === 'strain' || f === 'sleep' || f === 'recovery') {
      const c = computed(f, k);
      return c && isNum(c.value) ? { v: c.value, src: 'calc', info: c } : { v: null, src: null, info: c };
    }
    const sv = syncedVal(f, k);
    return sv !== null ? { v: sv, src: 'google' } : { v: null, src: null };
  }
  function getVal(f, k = dayKey()) { return metric(f, k).v; }
  function getStr(f, k = dayKey()) {
    const d = state.days[k];
    if (d && typeof d[f] === 'string') return d[f];
    if ((f === 'bedtime' || f === 'wake') && manualVal('sleepHours', k) === null) { const sl = syncedSleep(k); return sl && sl[f] ? sl[f] : null; }
    return null;
  }
  const SRC_LABEL = { manual: 'Manual', google: 'Google Health', calc: 'Calculated' };
  const srcBadge = (src) => (src ? `<span class="src src-${src}">${SRC_LABEL[src]}</span>` : '');
  function setFields(obj, k = dayKey()) {
    const d = Object.assign({}, state.days[k]);
    for (const [f, v] of Object.entries(obj)) { if (v === null || v === undefined || v === '') delete d[f]; else d[f] = v; }
    if (Object.keys(d).length) state.days[k] = d; else delete state.days[k];
    save();
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
    if (m === 'strain') return v === null ? (forImage ? 'not logged' : 'Tap to add') : `${v.toFixed(1)} / 21`;
    if (m === 'sleep') { const h = getVal('sleepHours'); return h !== null ? fmtHours(h) : v === null ? (forImage ? 'not logged' : 'Tap to add') : 'quality'; }
    return v === null ? (forImage ? 'not logged' : 'Tap to add') : recZone(v);
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
    return `<button class="ringw ${size || ''}" type="button" data-ring="${m}" aria-label="${RINGS[m].title}: tap to edit">
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
  function updateRings(preview = {}) {
    $$('.ringw').forEach((w) => {
      const m = w.dataset.ring;
      const mt = m in preview ? { v: preview[m], src: 'manual' } : metric(m);
      const v = mt.v;
      const p = v === null ? 0 : clamp(v / RINGS[m].max, 0, 1);
      const rv = $('.rv', w);
      rv.style.strokeDashoffset = String(CIRC * (1 - p));
      rv.style.opacity = p > 0 ? '1' : '0';
      rv.style.stroke = ringColor(m, v);
      const pct = ringPct(m, v);
      $('.ringw-pct', w).textContent = pct === null ? '–' : pct + '%';
      const cal = v === null && mt.info && mt.info.calibrating;
      $('.ringw-sub', w).textContent = cal ? `Calibrating ${mt.info.hrvDays}/${mt.info.need}` : ringSub(m, v, false);
      $('.ringw-src', w).innerHTML = srcBadge(mt.src);
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
        s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${o.color}" opacity="${isToday ? 1 : 0.55}"/>`;
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
    const goal = state.settings.sleepGoal || 8, rhr = getVal('rhr'), hrv = getVal('hrv');
    if (rec !== null) {
      if (rec < 34) list.push({ t: 'bad', m: `Recovery is in the red (${rec}%). A lighter day could make sense: easy movement, mobility or rest.` });
      else if (rec < 67) list.push({ t: 'warn', m: `Recovery is yellow (${rec}%). Training is fine, but keep the intensity controlled.` });
      else list.push({ t: 'good', m: `Recovery is green (${rec}%). A good day for a harder session if you feel up to it.` });
    }
    if (strain !== null && rec !== null) {
      const sp = (strain / 21) * 100;
      if (sp > rec + 25) list.push({ t: 'warn', m: `Strain (${strain.toFixed(1)}) is high relative to your recovery. Prioritise sleep, food and fluids tonight.` });
      else if (rec >= 67 && strain < 8) list.push({ t: 'info', m: `Recovery is green but strain is only ${strain.toFixed(1)} so far. There is room for a session today.` });
    }
    if (sh !== null) {
      const diff = goal - sh;
      if (diff >= 1) list.push({ t: 'warn', m: `You slept ${fmtHours(sh)}, ${fmtHours(diff)} short of your ${goal}h goal. An earlier night could help.` });
      else if (diff > 0) list.push({ t: 'info', m: `You slept ${fmtHours(sh)}, just under your ${goal}h goal.` });
      else list.push({ t: 'good', m: `You slept ${fmtHours(sh)}, meeting your ${goal}h goal.` });
    }
    if (sq !== null && sq < 70) list.push({ t: 'warn', m: `Sleep quality was ${sq}%. A consistent bedtime and less screen time before bed often help.` });
    const psh = priorVals('sleepHours');
    if (psh.length >= 3) {
      const a = avg(psh);
      if (a < goal - 0.5) list.push({ t: 'info', m: `Your average over the previous ${psh.length} logged nights is ${fmtHours(a)}, below your ${goal}h goal.` });
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
    } else list.push({ t: 'info', m: 'No workouts logged in the last 7 days. Log one from the Fitness tab.' });
    const recInfo = metric('recovery').info;
    if (rec === null && recInfo && recInfo.calibrating) list.push({ t: 'info', m: `Recovery is calibrating: it needs HRV from at least ${recInfo.need} previous days (currently ${recInfo.hrvDays}).` });
    const missing = [];
    if (rec === null && !(recInfo && recInfo.calibrating)) missing.push('recovery');
    if (sh === null) missing.push('sleep hours');
    if (sq === null) missing.push('sleep quality');
    if (strain === null) missing.push('strain');
    if (rhr === null) missing.push('resting HR');
    if (missing.length) list.push({ t: 'none', m: `Add today's ${missing.join(', ')} for more feedback.` });
    return list;
  }

  // ---------- render ----------
  function render() {
    refreshSync();
    $$('[data-date]').forEach((el) => { el.textContent = longDate(); });
    renderSyncUI();
    updateRings();
    const any = RING_ORDER.some((m) => getVal(m) !== null);
    $('#today-empty').hidden = any;
    renderToday(); renderFitness(); renderSleep(); renderHealth();
    scheduleCard();
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
      tile('Workouts today', today.length ? String(today.length) : null, today.length ? ` · ${mins} min` : '', today.length ? today.map((w) => actInfo(w).label).slice(0, 2).join(', ') : 'Tap to log', 'fitness') +
      tile('Sleep', sh !== null ? fmtHours(sh) : null, '', sh !== null ? `goal ${state.settings.sleepGoal}h` : 'Tap to log', 'sleep', shM.src) +
      tile('Resting HR', rhr !== null ? String(rhr) : null, 'bpm', rhr !== null ? 'today' : 'Tap to add', 'health', rhrM.src) +
      tile('Steps', steps !== null ? steps.toLocaleString() : null, '', steps !== null ? 'today' : 'Tap to add', 'health', stM.src);
    $('#insights').innerHTML = insights().map((i) => `<li class="${i.t}"><span class="ind" aria-hidden="true"></span><span>${esc(i.m)}</span></li>`).join('');
  }

  function allWorkouts() {
    const hidden = new Set(state.hiddenSync || []);
    const synced = (SYNC && Array.isArray(SYNC.workouts) ? SYNC.workouts : []).filter((w) => !hidden.has(w.id));
    return state.workouts.concat(synced);
  }
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
        <div class="meta">${w.rpe ? `Effort ${w.rpe}/10 · ` : ''}${w.avgHr ? `avg ${w.avgHr} bpm · ` : ''}${w.calories ? `${w.calories} kcal · ` : ''}${esc(when)}</div>
        ${w.source === 'google' ? srcBadge('google') : ''}
        ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
      </div>
      <button class="del" type="button" data-del="${esc(w.id)}" aria-label="Delete ${esc(a.label)} entry">✕</button>
    </li>`;
  }
  function renderFitness() {
    const s = getVal('strain');
    $('#fit-strain').innerHTML = s === null ? '–' : `${s.toFixed(1)}<span class="muted"> / 21</span>`;
    const sm = metric('strain'), azmT = SYNC && SYNC.series && SYNC.series.azm && SYNC.series.azm[dayKey()];
    let fsub = s === null ? (window.PulseSync && window.PulseSync.status() === 'connected' ? 'No heart-rate zone data yet today' : "Tap the ring to enter today's strain") : `${ringPct('strain', s)}% of max strain`;
    if (sm.src === 'calc' && sm.info) fsub += ` · load ${sm.info.trimp}`;
    if (azmT) fsub += ` · ${azmT.total} AZM`;
    $('#fit-strain-sub').textContent = fsub;
    const tk = dayKey();
    const today = workoutsFor(tk);
    const cutoff = Date.now() - 14 * 864e5;
    const recent = allWorkouts().filter((w) => dayKey(new Date(w.ts)) !== tk && w.ts >= cutoff).sort((a, b) => b.ts - a.ts).slice(0, 20);
    $('#today-list').innerHTML = today.length ? today.map((w) => liHTML(w, false)).join('') : '<li class="empty">No workouts logged today</li>';
    $('#recent-list').innerHTML = recent.length ? recent.map((w) => liHTML(w, true)).join('') : '<li class="empty">No workouts in the last 14 days</li>';
    const mins = today.reduce((a, w) => a + w.duration, 0);
    $('#today-total').textContent = today.length ? `${today.length} today · ${mins} min` : '';
    const vals = last7().map((d) => workoutsFor(dayKey(d)).reduce((a, w) => a + w.duration, 0));
    const tot = vals.reduce((a, b) => a + b, 0);
    const n = last7().reduce((a, d) => a + workoutsFor(dayKey(d)).length, 0);
    $('#week-total').textContent = tot ? `${tot} min · ${n} session${n > 1 ? 's' : ''}` : 'No workouts yet';
    $('#week-chart').innerHTML = barChart(vals, { color: COL.strain, fmt: (v) => String(v), label: 'Workout minutes per day, last 7 days' });
  }
  function renderSleep() {
    const h = getVal('sleepHours'), q = getVal('sleep'), goal = state.settings.sleepGoal || 8;
    const bed = getStr('bedtime'), wake = getStr('wake');
    $('#sl-hours').textContent = h === null ? '–' : fmtHours(h);
    let sub;
    if (h === null) sub = `No sleep logged for today · goal ${goal}h`;
    else {
      const d = h - goal;
      sub = (bed && wake ? `${bed} → ${wake} · ` : '') + (d >= 0 ? `goal ${goal}h met` : `${fmtHours(-d)} under ${goal}h goal`);
    }
    if (q !== null) sub += ` · quality ${q}%`;
    $('#sl-sub').textContent = sub;
    const hm = metric('sleepHours');
    $('#sl-src').innerHTML = srcBadge(hm.src);
    const sl = manualVal('sleepHours') === null ? syncedSleep(dayKey()) : null;
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
    $('#sleep-avg').textContent = (got.length ? `avg ${fmtHours(avg(got))} · ` : '') + `goal ${fmtHours(goal)}`;
    $('#sleep-chart').innerHTML = barChart(vals.map((v) => v || 0), { color: COL.sleep, goal, fmt: (v) => (Math.round(v * 10) / 10) + 'h', label: 'Sleep hours per night, last 7 days' });
  }
  function renderHealth() {
    const r = getVal('recovery');
    $('#hl-rec').textContent = r === null ? '–' : `${recZone(r)} zone`;
    $('#hl-rec').style.color = r === null ? '' : recColor(r);
    const rm = metric('recovery');
    $('#hl-rec-sub').textContent = r === null
      ? (rm.info && rm.info.calibrating ? `Calibrating: needs ${rm.info.need} days of HRV (have ${rm.info.hrvDays})` : "Tap the ring to enter today's recovery")
      : (r >= 67 ? 'Well recovered' : r >= 34 ? 'Moderately recovered' : 'Low recovery, go easy');
    if (r === null && rm.info && rm.info.calibrating) { $('#hl-rec').textContent = 'Calibrating'; }
    const days = last7();
    $('#vitals').innerHTML = HEALTH_ORDER.map((f) => {
      const c = HEALTH[f], v = getVal(f), vals = days.map((d) => getVal(f, dayKey(d)));
      if (f === 'calories' && v === null && !vals.some((x) => x !== null) && !(SYNC && SYNC.series)) return '';
      return `<button class="tile vital${v === null ? ' empty' : ''}" type="button" data-health="${f}">
        <span class="t-label">${esc(c.label)}</span>
        <span class="t-val">${v === null ? '–' : esc((f === 'temp' && v > 0 ? '+' : '') + fmtNum(v, c.dec))}${v !== null && c.unit ? `<small>${esc(c.unit)}</small>` : ''}</span>
        <span class="t-sub">${v === null ? 'Tap to add' : srcBadge(metric(f).src)}</span>
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
    } else {
      bar.hidden = !(c && c.fetchedAt);
      if (!bar.hidden) bar.innerHTML = `<span class="dot-off"></span><span>Showing Google Health data from ${esc(ago(c.fetchedAt))}</span>`;
      card.hidden = false;
      const txt = st === 'no-client' ? ['Auto-sync from Google Health', 'Connect your Fitbit data from the Google Health app. One-time setup in Settings.', 'Set up']
        : st === 'expired' ? ['Reconnect Google Health', 'Your Google session ended. Reconnect to keep syncing.', 'Reconnect']
        : ['Connect Google Health', 'Fill your rings, sleep, vitals and workouts automatically from the Google Health app.', 'Connect'];
      card.innerHTML = `<div><strong>${txt[0]}</strong><p class="muted small">${txt[1]}</p></div><button class="btn primary sm2" type="button" id="btn-connect">${txt[2]}</button>`;
    }
  }
  function startConnect() {
    if (!PS.clientId()) { openSettings(); return; }
    PS.setMeta({ needsReconnect: false });
    PS.connect({ returnTab: currentTab || 'today' });
  }
  function doSync(force) {
    if (!PS || !PS.tokenValid() || syncing) return Promise.resolve();
    syncing = true; renderSyncUI();
    return PS.sync(force).then((res) => {
      syncing = false;
      PS.setMeta({ lastErrors: (res.errors || []).map((e) => `${e.type}: ${e.status || ''} ${e.message || ''}`.trim()), lastResult: res.error || 'ok' });
      if (res.error === 'auth') toast('Google Health session expired. Tap Reconnect.');
      else if (res.error === 'profile') toast("Your Google Health profile isn't set up yet. Open the Google Health app first.");
      else if (!res.ok) toast('Sync failed. Check Settings for details.');
      else if (!res.skipped) toast(res.errors.length ? `Synced (some data unavailable)` : 'Synced from Google Health');
      render();
      if ($('#set-status')) openSettings();
    });
  }

  function openSettings() {
    const st = PS.status(), m = PS.meta(), c = PS.cache(), cidSrc = PS.clientIdSource(), t = PS.token();
    const pill = st === 'connected' ? '<span class="pill ok">Connected</span>' : st === 'expired' ? '<span class="pill warn">Expired</span>' : st === 'no-client' ? '<span class="pill">Not set up</span>' : '<span class="pill">Not connected</span>';
    const info = st === 'connected'
      ? `${m.email ? esc(m.email) + ' · ' : ''}token valid ${Math.max(0, Math.round((t.expires_at - Date.now()) / 60000))} min · last synced ${esc(ago(c && c.fetchedAt))}`
      : st === 'expired' ? `${m.email ? esc(m.email) + ' · ' : ''}last synced ${esc(ago(c && c.fetchedAt))}` : st === 'no-client' ? 'Add your OAuth Client ID below to enable sync.' : 'Not connected yet.';
    const btns = st === 'connected'
      ? '<button class="btn primary" type="button" id="set-sync">Sync now</button><button class="btn danger" type="button" id="set-disc">Disconnect</button>'
      : st === 'no-client' ? '' : `<button class="btn primary" type="button" id="set-connect">${st === 'expired' ? 'Reconnect' : 'Connect'} Google Health</button>${m.linked ? '<button class="btn danger" type="button" id="set-disc">Disconnect</button>' : ''}`;
    const errs = (m.lastErrors || []).length ? `<p class="sheet-note">Last sync: some data could not be read (${esc(m.lastErrors.slice(0, 4).join('; '))}). Check that the Google Health API is enabled and all scopes were allowed.</p>` : '';
    const html = `
      <h2 id="sheet-title">Settings</h2>
      <div class="set-card">
        <div class="set-row"><div><div class="set-title">Google Health</div><div class="muted small" id="set-status">${info}</div></div>${pill}</div>
        ${btns ? `<div class="actions">${btns}</div>` : ''}
        ${errs}
        <label class="check"><input type="checkbox" id="set-auto" ${m.autoReconnect === false ? '' : 'checked'}> Reconnect automatically when the app opens (tokens last ~1 hour)</label>
      </div>
      <div class="field">
        <label for="set-cid">Google OAuth Client ID</label>
        <div class="row"><input class="txt" id="set-cid" type="text" autocomplete="off" spellcheck="false" placeholder="1234567890-abc123.apps.googleusercontent.com" value="${esc(PS.clientId())}" ${cidSrc === 'config' ? 'disabled' : ''}><button class="btn" type="button" id="set-cid-save" ${cidSrc === 'config' ? 'disabled' : ''}>Save</button></div>
        <p class="muted small">${cidSrc === 'config' ? 'Set in config.js.' : 'Stored only in this browser.'} Authorized JavaScript origin: <code>${esc(location.origin)}</code><br>Authorized redirect URI: <code>${esc(PS.redirectUri())}</code></p>
      </div>
      <details class="setup"><summary>How to get a Client ID (one-time, ~10 min)</summary>
        <ol>
          <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> and create a project (e.g. "Pulse").</li>
          <li>Enable the <a href="https://console.cloud.google.com/apis/library/health.googleapis.com" target="_blank" rel="noopener">Google Health API</a>.</li>
          <li>Google Auth Platform › Branding: app name "Pulse", your email. Audience: External, keep "Testing", add your Google account as a test user.</li>
          <li>Data Access › Add scopes: googlehealth.activity_and_fitness.readonly, googlehealth.health_metrics_and_measurements.readonly, googlehealth.sleep.readonly.</li>
          <li>Clients › Create client › Web application. Authorized JavaScript origin <code>${esc(location.origin)}</code>, redirect URI <code>${esc(PS.redirectUri())}</code>.</li>
          <li>Copy the Client ID here (no client secret needed) and tap Connect.</li>
        </ol>
      </details>
      <button class="btn block" type="button" data-explain>How scores are calculated</button>
      ${c ? '<button class="btn block" type="button" id="set-clear-cache">Clear synced data from this device</button>' : ''}
      <p class="disclaimer">Privacy: Pulse has no server. Your Google access token and all synced and typed data are stored only in this browser (localStorage) and sent only to Google's APIs. Disconnect removes the token; you can also revoke access at myaccount.google.com/permissions.</p>`;
    if ($('#sheet').hidden) openSheet(html); else replaceSheet(html);
    const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
    on('set-connect', startConnect);
    on('set-sync', () => doSync(true));
    on('set-disc', () => { PS.disconnect(); toast('Disconnected from Google Health'); render(); openSettings(); });
    on('set-clear-cache', () => { PS.clearCache(); toast('Synced data cleared'); render(); openSettings(); });
    on('set-cid-save', () => {
      const v = $('#set-cid').value.trim();
      if (v && !PS.validClientId(v)) { toast('That does not look like a Google OAuth Client ID'); return; }
      PS.setClientId(v); toast(v ? 'Client ID saved' : 'Client ID removed'); render(); openSettings();
    });
    $('#set-auto').addEventListener('change', (e) => PS.setMeta({ autoReconnect: e.target.checked }));
  }

  function openExplainer() {
    const k = dayKey(), s = metric('strain'), r = metric('recovery'), q = metric('sleep');
    const z = SYNC && SYNC.series && SYNC.series.zones && SYNC.series.zones[k];
    const line = (m, fn) => (m.src === 'calc' && m.info ? `<p class="calc-today">${fn(m.info)}</p>` : m.src === 'manual' ? '<p class="calc-today">Today: you entered this value manually, so it is used as-is.</p>' : '');
    openSheet(`
      <h2 id="sheet-title">How scores are calculated</h2>
      <p class="sheet-sub">Only real data is used: values synced from Google Health or typed by you. Missing data shows "–". Values you type always override calculated ones.</p>
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
  function setRangeFill(input, color) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--pct', pct + '%');
    if (color) input.style.setProperty('--fill', color);
  }

  // Generic numeric editor. Starts empty ("–") when there is no value; Save stays disabled until a value is set.
  function openNumberEditor(o) {
    let val = o.value;
    const fmt = o.fmt || ((v) => fmtNum(v, o.dec));
    openSheet(`
      <h2 id="sheet-title">${esc(o.title)}</h2>
      <p class="sheet-sub">${esc(o.sub)}</p>
      ${o.note ? `<p class="sheet-note">${esc(o.note)}</p>` : ''}
      <div class="readout"><span id="ne-read">–</span>${o.unit ? `<small>${esc(o.unit)}</small>` : ''}</div>
      <div class="readout-sub" id="ne-word"></div>
      <input type="range" id="ne-range" min="${o.min}" max="${o.max}" step="${o.step}" value="${val === null ? o.start : val}" aria-label="${esc(o.title)} slider">
      <div class="field row">
        <button class="step" type="button" id="ne-minus" aria-label="Decrease">−</button>
        <input class="num" id="ne-num" type="number" inputmode="decimal" min="${o.min}" max="${o.max}" step="${o.dec ? o.step : 1}" placeholder="Enter value" aria-label="${esc(o.title)} value">
        <button class="step" type="button" id="ne-plus" aria-label="Increase">+</button>
      </div>
      <div class="sheet-actions">
        ${o.canClear && o.onClear ? `<button class="btn danger" type="button" id="ne-clear">${o.clearLabel || 'Clear'}</button>` : '<button class="btn" type="button" id="ne-cancel">Cancel</button>'}
        <button class="btn primary" type="button" id="ne-save">Save</button>
      </div>`, o.onClose);
    const range = $('#ne-range'), num = $('#ne-num'), saveBtn = $('#ne-save');
    const paint = (from) => {
      if (val !== null && from !== 'range') range.value = val;
      if (from !== 'num') num.value = val === null ? '' : o.dec ? val.toFixed(o.dec) : String(val);
      $('#ne-read').textContent = val === null ? '–' : fmt(val);
      const color = val === null ? '#98a2b3' : o.color ? o.color(val) : COL.text;
      $('#ne-read').style.color = color;
      $('#ne-word').textContent = val !== null && o.word ? o.word(val) : val === null ? 'Not set' : '';
      setRangeFill(range, val === null ? '#d0d5dd' : o.color ? o.color(val) : COL.strain);
      saveBtn.disabled = val === null;
      if (o.preview) o.preview(val);
    };
    const update = (v, from) => { if (!isFinite(v)) return; val = clamp(roundTo(v, o.dec), o.min, o.max); paint(from); };
    range.addEventListener('input', () => update(parseFloat(range.value), 'range'));
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (isFinite(v) && v >= o.min && v <= o.max) update(v, 'num'); });
    num.addEventListener('change', () => { const v = parseFloat(num.value); if (isFinite(v)) update(v); else paint(); });
    $('#ne-minus').addEventListener('click', () => update((val === null ? o.start : val) - o.bump));
    $('#ne-plus').addEventListener('click', () => update((val === null ? o.start : val) + o.bump));
    saveBtn.addEventListener('click', () => { if (val === null) return; o.onSave(val); closeSheet(); render(); });
    const clr = $('#ne-clear'); if (clr) clr.addEventListener('click', () => { o.onClear(); closeSheet(); render(); });
    const cnl = $('#ne-cancel'); if (cnl) cnl.addEventListener('click', closeSheet);
    paint();
  }

  function openRingEditor(m) {
    const c = RINGS[m];
    const mt = metric(m), man = manualVal(m);
    openNumberEditor({
      canClear: man !== null, clearLabel: isNum((computed(m, dayKey()) || {}).value) ? 'Use calculated' : 'Clear',
      note: man === null && mt.src === 'calc' ? `Calculated from Google Health data. Saving a value here overrides it for today.` : (man !== null && computed(m, dayKey()) && isNum(computed(m, dayKey()).value) ? `Calculated value: ${fmtNum(computed(m, dayKey()).value, c.dec)}. Clear to use it.` : ''),
      title: c.title, sub: `Today · ${c.sub}. Copy the number from your Fitbit app.`,
      unit: m === 'strain' ? '/ 21' : '%', min: 0, max: c.max, step: c.step, dec: c.dec, bump: c.bump, start: c.start,
      value: getVal(m),
      color: (v) => ringColor(m, v),
      word: (v) => (m === 'strain' ? `${ringPct(m, v)}% of max` : m === 'recovery' ? `${recZone(v)} zone` : ''),
      preview: (v) => updateRings({ [m]: v }),
      onClose: () => updateRings(),
      onSave: (v) => { setFields({ [m]: v }); toast(`${c.title} saved`); },
      onClear: () => { setFields({ [m]: null }); toast(`${c.title} cleared`); }
    });
  }
  function openHealthEditor(f) {
    const c = HEALTH[f];
    openNumberEditor({
      title: c.label, sub: `Today · enter the value from your Fitbit app${c.unit ? ` (${c.unit})` : ''}.`,
      unit: c.unit, min: c.min, max: c.max, step: c.step, dec: c.dec, bump: c.bump, start: c.start,
      value: getVal(f), color: () => c.color,
      canClear: manualVal(f) !== null,
      note: manualVal(f) === null && syncedVal(f, dayKey()) !== null ? 'From Google Health. Saving a value here overrides it for today.' : (manualVal(f) !== null && syncedVal(f, dayKey()) !== null ? `Google Health value: ${fmtNum(syncedVal(f, dayKey()), c.dec)}. Clear to use it.` : ''),
      onSave: (v) => { setFields({ [f]: v }); toast(`${c.label} saved`); },
      onClear: () => { setFields({ [f]: null }); toast(`${c.label} cleared`); }
    });
  }
  function openGoalEditor() {
    openNumberEditor({
      title: 'Sleep goal', sub: 'Target hours of sleep per night.', unit: '', min: 4, max: 12, step: 0.25, dec: 2, bump: 0.25, start: 8,
      value: state.settings.sleepGoal || 8, fmt: fmtHours, color: () => COL.sleep, canClear: false,
      onSave: (v) => { state.settings.sleepGoal = v; save(); toast('Sleep goal saved'); }
    });
  }

  function openSleepSheet() {
    const h0 = getVal('sleepHours'), bed0 = getStr('bedtime') || '', wake0 = getStr('wake') || '', manualSleep = manualVal('sleepHours') !== null;
    openSheet(`
      <h2 id="sheet-title">Log sleep</h2>
      <p class="sheet-sub">Last night's sleep, saved for today (${esc(longDate())}).</p>
      <div class="readout" id="sl-read">–</div>
      <div class="readout-sub" id="sl-word"></div>
      <div class="field two">
        <label>Bedtime<input class="num" type="time" id="sl-bed" value="${esc(bed0)}"></label>
        <label>Woke up<input class="num" type="time" id="sl-wake" value="${esc(wake0)}"></label>
      </div>
      <div class="field">
        <label for="sl-h">Or enter hours asleep</label>
        <div class="row">
          <button class="step" type="button" id="sl-minus" aria-label="Minus 15 minutes">−</button>
          <input class="num" id="sl-h" type="number" inputmode="decimal" min="0" max="16" step="0.25" placeholder="e.g. 7.5" value="${h0 === null ? '' : h0}">
          <button class="step" type="button" id="sl-plus" aria-label="Plus 15 minutes">+</button>
        </div>
      </div>
      <div class="sheet-actions">
        ${manualSleep ? '<button class="btn danger" type="button" id="sl-clear">Clear</button>' : '<button class="btn" type="button" id="sl-cancel">Cancel</button>'}
        <button class="btn primary" type="button" id="sl-save">Save</button>
      </div>`);
    const bed = $('#sl-bed'), wake = $('#sl-wake'), hin = $('#sl-h'), saveBtn = $('#sl-save');
    let hours = h0;
    const goal = state.settings.sleepGoal || 8;
    const paint = () => {
      $('#sl-read').textContent = hours === null ? '–' : fmtHours(hours);
      $('#sl-read').style.color = hours === null ? '#98a2b3' : COL.sleep;
      $('#sl-word').textContent = hours === null ? 'Not set' : hours >= goal ? `Meets your ${goal}h goal` : `${fmtHours(goal - hours)} under your ${goal}h goal`;
      saveBtn.disabled = !(hours > 0);
    };
    const fromTimes = () => {
      if (!bed.value || !wake.value) return;
      const [bh, bm] = bed.value.split(':').map(Number), [wh, wm] = wake.value.split(':').map(Number);
      const mins = ((wh * 60 + wm) - (bh * 60 + bm) + 1440) % 1440;
      hours = roundTo(mins / 60, 2); hin.value = hours; paint();
    };
    bed.addEventListener('input', fromTimes); wake.addEventListener('input', fromTimes);
    bed.addEventListener('change', fromTimes); wake.addEventListener('change', fromTimes);
    hin.addEventListener('input', () => {
      const v = parseFloat(hin.value);
      hours = isFinite(v) && v > 0 && v <= 16 ? roundTo(v, 2) : null;
      bed.value = ''; wake.value = ''; paint();
    });
    const bump = (d) => { hours = clamp(roundTo((hours === null ? goal : hours) + d, 2), 0.25, 16); hin.value = hours; bed.value = ''; wake.value = ''; paint(); };
    $('#sl-minus').addEventListener('click', () => bump(-0.25));
    $('#sl-plus').addEventListener('click', () => bump(0.25));
    saveBtn.addEventListener('click', () => {
      if (!(hours > 0)) return;
      setFields({ sleepHours: hours, bedtime: bed.value && wake.value ? bed.value : null, wake: bed.value && wake.value ? wake.value : null });
      closeSheet(); render(); toast(`Sleep saved · ${fmtHours(hours)}`);
    });
    const clr = $('#sl-clear'); if (clr) clr.addEventListener('click', () => { setFields({ sleepHours: null, bedtime: null, wake: null }); closeSheet(); render(); toast('Sleep cleared'); });
    const cnl = $('#sl-cancel'); if (cnl) cnl.addEventListener('click', closeSheet);
    paint();
  }

  // ---------- workouts ----------
  function openPicker() {
    openSheet(`
      <h2 id="sheet-title">Log an activity</h2>
      <p class="sheet-sub">Pick an activity or type your own.</p>
      <div class="act-grid">
        ${['football', 'padel'].concat(PICKER).map((k) => `<button class="act" type="button" data-act="${k}"><span class="e" aria-hidden="true">${ACTIVITIES[k].emoji}</span>${esc(ACTIVITIES[k].label)}</button>`).join('')}
      </div>
      <div class="field">
        <label for="pk-name">Custom activity</label>
        <div class="row">
          <input class="txt" id="pk-name" type="text" maxlength="40" placeholder="e.g. Squash, Climbing" autocomplete="off">
          <button class="btn primary" type="button" id="pk-next">Next</button>
        </div>
      </div>`);
    $$('.act', $('#sheet')).forEach((b) => b.addEventListener('click', () => workoutForm(b.dataset.act, null, true)));
    const next = () => {
      const name = $('#pk-name').value.trim().slice(0, 40);
      if (!name) { $('#pk-name').focus(); toast('Type an activity name'); return; }
      workoutForm('custom', name, true);
    };
    $('#pk-next').addEventListener('click', next);
    $('#pk-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') next(); });
  }

  const RPE_WORDS = ['', 'Very light', 'Very light', 'Light', 'Light', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Max effort'];
  function workoutForm(activity, name, inPlace) {
    const a = ACTIVITIES[activity] || { label: name, emoji: '🏅' };
    const label = activity === 'custom' ? name : a.label;
    const presets = [30, 45, 60, 90, 120];
    const html = `
      <h2 id="sheet-title">${a.emoji} Log ${esc(label)}</h2>
      <p class="sheet-sub">Saved with the current time.</p>
      <div class="field">
        <label for="wk-dur">Duration (minutes)</label>
        <div class="row">
          <button class="step" type="button" id="wk-minus" aria-label="Minus 5 minutes">−</button>
          <input class="num" id="wk-dur" type="number" inputmode="numeric" min="1" max="600" step="1" value="60">
          <button class="step" type="button" id="wk-plus" aria-label="Plus 5 minutes">+</button>
        </div>
        <div class="chips">${presets.map((p) => `<button class="chip${p === 60 ? ' on' : ''}" type="button" data-min="${p}">${p}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="wk-rpe">Effort (RPE 1–10): <strong id="wk-rpe-read" style="color:var(--text)"></strong></label>
        <input type="range" id="wk-rpe" min="1" max="10" step="1" value="6">
      </div>
      <div class="field">
        <label for="wk-note">Note (optional)</label>
        <textarea id="wk-note" maxlength="140" placeholder="Anything worth remembering"></textarea>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" id="wk-cancel">Cancel</button>
        <button class="btn primary" type="button" id="wk-save">Save</button>
      </div>`;
    if (inPlace && !$('#sheet').hidden) replaceSheet(html); else openSheet(html);
    const dur = $('#wk-dur'), rpe = $('#wk-rpe');
    const rpeColor = (v) => (v <= 4 ? COL.high : v <= 7 ? COL.mid : COL.low);
    const syncChips = () => $$('.chip', $('#sheet')).forEach((c) => c.classList.toggle('on', +c.dataset.min === +dur.value));
    const setDur = (v) => { dur.value = clamp(Math.round(v) || 1, 1, 600); syncChips(); };
    const syncRpe = () => { const v = +rpe.value; $('#wk-rpe-read').textContent = `${v} · ${RPE_WORDS[v]}`; setRangeFill(rpe, rpeColor(v)); };
    $('#wk-minus').addEventListener('click', () => setDur((+dur.value || 0) - 5));
    $('#wk-plus').addEventListener('click', () => setDur((+dur.value || 0) + 5));
    dur.addEventListener('input', syncChips);
    $$('.chip', $('#sheet')).forEach((c) => c.addEventListener('click', () => setDur(+c.dataset.min)));
    rpe.addEventListener('input', syncRpe); syncRpe();
    $('#wk-cancel').addEventListener('click', closeSheet);
    $('#wk-save').addEventListener('click', () => {
      const d = parseInt(dur.value, 10);
      if (!(d >= 1 && d <= 600)) { dur.focus(); toast('Enter a duration between 1 and 600 min'); return; }
      const entry = { id: uid(), activity, duration: d, rpe: +rpe.value, note: $('#wk-note').value.trim().slice(0, 140), ts: Date.now() };
      if (activity === 'custom') entry.name = name;
      state.workouts.push(entry);
      save(); closeSheet(); render();
      toast(`${label} logged · ${d} min`);
    });
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
      ctx.fillStyle = COL.faint; ctx.font = `600 32px ${FONT}`; ctx.fillText('None logged today', 112, 1052);
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
    ctx.fillText('Manually logged in Pulse', 112, CH - 104);
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
    const ring = t.closest('.ringw'); if (ring) { openRingEditor(ring.dataset.ring); return; }
    const er = t.closest('[data-edit-ring]'); if (er) { openRingEditor(er.dataset.editRing); return; }
    const hv = t.closest('[data-health]'); if (hv) { openHealthEditor(hv.dataset.health); return; }
    const go = t.closest('[data-go]'); if (go) { showTab(go.dataset.go); return; }
    const q = t.closest('[data-quick]'); if (q) { workoutForm(q.dataset.quick, null, false); return; }
    const del = t.closest('[data-del]');
    if (del) {
      const id = del.dataset.del;
      if (id.startsWith('gh:')) {
        state.hiddenSync = (state.hiddenSync || []).concat(id);
        save(); render();
        toast('Hidden from Pulse', { label: 'Undo', fn: () => { state.hiddenSync = state.hiddenSync.filter((x) => x !== id); save(); render(); } });
        return;
      }
      const idx = state.workouts.findIndex((w) => w.id === id);
      if (idx < 0) return;
      const [removed] = state.workouts.splice(idx, 1);
      save(); render();
      toast('Workout deleted', { label: 'Undo', fn: () => { state.workouts.push(removed); save(); render(); } });
    }
  });
  $('#btn-log-other').addEventListener('click', openPicker);
  $('#btn-log-sleep').addEventListener('click', openSleepSheet);
  $('#btn-sleep-goal').addEventListener('click', openGoalEditor);
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  let lastKey = dayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (dayKey() !== lastKey) { lastKey = dayKey(); render(); }
    if (PS && PS.tokenValid()) doSync(false);
  });
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
  if (PS && PS.tokenValid()) doSync(!!redirect.ok);

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

  window.__pulse = { drawCard, ringsCanvas, dayKey, migrate, metric, doSync };
})();
