/* Pulse v5 – daily health dashboard. Sleep, Recovery and Strain are always calculated from Google Health data
   (never typed in); missing data shows "–" with the reason. Nothing is invented. */
(() => {
  'use strict';

  const KEY = 'pulse.v1'; // storage key kept from v1; data is migrated in place (schema v2)
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const COL = { strain: '#ff8a00', sleep: '#4c3fd6', high: '#2f9e44', mid: '#e8a100', low: '#f03e3e', text: '#0f1115', muted: '#6b7280', faint: '#b3b8c2', track: 'rgba(15,17,21,0.07)' };
  // Gradient ring strokes (start → end): strain yellow→orange, sleep light-blue→indigo, recovery tinted by zone.
  const GRAD = { strain: ['#ffd43b', '#ff8a00'], sleep: ['#74c0fc', '#4c3fd6'], green: ['#c0eb75', '#2f9e44'], yellow: ['#ffe066', '#94d82d'], red: ['#ffa94d', '#f03e3e'] };
  const STAGE_COL = { deep: '#3f2fb3', light: '#9d8cf5', rem: '#22b8cf', awake: '#f79009' };
  // Sources shown in the app (details in docs/calibration.md).
  const SOURCES = {
    whoopRec: ['WHOOP: How recovery works (zones 1–99%)', 'https://www.whoop.com/gb/en/thelocker/how-does-whoop-recovery-work-101/'],
    whoopAvg: ['WHOOP member averages (recovery ≈ 58%)', 'https://www.whoop.com/us/en/thelocker/member-averages-recovery-strain-sleep-hrv/'],
    whoopStrain: ['WHOOP: How strain works (0–21, logarithmic)', 'https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/'],
    whoopCoach: ['WHOOP: Strain target from recovery', 'https://www.whoop.com/us/en/thelocker/strain-coach/'],
    whoopNeed: ['WHOOP: How much sleep do I need?', 'https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need/'],
    oura: ['Oura: Readiness score (85+ optimal, 100 rare)', 'https://ouraring.com/blog/readiness-score/'],
    ghSleep: ['Google Health: Sleep score bands (most people 72–83)', 'https://support.google.com/googlehealth/answer/14236513'],
    ghReady: ['Google Health: Readiness (HRV, RHR, sleep)', 'https://support.google.com/googlehealth/answer/14236710'],
    ghStages: ['Google Health: Sleep stages', 'https://support.google.com/googlehealth/answer/14236712'],
    plews: ['Plews et al. 2012: HRV in elite triathletes', 'https://www.springermedicine.com/heart-rate-variability-in-elite-triathletes-is-variation-in-vari/21070152'],
    buchheit: ['Buchheit 2014: Monitoring training status with HR measures', 'https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2014.00073/full'],
    edwards: ['Edwards TRIMP in football training vs matches', 'https://www.mdpi.com/2227-7080/11/3/79'],
    paluch: ['Paluch et al. 2022 (Lancet Public Health): steps & mortality', 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext'],
    tudor: ['Tudor-Locke et al. 2011: steps for adolescents', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3166269/'],
    aasm: ['AASM: Recommended sleep for children & teens (8–10 h at 13–18)', 'https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf'],
    statpearls: ['StatPearls: Physiology, Sleep Stages', 'https://www.ncbi.nlm.nih.gov/books/NBK526132/'],
    ohayon: ['Ohayon et al. 2004: sleep stage norms across ages', 'https://academic.oup.com/sleep/article/27/7/1255/2696490'],
    vancauter: ['Van Cauter et al. 1998: deep sleep & growth hormone', 'https://academic.oup.com/sleep/article/21/6/553/2725972'],
    walker: ['Walker et al. 2002: sleep & motor skill learning', 'https://walkerlab.berkeley.edu/reprints/Walker%20et%20al._Neuron_2002.pdf'],
    mah: ['Mah et al. 2011: sleep extension in athletes', 'https://med.stanford.edu/news/all-news/2011/07/snooze-you-win-its-true-for-achieving-hoop-dreams-says-study.html'],
    phillips: ['Phillips et al. 2017: irregular sleep & circadian timing', 'https://www.nature.com/articles/s41598-017-03171-4'],
    stutz: ['Stutz et al. 2019: evening exercise & sleep (meta-analysis)', 'https://pubmed.ncbi.nlm.nih.gov/30374942/'],
    okamoto: ['Okamoto-Mizuno & Mizuno 2012: heat & sleep', 'https://link.springer.com/article/10.1186/1880-6805-31-14'],
    drake: ['Drake et al. 2013: caffeine 6 h before bed', 'https://aasm.org/late-afternoon-and-early-evening-caffeine-can-disrupt-sleep-at-night/'],
    chang: ['Chang et al. 2015: evening screen light & melatonin', 'https://www.pnas.org/doi/abs/10.1073/pnas.1418490112']
  };
  const srcLink = (id) => (SOURCES[id] ? `<a class="srclink" href="${SOURCES[id][1]}" target="_blank" rel="noopener">${SOURCES[id][0]}</a>` : '');

  const RINGS = {
    sleep:    { label: 'Sleep',    title: 'Sleep score',   max: 100, step: 1,   dec: 0, bump: 1,   start: 75, sub: 'Sleep score, 1–99' },
    recovery: { label: 'Recovery', title: 'Recovery',      max: 100, step: 1,   dec: 0, bump: 1,   start: 50, sub: 'Recovery / readiness, 0–100%' },
    strain:   { label: 'Strain',   title: 'Strain',        max: 21,  step: 0.1, dec: 1, bump: 0.5, start: 10, sub: 'Day strain, 0–21 scale' }
  };
  const RING_ORDER = ['strain', 'recovery', 'sleep'];

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
  // Date switcher: VIEW = selected past day (read-only history) or null for today.
  let VIEW = null;
  const viewKey = () => VIEW || dayKey();
  const isTodayKey = (k) => k === dayKey();
  const keyDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const prevKey = (k) => { const d = keyDate(k); d.setDate(d.getDate() - 1); return dayKey(d); };
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
  // Sleep need for the night ending on day k (WHOOP-style: 8.5 h base + strain + sleep debt − naps).
  function sleepTargetInfo(k = viewKey()) {
    const ck = 'ST|' + k; if (ck in MEMO) return MEMO[ck];
    const PM = window.PulseMetrics;
    if (!PM) return { value: 8.5, base: 8.5, strainAdd: 0, debtAdd: 0, napSub: 0 };
    const pk = prevKey(k), st = {}, sv = getVal('strain', pk);
    if (sv !== null) st[pk] = sv;
    return (MEMO[ck] = PM.sleepNeed(k, ser('sleep'), st));
  }
  const needText = (t) => `${fmtHours(t.base)} base${t.strainAdd ? ` + ${t.strainAdd} min for strain` : ''}${t.debtAdd ? ` + ${t.debtAdd} min sleep debt` : ''}${t.napSub ? ` − ${t.napSub} min naps` : ''}`;
  const sleepGoal = (k = viewKey()) => sleepTargetInfo(k).value;
  function stepTargetInfo(k = viewKey()) {
    const ck = 'SP|' + k; if (ck in MEMO) return MEMO[ck];
    const PM = window.PulseMetrics;
    return (MEMO[ck] = PM ? PM.stepTarget(k, ser('steps')) : { value: 10000, source: 'default', days: 0, need: 7 });
  }
  function strainTargetInfo(k = viewKey()) { const PM = window.PulseMetrics; return PM ? PM.strainTarget(getVal('recovery', k)) : null; }
  const targetSrc = (t) => (t.source === 'default' ? `default until ${t.need} days of data (${t.days} so far)` : `your ${t.days}-day average ${Math.round(t.avg).toLocaleString()} + 10%`);
  const fmtBand = (t) => (t ? `${t.low.toFixed(1)}–${t.high.toFixed(1)}` : '–');

  // ---- persisted daily score history ----
  const SCORES_KEY = 'pulse.scores';
  function loadScores() {
    // v2 = recalibrated formulas (Pulse v5); older stored scores are discarded and recalculated from the cache.
    try { const s = JSON.parse(localStorage.getItem(SCORES_KEY) || 'null'); if (s && s.v === 2 && s.days && typeof s.days === 'object') return s; } catch (e) { /* ignore */ }
    scoresDirty = true;
    return { v: 2, days: {} };
  }
  let scoresDirty = false;
  let SCORES = loadScores();
  function saveScores() {
    if (!scoresDirty) return;
    const keys = Object.keys(SCORES.days).sort();
    while (keys.length > 400) delete SCORES.days[keys.shift()];
    try { localStorage.setItem(SCORES_KEY, JSON.stringify(SCORES)); } catch (e) { /* ignore */ }
    scoresDirty = false;
  }
  const slim = (r) => { const o = { value: r.value }; ['parts', 'trimp', 'method', 'baseline', 'hrvDays', 'weights', 'goal', 'z', 'need', 'pcts', 'awakePct', 'timingDev'].forEach((x) => { if (r[x] !== undefined) o[x] = r[x]; }); return o; };
  // Live calculation from the synced cache: returns {sig, res} or null when the inputs are not in the cache.
  function liveScore(f, k) {
    const PM = window.PulseMetrics;
    if (!PM || !SYNC || !SYNC.series) return null;
    if (f === 'strain') {
      const z = ser('zones')[k], a = ser('azm')[k];
      if (!z && !a) return null;
      return { sig: JSON.stringify([z || null, a || null]), res: PM.computeStrain(z, a) };
    }
    if (f === 'sleep') {
      const sl = syncedSleep(k);
      if (!sl || !(sl.minutesAsleep > 0)) return null;
      const goal = sleepGoal(k), timing = PM.timingDeviation(k, ser('sleep'));
      // sig = the night's own data; need/timing come from earlier days, so a stored score stays stable.
      return { sig: JSON.stringify([sl.minutesAsleep, sl.minutesInBed, sl.stages || null, sl.bedRel ?? null, sl.wakeRel ?? null]), res: Object.assign(PM.computeSleepScore(sl, goal, timing) || {}, { goal }) };
    }
    if (f === 'recovery') {
      const hrv = ser('hrv'), rhr = ser('rhr'), resp = ser('resp');
      if (!Object.keys(hrv).length) return null;
      const sq = getVal('sleep', k);
      const r = PM.computeRecovery(k, hrv, rhr, sq, resp);
      return { sig: JSON.stringify([hrv[k] ?? null, rhr[k] ?? null, resp[k] ?? null, sq]), res: r };
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
  function metric(f, k = viewKey()) {
    const ck = f + '|' + k;
    if (ck in MEMO) return MEMO[ck];
    let r;
    if (SCORE_KEYS.includes(f)) r = score(f, k);
    else { const sv = syncedVal(f, k); r = sv !== null ? { v: sv, src: 'google' } : { v: null, src: null }; }
    return (MEMO[ck] = r);
  }
  function getVal(f, k = viewKey()) { return metric(f, k).v; }
  function getStr(f, k = viewKey()) { const sl = syncedSleep(k); return (f === 'bedtime' || f === 'wake') && sl && sl[f] ? sl[f] : null; }
  // Why a score is missing (shown instead of a number).
  function missingReason(f, k = viewKey()) {
    const st = window.PulseSync ? window.PulseSync.status() : 'no-client';
    if (!(SYNC && SYNC.fetchedAt)) return st === 'connected' ? 'Syncing with Google Health…' : st === 'expired' ? 'Reconnect Google Health' : 'Connect Google Health';
    const info = metric(f, k).info, today = isTodayKey(k);
    if (f === 'recovery') return info && info.calibrating ? `Calibrating: ${info.hrvDays} of ${info.need} days of HRV` : today ? 'No HRV recorded yet today' : 'No HRV recorded that day';
    if (f === 'sleep') return today ? 'No sleep recorded yet' : 'No sleep recorded that night';
    return today ? 'No heart-rate zone data yet today' : 'No heart-rate zone data that day';
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
  const ringGrad = (m, v) => (m === 'recovery' ? GRAD[v === null ? 'yellow' : v >= 67 ? 'green' : v >= 34 ? 'yellow' : 'red'] : GRAD[m]);
  const sleepBand = (v) => (v === null ? '' : v >= 90 ? 'Excellent' : v >= 80 ? 'Good' : v >= 60 ? 'Fair' : 'Poor');
  const ringPct = (m, v) => (v === null ? null : m === 'strain' ? Math.round((v / 21) * 100) : Math.round(v));
  function ringSub(m, v, forImage) {
    if (v === null) return forImage ? 'no data' : '';
    if (m === 'strain') return `${v.toFixed(1)} / 21`;
    if (m === 'sleep') { const h = getVal('sleepHours'); return h !== null ? fmtHours(h) : sleepBand(v); }
    return recZone(v);
  }
  function last7() {
    const out = [], base = keyDate(viewKey());
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
  let RID = 0;
  function ringWidgetHTML(m, size) {
    const id = 'rg' + (++RID);
    const hatch = m === 'strain' ? `<pattern id="${id}h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="rgba(255,138,0,0.12)"/><rect width="2" height="5" fill="rgba(232,110,0,0.6)"/></pattern>` : '';
    return `<button class="ringw ${size || ''}" type="button" data-ring="${m}" aria-label="${RINGS[m].title}: details">
      <span class="ringw-g">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="g0" stop-color="${GRAD[m === 'recovery' ? 'yellow' : m][0]}"/><stop offset="1" class="g1" stop-color="${GRAD[m === 'recovery' ? 'yellow' : m][1]}"/></linearGradient>${hatch}</defs>
          <circle class="rt" cx="60" cy="60" r="${R}"/>
          ${m === 'strain' ? `<circle class="rtgt" cx="60" cy="60" r="${R}" transform="rotate(-90 60 60)" stroke="url(#${id}h)" style="opacity:0"/>` : ''}
          <circle class="rv" cx="60" cy="60" r="${R}" transform="rotate(-90 60 60)" stroke="url(#${id})" style="stroke-dasharray:${CIRC} ${CIRC};stroke-dashoffset:${CIRC};opacity:0"/>
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
      const g = ringGrad(m, v);
      $('.g0', w).setAttribute('stop-color', g[0]); $('.g1', w).setAttribute('stop-color', g[1]);
      const tg = $('.rtgt', w);
      if (tg) {
        const t = strainTargetInfo();
        if (t) {
          const a = (t.low / 21) * CIRC, b = (t.high / 21) * CIRC;
          tg.style.strokeDasharray = `${(b - a).toFixed(2)} ${CIRC.toFixed(2)}`; tg.style.strokeDashoffset = String(-a); tg.style.opacity = '1';
          w.dataset.target = `${t.low}-${t.high}`;
        } else { tg.style.opacity = '0'; delete w.dataset.target; }
      }
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
      const x = left + slot * i + (slot - bw) / 2, isToday = i === n - 1, isRealToday = isToday && isTodayKey(dayKey(days[i]));
      if (v) {
        const h = Math.max(4, (v / max) * ih), y = H - bottom - h;
        s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${o.colorFn ? o.colorFn(v) : o.color}" opacity="${isToday ? 1 : 0.55}"/>`;
        s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#344054" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(o.fmt(v))}</text>`;
      } else {
        s += `<rect x="${x.toFixed(1)}" y="${H - bottom - 3}" width="${bw.toFixed(1)}" height="3" rx="1.5" fill="#e4e7ec"/>`;
      }
      const lbl = days[i].toLocaleDateString([], { weekday: 'short' }).slice(0, 3);
      s += `<text x="${(left + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="${isToday ? 800 : 500}" fill="${isToday ? '#0f1115' : '#98a2b3'}">${isRealToday ? 'Today' : esc(lbl)}</text>`;
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
    const out = [], base = keyDate(viewKey());
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
      if (diff >= 1) list.push({ t: 'warn', m: `You slept ${fmtHours(sh)}, ${fmtHours(diff)} short of your ${fmtHours(goal)} sleep need. An earlier night could help.` });
      else if (diff > 0) list.push({ t: 'info', m: `You slept ${fmtHours(sh)}, just under your ${fmtHours(goal)} sleep need.` });
      else list.push({ t: 'good', m: `You slept ${fmtHours(sh)}, meeting your ${fmtHours(goal)} sleep need.` });
    }
    if (sq !== null && sq < 60) list.push({ t: 'warn', m: `Sleep score was ${sq} (poor). See the Sleep tab for what affected it and tips for tonight.` });
    const psh = priorVals('sleepHours');
    if (psh.length >= 3) {
      const a = avg(psh);
      if (a < goal - 0.5) list.push({ t: 'info', m: `Your average over the previous ${psh.length} nights is ${fmtHours(a)}, below your ${fmtHours(goal)} sleep need.` });
    }
    if (rhr !== null) {
      const p = priorVals('rhr');
      if (p.length >= 3 && rhr >= avg(p) + 5) list.push({ t: 'warn', m: `Resting HR is ${rhr} bpm, above your recent average of ${Math.round(avg(p))}. That can reflect fatigue, stress, heat or illness.` });
    }
    if (hrv !== null) {
      const p = priorVals('hrv');
      if (p.length >= 3 && hrv <= avg(p) * 0.85) list.push({ t: 'warn', m: `HRV is ${hrv} ms, lower than your recent average of ${Math.round(avg(p))} ms.` });
    }
    const until = keyDate(viewKey()).getTime() + 12 * 36e5, since = until - 7 * 864e5;
    const wk = allWorkouts().filter((w) => w.ts >= since && w.ts < until);
    if (wk.length) {
      const mins = wk.reduce((a, w) => a + w.duration, 0);
      list.push({ t: 'info', m: `${wk.length} workout${wk.length > 1 ? 's' : ''} (${mins} min) recorded in the 7 days to ${isTodayKey(viewKey()) ? 'today' : dateStr(keyDate(viewKey()))}.` });
    } else list.push({ t: 'info', m: 'No workouts in the last 7 days.' });
    const recInfo = metric('recovery').info;
    if (rec === null && recInfo && recInfo.calibrating) list.push({ t: 'info', m: `Recovery is calibrating: it needs HRV from at least ${recInfo.need} previous days (currently ${recInfo.hrvDays}).` });
    if (!(SYNC && SYNC.fetchedAt)) list.push({ t: 'none', m: 'Connect Google Health and your scores will be calculated automatically.' });
    return list;
  }

  // ---------- render ----------
  function render() {
    refreshSync();
    if (VIEW && (VIEW >= dayKey())) VIEW = null;
    const vk = viewKey(), vd = keyDate(vk);
    const dlabel = `${isTodayKey(vk) ? 'Today' : vd.toLocaleDateString([], { weekday: 'long' })}, ${vd.getDate()} ${vd.toLocaleDateString([], { month: 'long' })}`;
    $$('[data-date]').forEach((el) => { el.textContent = dlabel; });
    $$('[data-viewbar]').forEach((el) => {
      el.hidden = !VIEW;
      el.innerHTML = VIEW ? `<span>Viewing ${esc(longDate(vd))} · history, read-only</span><button type="button" class="linkbtn" data-today>Back to today</button>` : '';
    });
    document.body.classList.toggle('viewing-past', !!VIEW);
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
    const isT = isTodayKey(viewKey()), today = workoutsFor(viewKey());
    const mins = today.reduce((a, w) => a + w.duration, 0);
    const shM = metric('sleepHours'), rhrM = metric('rhr'), stM = metric('steps');
    const sh = shM.v, rhr = rhrM.v, steps = stM.v;
    $('#glance').innerHTML =
      tile(isT ? 'Workouts today' : 'Workouts', today.length ? String(today.length) : null, today.length ? ` · ${mins} min` : '', today.length ? today.map((w) => actInfo(w).label).slice(0, 2).join(', ') : 'None yet', 'fitness') +
      tile('Sleep', sh !== null ? fmtHours(sh) : null, '', sh !== null ? `need ${fmtHours(sleepGoal())}` : missingReason('sleep'), 'sleep', shM.src) +
      tile('Resting HR', rhr !== null ? String(rhr) : null, 'bpm', rhr !== null ? (isT ? 'today' : 'that day') : 'Not recorded', 'health', rhrM.src) +
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
    const sm = metric('strain'), azmT = SYNC && SYNC.series && SYNC.series.azm && SYNC.series.azm[viewKey()];
    const tgt = strainTargetInfo();
    let fsub = (s === null ? missingReason('strain') : `${ringPct('strain', s)}% of 21${isTodayKey(viewKey()) ? ' · builds through the day' : ''}`) + (tgt ? ` · target ${fmtBand(tgt)} (${tgt.zone} recovery)` : '');
    if (sm.src === 'calc' && sm.info) fsub += ` · load ${sm.info.trimp}`;
    if (azmT) fsub += ` · ${azmT.total} AZM`;
    $('#fit-strain-sub').textContent = fsub;
    const tk = viewKey();
    const today = workoutsFor(tk);
    $('#fit-today-h').textContent = isTodayKey(tk) ? "Today's workouts" : `Workouts · ${dateStr(keyDate(tk))}`;
    const cutoff = Date.now() - 14 * 864e5;
    const recent = allWorkouts().filter((w) => dayKey(new Date(w.ts)) !== tk && w.ts >= cutoff).sort((a, b) => b.ts - a.ts).slice(0, 20);
    $('#today-list').innerHTML = today.length ? today.map((w) => liHTML(w, false)).join('') : `<li class="empty">No workouts recorded ${isTodayKey(tk) ? 'today' : 'that day'}</li>`;
    $('#recent-list').innerHTML = recent.length ? recent.map((w) => liHTML(w, true)).join('') : '<li class="empty">No workouts in the last 14 days</li>';
    const mins = today.reduce((a, w) => a + w.duration, 0);
    $('#today-total').textContent = today.length ? `${today.length} · ${mins} min` : '';
    const vals = last7().map((d) => workoutsFor(dayKey(d)).reduce((a, w) => a + w.duration, 0));
    const tot = vals.reduce((a, b) => a + b, 0);
    const n = last7().reduce((a, d) => a + workoutsFor(dayKey(d)).length, 0);
    $('#week-total').textContent = tot ? `${tot} min · ${n} session${n > 1 ? 's' : ''}` : 'No workouts yet';
    $('#week-chart').innerHTML = barChart(vals, { color: COL.strain, fmt: (v) => String(v), label: 'Workout minutes per day, last 7 days' });
    const sv = last7().map((d) => getVal('strain', dayKey(d))), sg = sv.filter((v) => v !== null);
    $('#strain-avg').textContent = sg.length ? `avg ${(avg(sg)).toFixed(1)}` : 'No data yet';
    $('#strain-chart').innerHTML = barChart(sv.map((v) => v || 0), { color: COL.strain, fmt: (v) => v.toFixed(1), label: 'Strain per day, last 7 days' });
  }
  // Hypnogram: last night's stage segments from Google Health (Awake / REM / Light / Deep rows).
  function hypnogramSVG(sl) {
    const segs = sl && sl.segs;
    if (!segs || !segs.length) return '';
    const ROW = { W: 0, R: 1, L: 2, A: 2, S: 2, D: 3 };
    const C = { W: STAGE_COL.awake, R: STAGE_COL.rem, L: STAGE_COL.light, A: STAGE_COL.light, S: STAGE_COL.light, D: STAGE_COL.deep };
    const W = 340, left = 46, right = 8, top = 6, rowH = 28, bh = 14, H = top + rowH * 4 + 26;
    const total = Math.max(...segs.map((g) => g[1] + g[2])) || 1;
    const x = (m) => left + (m / total) * (W - left - right), yc = (r) => top + r * rowH + rowH / 2;
    let out = `<svg class="hypno" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sleep stages timeline">`;
    ['Awake', 'REM', 'Light', 'Deep'].forEach((l, r) => {
      out += `<line x1="${left}" x2="${W - right}" y1="${yc(r)}" y2="${yc(r)}" stroke="#eef0f3" stroke-width="1"/>`;
      out += `<text x="0" y="${yc(r) + 4}" font-size="11" font-weight="600" fill="#667085">${l}</text>`;
    });
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1], b = segs[i];
      out += `<line x1="${x(b[1]).toFixed(1)}" x2="${x(b[1]).toFixed(1)}" y1="${yc(ROW[a[0]])}" y2="${yc(ROW[b[0]])}" stroke="#d0d5dd" stroke-width="1"/>`;
    }
    segs.forEach((g) => {
      const x0 = x(g[1]), w = Math.max(1.5, x(g[1] + g[2]) - x0);
      out += `<rect class="hseg hseg-${g[0]}" x="${x0.toFixed(1)}" y="${(yc(ROW[g[0]]) - bh / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${bh}" rx="3" fill="${C[g[0]]}"/>`;
    });
    if (sl.startMs) {
      const start = new Date(sl.startMs), first = new Date(start); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
      const step = total > 420 ? 2 : 1, yT = H - 6;
      out += `<text x="${left}" y="${yT}" font-size="10.5" font-weight="700" fill="#344054">${esc(hhmm(sl.startMs))}</text>`;
      out += `<text x="${W - right}" y="${yT}" text-anchor="end" font-size="10.5" font-weight="700" fill="#344054">${esc(hhmm(sl.startMs + total * 60000))}</text>`;
      for (let t = first.getTime(); t < sl.startMs + total * 60000; t += 36e5) {
        const m = (t - sl.startMs) / 60000, d = new Date(t);
        if (d.getHours() % step || m < 50 || total - m < 80) continue;
        out += `<text x="${x(m).toFixed(1)}" y="${yT}" text-anchor="middle" font-size="10.5" fill="#98a2b3">${pad(d.getHours())}:00</text>`;
      }
    }
    return out + '</svg>';
  }
  function lateWorkoutFor(sl) {
    if (!sl || !sl.startMs) return null;
    let best = null;
    allWorkouts().forEach((w) => {
      const end = w.ts + w.duration * 60000, before = (sl.startMs - end) / 60000;
      if (w.duration >= 20 && before >= -30 && before <= 180 && (!best || before < best.minutesBeforeBed)) best = { minutesBeforeBed: Math.round(before), label: actInfo(w).label };
    });
    return best;
  }
  function renderSleep() {
    const k = viewKey(), isT = isTodayKey(k), PM = window.PulseMetrics;
    const h = getVal('sleepHours'), q = getVal('sleep'), need = sleepTargetInfo(), goal = need.value;
    const bed = getStr('bedtime'), wake = getStr('wake');
    $('#sl-label').textContent = isT ? 'Last night' : `Night to ${dateStr(keyDate(k))}`;
    $('#sl-hours').textContent = h === null ? '–' : fmtHours(h);
    let sub;
    if (h === null) sub = `${missingReason('sleep')} · need ${fmtHours(goal)}`;
    else {
      const d = h - goal;
      sub = (bed && wake ? `${bed} → ${wake} · ` : '') + (d >= 0 ? `need of ${fmtHours(goal)} met` : `${fmtHours(-d)} under your ${fmtHours(goal)} need`);
    }
    if (q !== null) sub += ` · score ${q} (${sleepBand(q).toLowerCase()})`;
    $('#sl-sub').textContent = sub;
    $('#sl-src').innerHTML = srcBadge(metric('sleepHours').src);
    const sl = syncedSleep(k), box = $('#sl-stages'), ex = $('#sl-explain'), tipsBox = $('#sl-tips');
    const an = PM && sl ? PM.stageAnalysis(sl) : null;
    if (sl && an) {
      const hyp = hypnogramSVG(sl);
      const CHIP = { ok: ['ok', 'In range'], low: ['low', 'Below typical'], high: ['high', 'Above typical'] };
      const rows = an.map((a) => {
        const c = STAGE_COL[a.key], sc = 70, pos = (v) => clamp((v / sc) * 100, 0, 100);
        const chip = a.key === 'awake' && a.status === 'high' ? ['high', 'Above ~10%'] : CHIP[a.status];
        return `<div class="stg-row" data-stage="${a.key}">
          <div class="stg-top"><span><i style="background:${c}"></i><b>${a.label}</b></span><span class="stg-val">${fmtHours(a.min / 60)} · <b>${a.pct}%</b></span></div>
          <div class="stg-bar"><span class="stg-norm" style="left:${pos(a.lo)}%;width:${pos(a.hi) - pos(a.lo)}%"></span><span class="stg-mark" style="left:${pos(a.pct)}%;background:${c}"></span></div>
          <div class="stg-foot"><span>Typical ${a.key === 'awake' ? 'under 10% of time in bed' : `${a.lo}–${a.hi}% of sleep`}</span><span class="chip-s ${chip[0]}">${chip[1]}</span></div>
        </div>`;
      }).join('');
      box.innerHTML = `<div class="card-head"><h2>Sleep stages</h2><span class="muted small">${sl.bedtime && sl.wake ? `${esc(sl.bedtime)} → ${esc(sl.wake)}` : ''}</span></div>
        ${hyp || '<p class="muted small" id="sl-nohyp">A stage timeline isn\u2019t available for this night, only totals.</p>'}
        ${hyp ? `<div class="stage-legend">${[['Awake', 'awake'], ['REM', 'rem'], ['Light', 'light'], ['Deep', 'deep']].map(([n, kk]) => `<span><i style="background:${STAGE_COL[kk]}"></i>${n}</span>`).join('')}</div>` : ''}
        <div class="stg-list">${rows}</div>
        <p class="muted small" style="margin:10px 0 0">Efficiency ${sl.efficiency}%${sl.awakenings ? ` · ${sl.awakenings} awakenings` : ''}${isNum(sl.latency) ? ` · ${sl.latency} min to fall asleep` : ''}. Typical ranges are for healthy adults and teens (StatPearls, Google Health); teens often get more deep sleep.</p>`;
      box.hidden = false;
      ex.innerHTML = `<div class="card-head"><h2>What your stages mean today</h2></div>` + an.map((a) => {
        const n = PM.stageNote(a, sl);
        return `<div class="note" data-note="${a.key}"><div class="note-h"><i style="background:${STAGE_COL[a.key]}"></i><b>${a.label}${a.key === 'awake' ? ' time' : ' sleep'}</b></div><p>${esc(n.today)}</p><p class="muted small">${esc(n.what)}</p></div>`;
      }).join('') + `<p class="disclaimer">Wearable stage estimates are approximate. General information, not medical advice. Sources: ${srcLink('statpearls')}, ${srcLink('ghStages')}, ${srcLink('vancauter')}, ${srcLink('walker')}.</p>`;
      ex.hidden = false;
    } else {
      box.hidden = !sl; ex.hidden = true; ex.innerHTML = '';
      box.innerHTML = sl ? `<div class="card-head"><h2>Sleep stages</h2></div><p class="muted small">Google Health didn't record sleep stages for this night (it needs a longer sleep with a good fit), so only the total is shown.</p>` : '';
    }
    if (sl && PM) {
      const tips = PM.sleepTips({ sleep: sl, need: goal, timing: PM.timingDeviation(k, ser('sleep')), lateWorkout: lateWorkoutFor(sl) });
      tipsBox.innerHTML = `<div class="card-head"><h2>Tips for tonight</h2></div><ol class="tips">${tips.map((t) => `<li data-tip="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.text)}</span>${srcLink(t.src)}</li>`).join('')}</ol><p class="disclaimer">Based on your Google Health data. General guidance, not medical advice.</p>`;
      tipsBox.hidden = false;
    } else { tipsBox.hidden = true; tipsBox.innerHTML = ''; }
    const vals = last7().map((d) => getVal('sleepHours', dayKey(d)));
    const got = vals.filter((v) => v !== null);
    $('#sleep-avg').textContent = (got.length ? `avg ${fmtHours(avg(got))} · ` : '') + `need ${fmtHours(goal)}`;
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
    on('set-disc', () => { PS.disconnect(); PS.clearCache(); SCORES = { v: 2, days: {} }; scoresDirty = true; saveScores(); toast('Disconnected · synced data removed from this device'); render(); openSettings(); });
  }

  function openExplainer() {
    const k = viewKey(), s = metric('strain'), r = metric('recovery'), q = metric('sleep');
    const z = SYNC && SYNC.series && SYNC.series.zones && SYNC.series.zones[k];
    const has = (m) => m.src === 'calc' && m.info;
    const line = (m, fn) => (has(m) ? `<p class="calc-today">${fn(m.info)}</p>` : '');
    const src = (...ids) => `<p class="srcs">Sources: ${ids.map(srcLink).join(' · ')}</p>`;
    const nd = sleepTargetInfo(), tg = strainTargetInfo(), stp = stepTargetInfo();
    openSheet(`
      <h2 id="sheet-title">How scores are calculated</h2>
      <p class="sheet-sub">Everything is calculated automatically from your Google Health data. Google's own Readiness, Sleep score and Cardio load aren't available through the Google Health API, so Pulse calculates its own, calibrated so an ordinary day lands in the middle and 90+ takes an exceptional day. Scores are capped at 99, like WHOOP.</p>
      <h3>Recovery (1–99%)</h3>
      <p class="calc">Compares this morning with your own previous 30 days. Each signal becomes a z-score (how unusual today is for you) and goes through a curve where an average day is about 57%:<br><code>part = 100 ÷ (1 + e^−(0.3 + z))</code> → z 0 = 57, +1 = 79, +2 = 91, −1 = 33, −2 = 15<br>HRV (log scale) 55% · resting HR (lower is better) 20% · last night's sleep score 20% · breathing rate 5%.<br>Needs 4 previous days of HRV ("Calibrating" before that). Green 67–99, yellow 34–66, red 1–33. On an ordinary day expect about 55–75%.</p>
      ${line(r, (i) => `Today: HRV ${i.parts.hrv} (z ${i.z && i.z.hrv})${i.parts.rhr !== undefined ? `, RHR ${i.parts.rhr}` : ''}${i.parts.sleep !== undefined ? `, sleep ${i.parts.sleep}` : ''}${i.parts.resp !== undefined ? `, breathing ${i.parts.resp}` : ''} → ${i.value}% (baseline HRV ${i.baseline.hrv} ms, ${i.hrvDays} days).`)}
      ${r.v === null && r.info && r.info.calibrating ? `<p class="calc-today">Today: calibrating (${r.info.hrvDays}/${r.info.need} days of HRV).</p>` : ''}
      ${src('whoopRec', 'whoopAvg', 'oura', 'ghReady', 'plews', 'buchheit')}
      <h3>Strain (0–21)</h3>
      <p class="calc">Heart-rate load from minutes in Google Health's heart-rate zones (Edwards-style TRIMP):<br><code>load = 0.5×light + 2×moderate + 3.5×vigorous + 5×peak</code><br><code>strain = 4.35 × ln(1 + load ÷ 10)</code>, max 21 (logarithmic, like WHOOP).<br>Roughly: normal day 6–9 · training 12–14 · football match or hard padel 14–16 · 18+ only for very long, hard days. The ring shows strain as a share of 21.</p>
      ${line(s, (i) => `Today: load ${i.trimp}${z ? ` (light ${z.light}, moderate ${z.moderate}, vigorous ${z.vigorous}, peak ${z.peak} min)` : ''} → strain ${i.value}.`)}
      ${src('whoopStrain', 'edwards')}
      <h3>Sleep score (1–99)</h3>
      <p class="calc">Duration vs your sleep need 45% · deep sleep 12.5% · REM 12.5% · awake time 20% · bed/wake consistency 10%.<br>Duration scores 100 when you meet your need and drops faster the shorter you sleep. Deep scores 100 at 20%+ of sleep, REM at 23%+, and awake time at 8% or less of time in bed. Consistency scores 100 within 30 min of your usual bed and wake times.<br>Bands like Google's: 90+ excellent, 80–89 good, 60–79 fair, under 60 poor. Most nights land around 70–85.</p>
      ${line(q, (i) => `Today: duration ${i.parts.duration}${i.parts.deep !== undefined ? `, deep ${i.parts.deep}, REM ${i.parts.rem}` : ''}${i.parts.awake !== undefined ? `, awake ${i.parts.awake}` : ''}${i.parts.consistency !== undefined ? `, consistency ${i.parts.consistency}` : ''} → ${i.value}.`)}
      ${src('ghSleep', 'statpearls', 'ghStages', 'ohayon', 'whoopNeed')}
      <h3>Targets (automatic)</h3>
      <p class="calc"><b>Sleep need</b> = 8.5 h base (inside the 8–10 h recommended for 13–18 year olds, and WHOOP members average about 8.6 h), + 4 min per strain point above 10 yesterday (max 45), + 25% of your shortfall over the last 3 nights (max 60 min), − naps. Kept between 7 and 11 h.<br><b>Strain target</b> from recovery: red → 5–10, yellow → 10–14, green → 14–17, 90%+ → up to 18. Shown as the hatched part of the strain ring.<br><b>Step target</b> = your 30-day average + 10%, rounded to 500, kept between 6,000 and 12,000 (benefits level off around 8–10k a day; about 10–11.7k matches 60 min of activity for teens). 10,000 until 7 days of data exist.</p>
      <p class="calc-today">${isTodayKey(k) ? 'Today' : esc(dateStr(keyDate(k)))}: sleep need ${esc(fmtHours(nd.value))} (${esc(needText(nd))}) · strain target ${esc(fmtBand(tg))}${tg ? '' : ' (needs recovery)'} · steps ${stp.value.toLocaleString()} (${esc(targetSrc(stp))})</p>
      ${src('aasm', 'whoopNeed', 'whoopCoach', 'paluch', 'tudor')}
      <h3>Sleep stages &amp; tips</h3>
      <p class="calc">The stage timeline and minutes come straight from Google Health. Typical ranges: deep 13–23%, REM 20–25%, light 50–60% of sleep, awake under ~10% of time in bed. Tips are picked from your own night (short sleep, irregular timing, late hard training, broken or light sleep, slow to fall asleep).</p>
      ${src('statpearls', 'vancauter', 'walker', 'mah', 'phillips', 'stutz', 'okamoto', 'drake', 'chang')}
      <p class="disclaimer">These are Pulse's own estimates for personal insight. They aren't WHOOP, Bevel, Oura or Google scores, and they're not medical advice.</p>
      <div class="sheet-actions" style="grid-template-columns:1fr"><button class="btn primary" type="button" id="ex-close">Done</button></div>`);
    $('#ex-close').addEventListener('click', closeSheet);
  }

  // ---------- date switcher (read-only history) ----------
  function openDatePicker() {
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const k = dayKey(d), sv = getVal('sleep', k), rv = getVal('recovery', k), st = getVal('strain', k);
      rows.push(`<button type="button" class="pick${k === viewKey() ? ' on' : ''}" data-pick="${k}">
        <span class="pick-d">${i === 0 ? 'Today' : i === 1 ? 'Yesterday' : esc(d.toLocaleDateString([], { weekday: 'short' }))}<small>${esc(d.toLocaleDateString([], { day: 'numeric', month: 'long' }))}</small></span>
        <span class="pick-s"><i class="ps-st">${st === null ? '–' : ringPct('strain', st) + '%'}</i><i class="ps-rec">${rv === null ? '–' : rv + '%'}</i><i class="ps-sl">${sv === null ? '–' : sv + '%'}</i></span>
      </button>`);
    }
    openSheet(`<h2 id="sheet-title">Choose a day</h2>
      <p class="sheet-sub">Past days are read-only, from your saved scores and synced Google Health data. <span class="pick-key"><i class="ps-st">Strain</i><i class="ps-rec">Recovery</i><i class="ps-sl">Sleep</i></span></p>
      <div class="picks">${rows.join('')}</div>`);
  }
  function setView(k) { VIEW = !k || k >= dayKey() ? null : k; render(); replayRings($('#tab-' + currentTab)); }

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
    const k = viewKey(), mt = metric(m), v = mt.v, i = mt.info || {}, c = RINGS[m], goal = i.goal || sleepGoal();
    const big = v === null ? '–' : m === 'strain' ? v.toFixed(1) + ' / 21' : v + '%';
    let inputs = '', how = '';
    if (m === 'strain') {
      const z = ser('zones')[k], a = ser('azm')[k];
      inputs = row('Light zone', z ? z.light + ' min' : null) + row('Moderate zone', z ? z.moderate + ' min' : null) + row('Vigorous zone', z ? z.vigorous + ' min' : null) + row('Peak zone', z ? z.peak + ' min' : null) +
        row('Active Zone Minutes', a ? a.total : null) + row('Heart-rate load (TRIMP)', i.trimp ?? null) + row('Target', strainTargetInfo() ? `${fmtBand(strainTargetInfo())} (${strainTargetInfo().zone} recovery)` : 'needs recovery') + row('Method', i.method === 'azm' ? 'Active Zone Minutes (no zone minutes)' : i.method ? 'Heart-rate zone minutes' : null);
      how = 'load = 0.5×light + 2×moderate + 3.5×vigorous + 5×peak minutes; strain = 4.35 × ln(1 + load/10), max 21. Normal day ≈ 6–9, training ≈ 12–14, match ≈ 14–16, 18+ rare. Recalculated at every sync, so it builds up through the day.';
    } else if (m === 'recovery') {
      const p = i.parts || {}, b = i.baseline || {};
      inputs = row('HRV today', syncedVal('hrv', k) !== null ? Math.round(syncedVal('hrv', k)) + ' ms' : null) + row('HRV baseline (30 d)', b.hrv ? b.hrv + ' ms' : null) +
        row('Resting HR today', syncedVal('rhr', k) !== null ? syncedVal('rhr', k) + ' bpm' : null) + row('Resting HR baseline', b.rhr ? b.rhr + ' bpm' : null) +
        row('Breathing rate', syncedVal('resp', k) !== null ? syncedVal('resp', k) + ' br/min' : null) + row('Days of HRV history', i.hrvDays ?? null) +
        row('HRV part', p.hrv !== undefined ? `${p.hrv} (z ${i.z.hrv})` : null) + row('Resting HR part', p.rhr !== undefined ? `${p.rhr} (z ${i.z.rhr})` : null) + row('Sleep score part', p.sleep ?? null) + row('Breathing part', p.resp ?? null);
      how = 'Each signal vs your previous 30 days as a z-score, through a curve where an average day ≈ 57: part = 100 ÷ (1 + e^−(0.3 + z)). Recovery = 0.55×HRV + 0.20×resting HR + 0.20×sleep score + 0.05×breathing rate, shown 1–99. Set once per day; recalculated only if new data arrives. Needs 4 previous days of HRV.';
    } else {
      const sl = syncedSleep(k), p = i.parts || {};
      const nd = sleepTargetInfo(k), pc = i.pcts || {};
      inputs = row('Asleep', sl ? fmtHours(sl.sleepHours) : null) + row('Sleep need', `${fmtHours(nd.value)} (${needText(nd)})`) + row('Bedtime → wake', sl && sl.bedtime ? `${sl.bedtime} → ${sl.wake}` : null) +
        row('Deep / REM / light', pc.deep !== undefined ? `${pc.deep}% / ${pc.rem}% / ${pc.light}%` : null) + row('Awake (of time in bed)', isNum(i.awakePct) ? i.awakePct + '%' : null) + row('Timing vs usual', isNum(i.timingDev) ? `${i.timingDev} min off` : null) +
        row('Duration part', p.duration ?? null) + row('Deep part', p.deep ?? null) + row('REM part', p.rem ?? null) + row('Awake-time part', p.awake ?? null) + row('Consistency part', p.consistency ?? null);
      how = 'Duration vs need 45% · deep 12.5% · REM 12.5% · awake time 20% · consistency 10% (missing parts re-balanced), shown 1–99. 90+ excellent, 80–89 good, 60–79 fair, under 60 poor. Uses the main sleep from Google Health; naps lower the next night\'s need.';
    }
    openSheet(`
      <h2 id="sheet-title">${esc(c.title)}</h2>
      <p class="sheet-sub">Calculated automatically from Google Health${mt.at ? ` · calculated ${hhmm(mt.at)}` : ''}${updatedText() ? ` · data ${esc(updatedText().toLowerCase())}` : ''}</p>
      <div class="readout" style="color:${v === null ? '#98a2b3' : ringColor(m, v)}">${esc(big)}</div>
      <div class="readout-sub">${v === null ? esc(missingReason(m)) : m === 'recovery' ? recZone(v) + ' zone' : m === 'strain' ? ringPct('strain', v) + '% of 21' : sleepBand(v)}</div>
      <h3>${isTodayKey(k) ? "Today's inputs" : 'Inputs · ' + esc(dateStr(keyDate(k)))}</h3><div class="kvs">${inputs}</div>
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
    const p = v === null ? 0 : clamp(v / RINGS[m].max, 0, 1), A0 = -Math.PI / 2;
    const tgt = m === 'strain' ? strainTargetInfo() : null;
    if (tgt) { // hatched target zone on the track
      const pc = document.createElement('canvas'); pc.width = pc.height = 12;
      const px = pc.getContext('2d'); px.fillStyle = 'rgba(255,138,0,0.14)'; px.fillRect(0, 0, 12, 12);
      px.strokeStyle = 'rgba(232,110,0,0.65)'; px.lineWidth = 3.5; px.beginPath();
      [-12, 0, 12].forEach((o) => { px.moveTo(o, 12); px.lineTo(o + 12, 0); }); px.stroke();
      ctx.save(); ctx.lineCap = 'butt'; ctx.strokeStyle = ctx.createPattern(pc, 'repeat');
      ctx.beginPath(); ctx.arc(cx, cy, r, A0 + (tgt.low / 21) * Math.PI * 2, A0 + (tgt.high / 21) * Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (p > 0) {
      const g = ringGrad(m, v), lg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      lg.addColorStop(0, g[0]); lg.addColorStop(1, g[1]);
      ctx.strokeStyle = lg;
      ctx.beginPath(); ctx.arc(cx, cy, r, A0, A0 + Math.PI * 2 * Math.min(p, 0.9999)); ctx.stroke();
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
    metrics.forEach((m, i) => {
      if (i > 0) { ctx.fillStyle = '#eceef2'; ctx.fillRect(padX + cell * i - 1, padY + 20, 2, 290); }
      drawRing(ctx, padX + cell * i + cell / 2, padY + 124, 110, 24, m, getVal(m), { pct: 60, sub: 24, label: 30 });
    });
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
    ctx.fillStyle = COL.text; ctx.font = `800 60px ${FONT}`; ctx.fillText(longDate(keyDate(viewKey())), 112, 224);

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
    const today = workoutsFor(viewKey()).slice().reverse();
    const mins = today.reduce((a, w) => a + w.duration, 0);
    ctx.fillStyle = COL.muted; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(today.length ? `WORKOUTS · ${mins} MIN` : 'WORKOUTS', 112, 1000);
    if (!today.length) {
      ctx.fillStyle = COL.faint; ctx.font = `600 32px ${FONT}`; ctx.fillText(isTodayKey(viewKey()) ? 'None recorded today' : 'None recorded that day', 112, 1052);
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
    const name = `pulse-rings-${viewKey()}.png`;
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
    $('#rc-dl').addEventListener('click', () => download(canvasBlobSync(ringsCanvas(RING_ORDER, cur())), `pulse-rings-${viewKey()}.png`));
    $('#rc-share').addEventListener('click', () => shareOrDownload(canvasBlobSync(ringsCanvas(RING_ORDER, cur())), `pulse-rings-${viewKey()}.png`, 'Pulse rings'));
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
  const cardName = () => `pulse-${viewKey()}.png`;
  $('#btn-download').addEventListener('click', () => download(canvasBlobSync(drawCard()), cardName()));
  $('#btn-share').addEventListener('click', () => shareOrDownload(canvasBlobSync(drawCard()), cardName(), 'Pulse daily summary'));

  // ---------- global events ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-settings]')) { openSettings(); return; }
    if (t.closest('[data-datepick]')) { openDatePicker(); return; }
    const pk = t.closest('[data-pick]'); if (pk) { closeSheet(); setView(pk.dataset.pick); return; }
    if (t.closest('[data-today]')) { setView(null); return; }
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
    if (dayKey() !== lastKey) { lastKey = dayKey(); VIEW = null; render(); }
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

  window.__pulse = { drawCard, ringsCanvas, dayKey, migrate, metric, doSync, autoRefresh, scores: () => SCORES, setView, viewKey, sleepNeed: (k) => sleepTargetInfo(k || viewKey()), strainTarget: (k) => strainTargetInfo(k || viewKey()) };
})();
