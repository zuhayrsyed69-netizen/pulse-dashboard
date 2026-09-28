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

  /** sleep dataPoints -> { dayKey(wake date): {...} } using the main sleep (or longest) per day */
  function mapSleep(points) {
    const byDay = {};
    (points || []).forEach((dp) => {
      const s = dp && dp.sleep; if (!s || !s.interval) return;
      const iv = s.interval;
      const endDate = iv.civilEndTime && iv.civilEndTime.date;
      let key = dateKey(endDate);
      if (!key && iv.endTime) { const d = new Date(iv.endTime); key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
      if (!key) return;
      const sum = s.summary || {};
      const asleep = num(sum.minutesAsleep);
      const inPeriod = num(sum.minutesInSleepPeriod) || (iv.startTime && iv.endTime ? (Date.parse(iv.endTime) - Date.parse(iv.startTime)) / 60000 : null);
      const stages = {};
      (sum.stagesSummary || []).forEach((st) => { if (st && st.type) stages[st.type.toLowerCase()] = num(st.minutes) || 0; });
      const rec = {
        minutesAsleep: asleep,
        minutesInBed: inPeriod,
        sleepHours: asleep !== null ? Math.round((asleep / 60) * 100) / 100 : null,
        efficiency: asleep !== null && inPeriod ? Math.round((asleep / inPeriod) * 100) : null,
        stages: (stages.deep !== undefined || stages.rem !== undefined || stages.light !== undefined)
          ? { deep: stages.deep || 0, light: stages.light || 0, rem: stages.rem || 0, awake: stages.awake || 0 } : null,
        bedtime: iv.civilStartTime ? hhmm(iv.civilStartTime.time) : null,
        wake: iv.civilEndTime ? hhmm(iv.civilEndTime.time) : null,
        main: !!(s.metadata && s.metadata.mainSleep),
        nap: !!(s.metadata && s.metadata.nap)
      };
      const prev = byDay[key];
      const better = !prev || (rec.main && !prev.main) || (rec.main === prev.main && (rec.minutesAsleep || 0) > (prev.minutesAsleep || 0));
      if (!rec.nap || !prev) { if (better) byDay[key] = rec; }
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

  // ---------- formulas ----------

  /* STRAIN (0–21)
     TRIMP = 1×light + 2×moderate + 3×vigorous + 4×peak   (minutes in Google Health heart-rate zones)
     Fallback when zone minutes are missing: TRIMP ≈ 2×fatBurnAZM + 1.5×cardioAZM + 2×peakAZM
       (AZM counts 1/min in fat-burn and 2/min in cardio/peak, so this equals 2×fat-burn min + 3×cardio min + 4×peak min)
     Strain = 21 × ln(1 + TRIMP/25) / ln(1 + 600/25), capped at 21 (logarithmic like WHOOP: early load counts most). */
  const STRAIN_K = 25, STRAIN_MAX_TRIMP = 600;
  function computeStrain(zones, azm) {
    let trimp = null, method = null;
    if (zones && typeof zones === 'object') {
      trimp = 1 * (zones.light || 0) + 2 * (zones.moderate || 0) + 3 * (zones.vigorous || 0) + 4 * (zones.peak || 0);
      method = 'zones';
    } else if (azm) {
      trimp = 2 * (azm.fatBurn || 0) + 1.5 * (azm.cardio || 0) + 2 * (azm.peak || 0);
      method = 'azm';
    }
    if (trimp === null) return null;
    const value = Math.min(21, (21 * Math.log(1 + trimp / STRAIN_K)) / Math.log(1 + STRAIN_MAX_TRIMP / STRAIN_K));
    return { value: r1(value), trimp: Math.round(trimp), method };
  }

  /* SLEEP QUALITY (%) – the Google Health API does not expose a sleep score, so:
     With stages:  0.5×efficiency + 0.3×durationScore + 0.2×restorativeScore
     Without:      0.6×efficiency + 0.4×durationScore
     efficiency = minutes asleep / minutes in sleep period × 100
     durationScore = min(100, hours asleep / goal × 100)
     restorativeScore = min(100, (deep+REM) / minutes asleep / 0.40 × 100)   (40%+ deep+REM scores 100) */
  function computeSleepQuality(sleep, goalHours) {
    if (!sleep || sleep.minutesAsleep === null || sleep.minutesAsleep === undefined || !sleep.efficiency) return null;
    const goal = goalHours || 8;
    const eff = clamp(sleep.efficiency, 0, 100);
    const dur = Math.min(100, (sleep.minutesAsleep / 60 / goal) * 100);
    let value, parts;
    if (sleep.stages && sleep.minutesAsleep > 0) {
      const restor = Math.min(100, (((sleep.stages.deep || 0) + (sleep.stages.rem || 0)) / sleep.minutesAsleep / 0.4) * 100);
      value = 0.5 * eff + 0.3 * dur + 0.2 * restor;
      parts = { efficiency: Math.round(eff), duration: Math.round(dur), restorative: Math.round(restor) };
    } else {
      value = 0.6 * eff + 0.4 * dur;
      parts = { efficiency: Math.round(eff), duration: Math.round(dur) };
    }
    return { value: Math.round(clamp(value, 0, 100)), parts };
  }

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

  /* RECOVERY (%) – needs ≥4 days of HRV in the prior 30 days, otherwise "Calibrating".
     Baseline = the previous 30 days (excluding today).
     HRV score = clamp(60 + 20 × z, 0, 100), z = (ln HRV_today − mean ln HRV_baseline) / max(sd, 0.05)
     RHR score = clamp(60 + 20 × z, 0, 100), z = (mean RHR_baseline − RHR_today) / max(sd, 1.5 bpm)
     Sleep score = min(100, hours asleep / goal × 100)
     Recovery = 0.6×HRV + 0.2×RHR + 0.2×Sleep (weights re-normalised over the parts that exist; HRV is required). */
  const MIN_HRV_DAYS = 4;
  function computeRecovery(day, hrvByDay, rhrByDay, sleepHours, goalHours) {
    const keys = priorKeys(day, 1, 30);
    const hrvBase = keys.map((k) => hrvByDay && hrvByDay[k]).filter((v) => v > 0);
    const today = hrvByDay && hrvByDay[day];
    if (hrvBase.length < MIN_HRV_DAYS) return { value: null, calibrating: true, hrvDays: hrvBase.length, need: MIN_HRV_DAYS };
    if (!(today > 0)) return { value: null, calibrating: false, missing: 'hrv', hrvDays: hrvBase.length };
    const ls = stats(hrvBase.map(Math.log));
    const zH = (Math.log(today) - ls.mean) / Math.max(ls.sd, 0.05);
    const parts = { hrv: clamp(60 + 20 * zH, 0, 100) };
    const w = { hrv: 0.6 };
    const rBase = keys.map((k) => rhrByDay && rhrByDay[k]).filter((v) => v > 0);
    const rToday = rhrByDay && rhrByDay[day];
    if (rToday > 0 && rBase.length >= MIN_HRV_DAYS) {
      const rs = stats(rBase);
      parts.rhr = clamp(60 + 20 * ((rs.mean - rToday) / Math.max(rs.sd, 1.5)), 0, 100); w.rhr = 0.2;
    }
    if (sleepHours > 0) { parts.sleep = Math.min(100, (sleepHours / (goalHours || 8)) * 100); w.sleep = 0.2; }
    const tw = Object.values(w).reduce((a, b) => a + b, 0);
    const value = Object.keys(w).reduce((a, k) => a + parts[k] * w[k], 0) / tw;
    Object.keys(parts).forEach((k) => { parts[k] = Math.round(parts[k]); });
    return { value: Math.round(clamp(value, 0, 100)), calibrating: false, hrvDays: hrvBase.length, parts,
      baseline: { hrv: Math.round(Math.exp(ls.mean)), rhr: rBase.length ? Math.round(stats(rBase).mean) : null } };
  }

  return {
    dateKey, keyToDate, durationSec, mapSleep, mapDaily, mapWeight, mapRollup, mapExercise, mapExerciseType,
    computeStrain, computeSleepQuality, computeRecovery, priorKeys, MIN_HRV_DAYS, STRAIN_K, STRAIN_MAX_TRIMP
  };
});
