/* Pulse metrics: pure mappers for Google Health API v4 responses + transparent score formulas.
   Works in the browser (window.PulseMetrics) and in Node (module.exports) for unit tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PulseMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const num = (x) => (x === null || x === undefined || x === '' || !isFinite(+x) ? null : +x);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  /** {year, month, day} -> 'YYYY-MM-DD' */
  function dateKey(d) {
    if (!d || !d.year) return null;
    return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
  }
  /** 'YYYY-MM-DD' -> {year, month, day} */
  function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return { year: y, month: m, day: d }; }
  /** protobuf Duration JSON ("3600s", "12.5s") -> seconds */
  function durationSec(s) {
    if (s === null || s === undefined) return 0;
    if (typeof s === 'number') return s;
    const m = String(s).match(/^(-?[\d.]+)s$/);
    return m ? parseFloat(m[1]) : (num(s) || 0);
  }
  const hhmm = (t) => (t && t.hours !== undefined ? `${pad(t.hours || 0)}:${pad(t.minutes || 0)}` : (t ? `${pad(t.hours || 0)}:${pad(t.minutes || 0)}` : null));

  // ---------- mappers ----------

  /** Stage type -> one-letter code used in compact hypnogram segments. */
  const STAGE_CODE = { AWAKE: 'W', LIGHT: 'L', DEEP: 'D', REM: 'R', ASLEEP: 'A', RESTLESS: 'S' };
  const civilMin = (t) => (t ? (t.hours || 0) * 60 + (t.minutes || 0) : null);
  /** sleep dataPoints -> { dayKey(wake date): {...} } using the main sleep (or longest non-nap) per wake date.
      Extra fields: napMinutes (other sessions ending that date), latency, awakenings, bedRel/wakeRel (minutes relative
      to midnight of the wake date; bedRel is negative before midnight) and segs = [[code, startMin, durMin], …]. */
  function mapSleep(points) {
    const groups = {};
    (points || []).forEach((dp) => {
      const s = dp && dp.sleep; if (!s || !s.interval) return;
      const iv = s.interval;
      const endDate = iv.civilEndTime && iv.civilEndTime.date;
      let key = dateKey(endDate);
      if (!key && iv.endTime) { const d = new Date(iv.endTime); key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
      if (!key) return;
      const sum = s.summary || {};
      const asleep = num(sum.minutesAsleep);
      const t0 = Date.parse(iv.startTime), t1 = Date.parse(iv.endTime);
      const inPeriod = num(sum.minutesInSleepPeriod) || (isFinite(t0) && isFinite(t1) ? (t1 - t0) / 60000 : null);
      const stages = {}, counts = {};
      (sum.stagesSummary || []).forEach((st) => { if (st && st.type) { stages[st.type.toLowerCase()] = num(st.minutes) || 0; counts[st.type.toLowerCase()] = num(st.count); } });
      let segs = null;
      if (Array.isArray(s.stages) && s.stages.length && isFinite(t0)) {
        segs = s.stages.map((g) => {
          const a = Date.parse(g.startTime), b = Date.parse(g.endTime);
          if (!isFinite(a) || !isFinite(b) || b <= a || !STAGE_CODE[g.type]) return null;
          return [STAGE_CODE[g.type], Math.round((a - t0) / 60000), Math.max(1, Math.round((b - a) / 60000))];
        }).filter(Boolean).sort((x, y) => x[1] - y[1]);
        if (!segs.length) segs = null;
      }
      const sd = iv.civilStartTime && iv.civilStartTime.date, ed = endDate;
      const bm = iv.civilStartTime ? civilMin(iv.civilStartTime.time) : null, wm = iv.civilEndTime ? civilMin(iv.civilEndTime.time) : null;
      const crossed = sd && ed && dateKey(sd) !== dateKey(ed);
      const awakeSegs = segs ? segs.filter((g) => g[0] === 'W').length : null;
      const rec = {
        minutesAsleep: asleep,
        minutesInBed: inPeriod,
        sleepHours: asleep !== null ? Math.round((asleep / 60) * 100) / 100 : null,
        efficiency: asleep !== null && inPeriod ? Math.round((asleep / inPeriod) * 100) : null,
        stages: (stages.deep !== undefined || stages.rem !== undefined || stages.light !== undefined)
          ? { deep: stages.deep || 0, light: stages.light || 0, rem: stages.rem || 0, awake: stages.awake || 0 } : null,
        bedtime: iv.civilStartTime ? hhmm(iv.civilStartTime.time) : null,
        wake: iv.civilEndTime ? hhmm(iv.civilEndTime.time) : null,
        bedRel: bm === null ? null : crossed ? bm - 1440 : bm,
        wakeRel: wm,
        latency: num(sum.minutesToFallAsleep),
        awakenings: counts.awake !== undefined && counts.awake !== null ? counts.awake
          : Array.isArray(s.shortAwakenings) ? s.shortAwakenings.length + (awakeSegs || 0) : awakeSegs,
        startMs: isFinite(t0) ? t0 : null,
        segs,
        main: !!(s.metadata && s.metadata.mainSleep),
        nap: !!(s.metadata && s.metadata.nap)
      };
      (groups[key] = groups[key] || []).push(rec);
    });
    const byDay = {};
    Object.entries(groups).forEach(([k, list]) => {
      const cands = list.filter((r) => !r.nap);
      const pool = cands.length ? cands : list;
      pool.sort((x, y) => (y.main - x.main) || ((y.minutesAsleep || 0) - (x.minutesAsleep || 0)));
      const best = pool[0];
      best.napMinutes = list.filter((r) => r !== best).reduce((a, r) => a + (r.minutesAsleep || 0), 0);
      byDay[k] = best;
    });
    return byDay;
  }

  const DAILY = {
    rhr:  (dp) => dp.dailyRestingHeartRate && [dp.dailyRestingHeartRate.date, num(dp.dailyRestingHeartRate.beatsPerMinute)],
    hrv:  (dp) => dp.dailyHeartRateVariability && [dp.dailyHeartRateVariability.date, num(dp.dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds)],
    spo2: (dp) => dp.dailyOxygenSaturation && [dp.dailyOxygenSaturation.date, num(dp.dailyOxygenSaturation.averagePercentage)],
    resp: (dp) => dp.dailyRespiratoryRate && [dp.dailyRespiratoryRate.date, num(dp.dailyRespiratoryRate.breathsPerMinute)],
    temp: (dp) => {
      const t = dp.dailySleepTemperatureDerivations; if (!t) return null;
      const n = num(t.nightlyTemperatureCelsius), b = num(t.baselineTemperatureCelsius);
      return [t.date, n !== null && b !== null ? Math.round((n - b) * 100) / 100 : null];
    }
  };
  /** daily summary dataPoints -> { dayKey: number } */
  function mapDaily(kind, points) {
    const out = {};
    (points || []).forEach((dp) => {
      const r = dp && DAILY[kind](dp); if (!r) return;
      const k = dateKey(r[0]); if (k && r[1] !== null) out[k] = kind === 'hrv' || kind === 'resp' || kind === 'spo2' ? r1(r[1]) : r[1];
    });
    return out;
  }

  /** weight dataPoints -> { dayKey: kg } (latest sample of the day) */
  function mapWeight(points) {
    const out = {}, when = {};
    (points || []).forEach((dp) => {
      const w = dp && dp.weight; if (!w || !w.sampleTime) return;
      const st = w.sampleTime;
      let k = st.civilTime ? dateKey(st.civilTime.date) : null;
      const t = Date.parse(st.physicalTime) || 0;
      if (!k && t) { const d = new Date(t); k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
      const g = num(w.weightGrams);
      if (k && g !== null && (!(k in when) || t >= when[k])) { out[k] = r1(g / 1000); when[k] = t; }
    });
    return out;
  }

  /** dailyRollUp rollupDataPoints -> { dayKey: value } */
  function mapRollup(kind, rollups) {
    const out = {};
    (rollups || []).forEach((rp) => {
      const k = rp && rp.civilStartTime && dateKey(rp.civilStartTime.date); if (!k) return;
      if (kind === 'steps' && rp.steps) out[k] = num(rp.steps.countSum);
      else if (kind === 'calories' && rp.totalCalories) out[k] = Math.round(num(rp.totalCalories.kcalSum) || 0);
      else if (kind === 'azm' && rp.activeZoneMinutes) {
        const a = rp.activeZoneMinutes;
        const fb = num(a.sumInFatBurnHeartZone) || 0, ca = num(a.sumInCardioHeartZone) || 0, pk = num(a.sumInPeakHeartZone) || 0;
        out[k] = { fatBurn: fb, cardio: ca, peak: pk, total: fb + ca + pk };
      } else if (kind === 'zones' && rp.timeInHeartRateZone) {
        const z = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
        (rp.timeInHeartRateZone.timeInHeartRateZones || []).forEach((v) => {
          const name = String(v.heartRateZone || '').toLowerCase();
          if (name in z) z[name] += Math.round(durationSec(v.duration) / 60);
        });
        out[k] = z;
      }
    });
    Object.keys(out).forEach((k) => { if (out[k] === null) delete out[k]; });
    return out;
  }

  const EXERCISE_MAP = {
    football: ['SOCCER'],
    padel: ['PADEL'],
    tennis: ['TENNIS'],
    running: ['RUNNING', 'TREADMILL', 'TRAIL_RUN', 'INCLINE_RUN', 'TRACK_AND_FIELD'],
    walking: ['WALKING', 'POWER_WALKING', 'TREADMILL_WALK', 'NORDIC_WALKING', 'INCLINE_WALK', 'STROLLER_WALK', 'WALK_WITH_WEIGHTS'],
    cycling: ['BIKING', 'OUTDOOR_BIKE', 'STATIONARY_BIKE', 'SPINNING', 'MOUNTAIN_BIKE', 'ELECTRIC_BIKE', 'ASSAULT_BIKE', 'HAND_CYCLING'],
    swimming: ['SWIMMING', 'SWIMMING_POOL', 'SWIMMING_OPEN_WATER'],
    basketball: ['BASKETBALL'],
    yoga: ['YOGA', 'YOGA_BIKRAM', 'YOGA_HATHA', 'YOGA_POWER', 'YOGA_VINYASA'],
    hiit: ['HIIT', 'INTERVAL_WORKOUT', 'TABATA_WORKOUT', 'CIRCUIT_TRAINING', 'CROSSFIT', 'BOOTCAMP'],
    boxing: ['BOXING', 'KICKBOXING', 'MUAY_THAI'],
    hiking: ['HIKING', 'BACKPACKING', 'RUCKING'],
    gym: ['WEIGHTS', 'WEIGHTLIFTING', 'FREE_WEIGHTS', 'STRENGTH_TRAINING', 'WEIGHT_MACHINES', 'POWERLIFTING', 'FUNCTIONAL_STRENGTH_TRAINING', 'BODY_WEIGHT', 'CALISTHENICS', 'RESISTANCE_BANDS', 'CORE_TRAINING', 'TRX']
  };
  const TYPE_TO_ACT = {};
  Object.entries(EXERCISE_MAP).forEach(([a, list]) => list.forEach((t) => { TYPE_TO_ACT[t] = a; }));
  const titleCase = (s) => String(s || '').toLowerCase().split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
  function mapExerciseType(type, displayName) {
    const a = TYPE_TO_ACT[type];
    if (a) return { activity: a, name: null };
    return { activity: 'custom', name: displayName || titleCase(type) || 'Workout' };
  }

  /** exercise dataPoints -> workouts [{id, activity, name, duration, avgHr, calories, azm, ts, source}] */
  function mapExercise(points) {
    const seen = new Set(), out = [];
    (points || []).forEach((dp) => {
      const e = dp && dp.exercise; if (!e || !e.interval) return;
      const start = Date.parse(e.interval.startTime), end = Date.parse(e.interval.endTime);
      if (!isFinite(start)) return;
      const id = 'gh:' + (dp.name || e.interval.startTime);
      if (seen.has(id)) return; seen.add(id);
      const active = durationSec(e.activeDuration);
      const minutes = Math.round((active || (isFinite(end) ? (end - start) / 1000 : 0)) / 60);
      const m = e.metricsSummary || {};
      const t = mapExerciseType(e.exerciseType, e.displayName);
      out.push({
        id, activity: t.activity, name: t.name, duration: Math.max(1, minutes),
        avgHr: num(m.averageHeartRateBeatsPerMinute), calories: m.caloriesKcal !== undefined ? Math.round(num(m.caloriesKcal) || 0) : null,
        azm: num(m.activeZoneMinutes), ts: start, source: 'google', rpe: 0, note: ''
      });
    });
    return out.sort((a, b) => b.ts - a.ts);
  }

  // ---------- formulas (calibration notes and sources: docs/calibration.md) ----------

  function stats(arr) {
    const n = arr.length; if (!n) return null;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
    return { mean, sd, n };
  }
  function priorKeys(dayKeyStr, from, to) {
    const [y, m, d] = dayKeyStr.split('-').map(Number), out = [];
    for (let i = from; i <= to; i++) { const dt = new Date(y, m - 1, d - i, 12); out.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`); }
    return out;
  }
  const lin = (x, x0, x1) => clamp((x - x0) / (x1 - x0), 0, 1) * 100; // 0 at x0, 100 at x1
  const SCORE_CAP = 99; // like WHOOP (1–99%): a perfect 100 is not shown

  /* STRAIN (0–21, logarithmic like WHOOP)
     Heart-rate load (Edwards-style TRIMP on Google Health's 4 Karvonen zones):
       load = 0.5×light + 2×moderate + 3.5×vigorous + 5×peak   (minutes)
     Fallback without zone minutes (Active Zone Minutes: 1/min fat-burn, 2/min cardio & peak):
       load ≈ 2×fatBurn + 1.75×cardioAZM + 2.5×peakAZM
     strain = 4.35 × ln(1 + load/10), max 21.
     Calibration: normal day (≈40–60 load) → 7–8.5; training (Edwards ≈170–210) → 12.5–13.5;
     football match (≈320–450) → 15–16.5; ≈700 → 18.5; 21 needs ≈1,200+ (rare). */
  const STRAIN_W = { light: 0.5, moderate: 2, vigorous: 3.5, peak: 5 };
  const STRAIN_A = 4.35, STRAIN_B = 10;
  function strainFromLoad(load) { return Math.min(21, STRAIN_A * Math.log(1 + Math.max(0, load) / STRAIN_B)); }
  function computeStrain(zones, azm) {
    let trimp = null, method = null;
    if (zones && typeof zones === 'object') {
      trimp = STRAIN_W.light * (zones.light || 0) + STRAIN_W.moderate * (zones.moderate || 0) + STRAIN_W.vigorous * (zones.vigorous || 0) + STRAIN_W.peak * (zones.peak || 0);
      method = 'zones';
    } else if (azm) {
      trimp = 2 * (azm.fatBurn || 0) + 1.75 * (azm.cardio || 0) + 2.5 * (azm.peak || 0);
      method = 'azm';
    }
    if (trimp === null) return null;
    return { value: r1(strainFromLoad(trimp)), trimp: Math.round(trimp), method };
  }

  /* SLEEP NEED (hours) – WHOOP-style: baseline + strain + sleep debt − naps.
     Baseline 8.5 h: inside the AASM teen range (8–10 h) and the top of the adult range (7–9 h); WHOOP's member
     average need is ~8.6 h. Strain yesterday above 10 adds 4 min per strain point (max 45 min). Sleep debt adds 25%
     of the shortfall vs baseline over the previous 3 nights (max 60 min). Naps yesterday are subtracted. Kept 7–11 h. */
  const SLEEP_BASE = 8.5;
  function sleepNeed(day, sleepByDay, strainByDay) {
    const [k1, k2, k3] = priorKeys(day, 1, 3);
    const s = strainByDay && typeof strainByDay[k1] === 'number' ? strainByDay[k1] : null;
    const strainAdd = s === null ? 0 : Math.min(45, Math.max(0, s - 10) * 4);
    let debtMin = 0, nights = 0;
    [k1, k2, k3].forEach((k) => {
      const r = sleepByDay && sleepByDay[k];
      if (r && r.minutesAsleep > 0 && !(r.nap && !r.main)) { nights++; debtMin += Math.max(0, SLEEP_BASE * 60 - r.minutesAsleep); }
    });
    const debtAdd = Math.min(60, 0.25 * debtMin);
    const y = sleepByDay && sleepByDay[k1];
    const napSub = y ? (y.napMinutes || 0) + (y.nap && !y.main ? y.minutesAsleep || 0 : 0) : 0;
    const mins = clamp(SLEEP_BASE * 60 + strainAdd + debtAdd - napSub, 420, 660);
    const m5 = Math.round(mins / 5) * 5;
    return { value: Math.round((m5 / 60) * 1000) / 1000, minutes: m5, base: SLEEP_BASE, strainAdd: Math.round(strainAdd), debtAdd: Math.round(debtAdd),
      napSub: Math.round(napSub), strain: s, debtMin: Math.round(debtMin), nights, source: 'need' };
  }

  /* Typical healthy stage shares (deep/REM/light as % of time asleep; awake as % of time in bed).
     StatPearls "Physiology, Sleep Stages" (N3 13–23%, REM 20–25%, N1+N2 ≈50–60%); Google Health help (light 50–60%,
     deep 10–25%, REM 20–25%); Ohayon 2004 meta-analysis (age norms; teens have more deep sleep). */
  const STAGE_NORMS = {
    deep:  { lo: 13, hi: 23, label: 'Deep' },
    rem:   { lo: 20, hi: 25, label: 'REM' },
    light: { lo: 50, hi: 60, label: 'Light' },
    awake: { lo: 0,  hi: 10, label: 'Awake' }
  };
  function stagePercents(sl) {
    if (!sl || !sl.stages || !(sl.minutesAsleep > 0)) return null;
    const st = sl.stages, asleep = sl.minutesAsleep, bed = asleep + (st.awake || 0);
    return { deep: (st.deep / asleep) * 100, rem: (st.rem / asleep) * 100, light: (st.light / asleep) * 100, awake: ((st.awake || 0) / bed) * 100 };
  }
  /** Bedtime/wake consistency: mean absolute deviation (min) of last night's bed & wake times vs the previous ≤7 nights. */
  function timingDeviation(day, sleepByDay) {
    const sl = sleepByDay && sleepByDay[day];
    if (!sl || sl.bedRel === null || sl.bedRel === undefined || sl.wakeRel === null || sl.wakeRel === undefined) return null;
    const prev = priorKeys(day, 1, 7).map((k) => sleepByDay[k]).filter((r) => r && r.bedRel !== null && r.bedRel !== undefined && r.wakeRel !== null && r.wakeRel !== undefined);
    if (prev.length < 3) return null;
    const mb = prev.reduce((a, r) => a + r.bedRel, 0) / prev.length, mw = prev.reduce((a, r) => a + r.wakeRel, 0) / prev.length;
    return { dev: Math.round((Math.abs(sl.bedRel - mb) + Math.abs(sl.wakeRel - mw)) / 2), bedAvg: Math.round(mb), wakeAvg: Math.round(mw), nights: prev.length };
  }

  /* SLEEP SCORE (1–99). The Google Health API does not expose Google's sleep score, so Pulse calculates one.
     duration 45% · deep 12.5% · REM 12.5% · awake time 20% · timing consistency 10% (missing parts re-balanced)
       duration    = 100 × (1 − ((1 − asleep/need) ÷ 0.5)^1.5), 100 when need is met, 0 at half the need
       deep        = 0 at 5% of sleep → 100 at 20%;   REM = 0 at 8% → 100 at 23%
       awake time  = 100 at ≤ 8% of time in bed → 0 at 20%
       consistency = 100 at ≤ 30 min average bed/wake shift vs previous nights → 0 at 120 min
     Bands (like Fitbit/Google): 90+ excellent, 80–89 good, 60–79 fair, <60 poor. */
  const SLEEP_W = { duration: 0.45, deep: 0.125, rem: 0.125, awake: 0.2, consistency: 0.1 };
  function computeSleepScore(sl, needHours, timing) {
    if (!sl || !(sl.minutesAsleep > 0)) return null;
    const need = needHours || SLEEP_BASE;
    const r = sl.minutesAsleep / 60 / need;
    const parts = { duration: r >= 1 ? 100 : r <= 0.5 ? 0 : 100 * (1 - Math.pow((1 - r) / 0.5, 1.5)) };
    const pc = stagePercents(sl);
    let awakePct = null;
    if (pc) { parts.deep = lin(pc.deep, 5, 20); parts.rem = lin(pc.rem, 8, 23); awakePct = pc.awake; }
    else if (sl.minutesInBed > 0) awakePct = Math.max(0, (sl.minutesInBed - sl.minutesAsleep) / sl.minutesInBed * 100);
    if (awakePct !== null) parts.awake = 100 - lin(awakePct, 8, 20);
    if (timing && typeof timing.dev === 'number') parts.consistency = 100 - lin(timing.dev, 30, 120);
    const w = {}; Object.keys(parts).forEach((k) => { w[k] = SLEEP_W[k]; });
    const tw = Object.values(w).reduce((a, b) => a + b, 0);
    const value = Object.keys(parts).reduce((a, k) => a + parts[k] * w[k], 0) / tw;
    Object.keys(parts).forEach((k) => { parts[k] = Math.round(parts[k]); });
    return { value: Math.round(clamp(value, 1, SCORE_CAP)), parts, need: Math.round(need * 100) / 100,
      pcts: pc ? { deep: Math.round(pc.deep), rem: Math.round(pc.rem), light: Math.round(pc.light), awake: Math.round(pc.awake) } : null,
      awakePct: awakePct === null ? null : Math.round(awakePct), timingDev: timing ? timing.dev : null };
  }
  /** Backwards-compatible name used by older code. */
  const computeSleepQuality = (sl, need, timing) => computeSleepScore(sl, need, timing);

  /* RECOVERY (1–99) – today's HRV, resting HR and respiratory rate vs your own previous 30 days, plus last night's
     sleep score. Each physiological part is a z-score passed through a logistic curve so an average day ≈ 57–62:
       part(z) = 100 / (1 + e^−(0.3 + z))      z = 0 → 57, +1 → 79, +2 → 91, −1 → 33, −2 → 15
       HRV z = (ln HRV_today − mean ln HRV) / max(SD, 0.08)   (log scale, Plews/Buchheit)
       RHR z = (mean RHR − RHR_today) / max(SD, 2 bpm)        (lower RHR is better)
       resp z = (mean − today) / max(SD, 0.5 br/min)          (needs 7 prior days)
     recovery = 0.55×HRV + 0.20×RHR + 0.20×sleep score + 0.05×resp (missing parts re-balanced), shown 1–99.
     Needs ≥ 4 previous days of HRV (“Calibrating” before that). Zones: green ≥ 67, yellow 34–66, red ≤ 33. */
  const MIN_HRV_DAYS = 4;
  const logistic = (z) => 100 / (1 + Math.exp(-(0.3 + 1.0 * clamp(z, -3.5, 3.5))));
  function computeRecovery(day, hrvByDay, rhrByDay, sleepScore, respByDay) {
    const keys = priorKeys(day, 1, 30);
    const hrvBase = keys.map((k) => hrvByDay && hrvByDay[k]).filter((v) => v > 0);
    const today = hrvByDay && hrvByDay[day];
    if (hrvBase.length < MIN_HRV_DAYS) return { value: null, calibrating: true, hrvDays: hrvBase.length, need: MIN_HRV_DAYS };
    if (!(today > 0)) return { value: null, calibrating: false, missing: 'hrv', hrvDays: hrvBase.length };
    const ls = stats(hrvBase.map(Math.log));
    const z = { hrv: (Math.log(today) - ls.mean) / Math.max(ls.sd, 0.08) };
    const parts = { hrv: logistic(z.hrv) };
    const w = { hrv: 0.55 };
    const rBase = keys.map((k) => rhrByDay && rhrByDay[k]).filter((v) => v > 0);
    const rToday = rhrByDay && rhrByDay[day];
    if (rToday > 0 && rBase.length >= MIN_HRV_DAYS) {
      const rs = stats(rBase); z.rhr = (rs.mean - rToday) / Math.max(rs.sd, 2);
      parts.rhr = logistic(z.rhr); w.rhr = 0.2;
    }
    if (typeof sleepScore === 'number' && sleepScore > 0) { parts.sleep = sleepScore; w.sleep = 0.2; }
    const pBase = keys.map((k) => respByDay && respByDay[k]).filter((v) => v > 0);
    const pToday = respByDay && respByDay[day];
    if (pToday > 0 && pBase.length >= 7) {
      const ps = stats(pBase); z.resp = (ps.mean - pToday) / Math.max(ps.sd, 0.5);
      parts.resp = logistic(z.resp); w.resp = 0.05;
    }
    const tw = Object.values(w).reduce((a, b) => a + b, 0);
    const value = Object.keys(w).reduce((a, k) => a + parts[k] * w[k], 0) / tw;
    Object.keys(parts).forEach((k) => { parts[k] = Math.round(parts[k]); });
    Object.keys(z).forEach((k) => { z[k] = Math.round(z[k] * 100) / 100; });
    return { value: Math.round(clamp(value, 1, SCORE_CAP)), calibrating: false, hrvDays: hrvBase.length, parts, z,
      weights: w, baseline: { hrv: Math.round(Math.exp(ls.mean)), rhr: rBase.length ? Math.round(stats(rBase).mean) : null } };
  }

  // ---------- automatic targets (the Google Health API v4 exposes no user goals) ----------
  const TARGET_DEFAULTS = { sleep: SLEEP_BASE, steps: 10000 };
  const MIN_TARGET_DAYS = 7;
  /** Sleep target = tonight's-style sleep need for the night ending on `day` (see sleepNeed). */
  function sleepTarget(day, sleepByDay, strainByDay) { return sleepNeed(day, sleepByDay || {}, strainByDay || {}); }
  /** Step target: 30-day average + 10%, rounded to 500 and kept within 6,000–12,000 (benefits plateau around
      8–10k/day for adults, Paluch 2022; ~10–11.7k ≈ 60 min MVPA for teens, Tudor-Locke 2011). Default 10,000 until 7 days. */
  function stepTarget(day, stepsByDay) {
    const vals = priorKeys(day, 1, 30).map((k) => stepsByDay && stepsByDay[k]).filter((v) => v > 0);
    if (vals.length < MIN_TARGET_DAYS) return { value: TARGET_DEFAULTS.steps, source: 'default', days: vals.length, need: MIN_TARGET_DAYS };
    const a = vals.reduce((x, y) => x + y, 0) / vals.length;
    return { value: Math.round(clamp(a * 1.1, 6000, 12000) / 500) * 500, source: 'personal', days: vals.length, avg: Math.round(a) };
  }
  /** Strain target band from today's recovery (WHOOP-style zones):
      red (≤33) 5–9…10, yellow (34–66) 10–14, green (67–89) 14–17, very high green (90–99) up to 18. */
  function strainTarget(recovery) {
    if (!(typeof recovery === 'number' && isFinite(recovery))) return null;
    const rec = clamp(recovery, 0, 100);
    let low, high, zone;
    if (rec <= 33) { low = 5; high = 9 + rec / 33; zone = 'red'; }
    else if (rec <= 66) { low = 10; high = 14; zone = 'yellow'; }
    else { low = 14; high = 17 + Math.max(0, rec - 89) / 10; zone = 'green'; }
    high = Math.min(18, high);
    return { low: r1(low), high: r1(high), mid: r1((low + high) / 2), zone };
  }

  // ---------- sleep stage insights (plain language, not medical advice) ----------
  const fmtM = (m) => { m = Math.round(m); const h = Math.floor(m / 60), mm = m % 60; return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`; };
  function stageAnalysis(sl) {
    const pc = stagePercents(sl); if (!pc) return null;
    return ['deep', 'rem', 'light', 'awake'].map((k) => {
      const n = STAGE_NORMS[k], pct = Math.round(pc[k]);
      const status = k === 'awake' ? (pct > n.hi ? 'high' : 'ok') : pct < n.lo ? 'low' : pct > n.hi ? 'high' : 'ok';
      return { key: k, label: n.label, min: sl.stages[k] || 0, pct, lo: n.lo, hi: n.hi, status };
    });
  }
  function stageNote(a, sl) {
    const t = `${fmtM(a.min)} (${a.pct}%)`, rng = a.key === 'awake' ? 'under ~10% of time in bed' : `${a.lo}–${a.hi}%`;
    const N = {
      deep: {
        what: 'Deep sleep is when growth hormone peaks and your body repairs muscle, restores energy and supports the immune system.',
        ok: `You got ${t}, inside the typical ${rng}. That's solid physical recovery for today's training.`,
        low: `You got ${t}, below the typical ${rng}. Muscles may feel heavier today, so keep hard sessions controlled and protect tonight's sleep.`,
        high: `You got ${t}, above the typical ${rng}. That's common after hard training or short nights: your body put physical recovery first.`
      },
      rem: {
        what: 'REM sleep supports memory, learning, mood and emotional control. It also helps lock in new skills, like football or padel technique.',
        ok: `You got ${t}, inside the typical ${rng}. Good for focus, mood and learning new technique today.`,
        low: `You got ${t}, below the typical ${rng}. You might feel a bit more irritable or find new drills harder to lock in. Most REM comes late in the night, so a short night or early alarm cuts it the most.`,
        high: `You got ${t}, above the typical ${rng}. That often happens as a rebound after short nights, and on its own it's nothing to worry about.`
      },
      light: {
        what: 'Light sleep links the other stages. Sleep spindles in light sleep help consolidate memories and motor skills.',
        ok: `You got ${t}, inside the typical ${rng}.`,
        low: `You got ${t}, below the typical ${rng}. That usually just means deep or REM took a bigger share, which is fine.`,
        high: `You got ${t}, above the typical ${rng}, which usually leaves less room for deep and REM. A warm room, late caffeine or broken sleep can do this.`
      },
      awake: {
        what: 'Short awakenings are normal and usually forgotten. Lots of waking breaks up sleep cycles, though.',
        ok: `You were awake ${t} of the night, ${a.pct <= 10 ? 'under ~10%' : ''}: fairly unbroken sleep.`,
        high: `You were awake ${t} of the night${sl && sl.awakenings ? ` over ${sl.awakenings} awakenings` : ''}, above ~10%. Broken sleep can leave you groggier and less sharp even when total time looks OK.`
      }
    }[a.key];
    return { what: N.what, today: N[a.status] || N.ok };
  }
  /** Up to 3 evidence-based tips chosen from the night's data. ctx: {sleep, need, timing, lateWorkout:{minutesBeforeBed, label}} */
  function sleepTips(ctx) {
    const tips = [], sl = ctx && ctx.sleep; if (!sl) return tips;
    const an = stageAnalysis(sl) || [], by = {}; an.forEach((a) => { by[a.key] = a; });
    const needH = ctx.need || SLEEP_BASE, shortBy = needH - (sl.minutesAsleep || 0) / 60;
    const clock = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
    if (shortBy >= 0.5 && sl.wakeRel !== null && sl.wakeRel !== undefined) {
      tips.push({ id: 'earlier', title: 'Go to bed a bit earlier', src: 'aasm',
        text: `You were ${fmtM(shortBy * 60)} short of your ${fmtM(needH * 60)} need. To wake at ${sl.wake || clock(sl.wakeRel)} with a full night, aim to be in bed by about ${clock(sl.wakeRel - needH * 60 - 15)}. In one study, college athletes who slept longer sprinted faster and shot more accurately.` });
    }
    if (ctx.timing && ctx.timing.dev > 45) {
      tips.push({ id: 'consistency', title: 'Keep a steady bedtime', src: 'phillips',
        text: `Last night was about ${ctx.timing.dev} min off your usual schedule (bed ~${clock(ctx.timing.bedAvg)}, wake ~${clock(ctx.timing.wakeAvg)}). Irregular sleep shifts your body clock later; try to keep bed and wake times within ~30 min, weekends included.` });
    }
    const lw = ctx.lateWorkout;
    if (lw && lw.minutesBeforeBed !== null && lw.minutesBeforeBed <= 120) {
      tips.push({ id: 'late-training', title: 'Leave a gap after late training', src: 'stutz',
        text: `${lw.label || 'Your workout'} finished about ${fmtM(Math.max(0, lw.minutesBeforeBed))} before bed. Evening exercise is usually fine, but hard sessions ending within ~1–2 h of bedtime can delay sleep. Try a cool shower and a wind-down, and finish intense sessions earlier when you can.` });
    }
    if ((by.awake && by.awake.status === 'high') || (by.deep && by.deep.status === 'low') || (by.light && by.light.status === 'high')) {
      tips.push({ id: 'cool-room', title: 'Keep your room cool', src: 'okamoto',
        text: 'Heat and humidity increase waking and cut deep and REM sleep, which matters in Bahrain\'s summer. Run the AC so the room feels cool (many sleep experts suggest about 18–20 °C), use light bedding, and keep the room dark.' });
    }
    if ((sl.latency !== null && sl.latency !== undefined && sl.latency > 20) || (by.rem && by.rem.status === 'low')) {
      tips.push({ id: 'caffeine-screens', title: 'Cut caffeine and screens late', src: 'drake',
        text: `${sl.latency > 20 ? `It took about ${sl.latency} min to fall asleep. ` : ''}Caffeine even 6 h before bed can cut sleep by more than an hour, so avoid coffee, energy drinks and cola after early afternoon. Bright screens late in the evening also delay melatonin; dim them for the last 30–60 min.` });
    }
    if (!tips.length) tips.push({ id: 'keep', title: 'Keep doing what works', src: 'phillips', text: 'Your sleep looked balanced last night. A steady bedtime and wake time is the simplest way to keep it that way.' });
    return tips.slice(0, 3);
  }

  return {
    dateKey, keyToDate, durationSec, mapSleep, mapDaily, mapWeight, mapRollup, mapExercise, mapExerciseType,
    computeStrain, strainFromLoad, computeSleepScore, computeSleepQuality, computeRecovery, priorKeys, MIN_HRV_DAYS,
    STRAIN_W, STRAIN_A, STRAIN_B, SLEEP_W, SLEEP_BASE, STAGE_NORMS, SCORE_CAP, logistic,
    sleepNeed, sleepTarget, stepTarget, strainTarget, timingDeviation, stagePercents, stageAnalysis, stageNote, sleepTips,
    TARGET_DEFAULTS, MIN_TARGET_DAYS
  };
});
