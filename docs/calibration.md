# Pulse score calibration (v5)

Pulse calculates **Recovery**, **Strain** and a **Sleep score** from Google Health data, along with automatic **targets**. This page explains how each is calibrated and why, with sources. These are Pulse's own estimates for personal insight. They are **not** WHOOP, Bevel, Oura or Google scores, and they are **not medical advice**.

## Why Pulse calculates its own scores

We checked the Google Health API v4 discovery document (revision 20260923). It exposes raw data such as HRV, resting HR, sleep sessions with stage segments, time in heart-rate zones, Active Zone Minutes, respiratory rate, SpO₂, skin temperature, exercise sessions and steps. It does **not** expose the Google Health app's own scores: there are no Readiness, Sleep score or Cardio load data types, and no user goals. Pulse therefore calculates these scores itself and aims for the same behaviour as the commercial scores:

| Reference | Behaviour Pulse copies |
|---|---|
| WHOOP Recovery | Zones: green 67–99%, yellow 34–66%, red 1–33%, so a perfect 100 is never shown. The member average is about 58%. |
| Oura Readiness | 85+ counts as optimal and 70–84 as good. "100s are designed to be rare." |
| Google Health Readiness | Built from HRV, resting HR and sleep. Needs about 7 nights of data. High ≥65, moderate 30–64, low ≤29. |
| Google/Fitbit Sleep score | 90–100 excellent, 80–89 good, 60–79 fair, under 60 poor. Most people score 72–83. |
| WHOOP Strain | 0–21, logarithmic. Light 0–9, moderate 10–13, high 14–17, all out 18–21. Everyday activity gives about 4–5. |
| WHOOP Strain Coach | The optimal strain range depends on today's recovery. |
| WHOOP Sleep Need | Baseline + strain + sleep debt − naps. The member average need is about 8 h 34 min. |
| Bevel (design reference) | Strain / Recovery / Sleep rings, with the target strain shown as a hatched area on the strain ring. Bevel's strain is a 0–100%+ logarithmic score whose target is set from recent recovery and the ~14-day strain baseline. |

## Recovery (1–99%)

**Before (v4):** each part was 60 + 20·z with linear clamping to 0–100, averaged 0.6/0.2/0.2. A day with HRV about 1.5 SD above baseline and a full night scored 90–100, and 100 was reachable.

**Now:**

- Every signal is compared with your own previous 30 days as a z-score. HRV is compared on a log scale, following Plews 2012 and Buchheit 2014.
- The z-score then passes through a logistic curve, so each part saturates smoothly:
  - `part(z) = 100 / (1 + e^−(0.3 + z))`
  - z = 0 → 57, +1 → 79, +2 → 91, −1 → 33, −2 → 15
- z-scores come from:
  - HRV: `(ln today − mean ln) / max(SD, 0.08)`. The SD floor matches typical day-to-day lnRMSSD variation of about 3–8% (CV).
  - Resting HR: `(mean − today) / max(SD, 2 bpm)`, because lower is better.
  - Respiratory rate: `(mean − today) / max(SD, 0.5 br/min)`. Used only when there are 7 or more prior days.
- `recovery = 0.55·HRV + 0.20·RHR + 0.20·sleep score + 0.05·resp`. Missing parts are re-balanced. The result is shown between 1 and 99.
- Recovery needs 4 or more previous days of HRV; until then it shows "Calibrating".

**Results (unit tests; v4 value in brackets):**

| Scenario | Recovery |
|---|---|
| Typical day (z = 0, sleep 78) | 61 (v4 ≈ 67) |
| Great day (HRV +1.5 SD, RHR −1 SD, sleep 92) | 84 (v4 ≈ 90) |
| Excellent day (HRV and RHR +2 SD, sleep 97) | 90 (v4 = 100) |
| Bad night (HRV −1.5 SD, RHR +1.5 SD, sleep 45) | 29 (v4 ≈ 38) |
| Best possible | 96 |
| Worst possible | 7 |
| 300 simulated ordinary days | mean 61, 36% green, 0% at 90+, max 88 |

## Strain (0–21)

**Before (v4):**

- `TRIMP = 1·light + 2·moderate + 3·vigorous + 4·peak`
- `strain = 21·ln(1 + TRIMP/25)/ln 25`
- A load of 600 hit 21, and hard days reached 19–21 too easily.

**Now:**

- Load is an Edwards-style TRIMP on Google's four Karvonen heart-rate zones:
  - `load = 0.5·light + 2·moderate + 3.5·vigorous + 5·peak` (minutes)
  - Light gets a low weight because it mostly captures daily living.
  - Fallback without zone data (Active Zone Minutes): `2·fatBurn + 1.75·cardioAZM + 2.5·peakAZM`
- `strain = 4.35 · ln(1 + load/10)`, capped at 21.
- The curve is anchored to published football loads (Edwards TRIMP): training about 167–214 AU, matches about 321–449 AU (MDPI *Technologies* 2023, 11(3):79).

| Day | Zone minutes (light/mod/vig/peak) | Load (v5) | Strain v4 → v5 |
|---|---|---|---|
| Rest / normal day | 90/5/0/0 | 55 | 10.5 → **8.1** |
| Team training | 80/30/25/5 | 213 | 15.3 → **13.5** |
| Padel 90 min + day | 80/40/25/5 | 233 | 15.8 → **13.9** |
| Football match + day | 80/25/40/15 | 305 | 16.9 → **15.0** |
| Double session / tournament | 120/60/90/45 | 720 | 21.0 → **18.7** |

Reaching 21 takes a load of about 1,200 or more, which is very rare.

## Strain target (from recovery)

| Recovery | Target band |
|---|---|
| Red (1–33) | 5 – 9…10 |
| Yellow (34–66) | 10 – 14 |
| Green (67–89) | 14 – 17 |
| Very high green (90–99) | 14 – up to 18 |

This follows WHOOP's Strain Coach idea: the fresher you are, the more load is productive. On the strain ring the band is drawn as a **hatched arc**, as in Bevel.

## Sleep need (the "sleep target")

- **Base 8.5 h.** The AASM consensus recommends 8–10 h for 13–18 year olds and 7+ h for adults, and WHOOP's member average need is about 8.6 h. 8.5 h fits inside the teen range and at the top of the adult range, so it's a defensible default when age isn't available. The Google Health API only exposes age with an extra profile scope, which Pulse doesn't request.
- **+ strain:** 4 min per strain point above 10 yesterday, up to 45 min.
- **+ sleep debt:** 25% of the shortfall against 8.5 h over the last 3 nights, up to 60 min.
- **− naps:** naps recorded yesterday are subtracted.
- The result is kept between 7 and 11 h.

## Sleep score (1–99)

**Before (v4):** "Sleep quality" = 0.5·efficiency + 0.3·duration + 0.2·restorative. Efficiency alone usually gave 90+, so most nights scored 85–95.

**Now:** a weighted composite. Missing parts are re-balanced.

| Part | Weight | Scoring |
|---|---|---|
| Duration vs need | 45% | `100·(1 − ((1 − asleep/need)/0.5)^1.5)`: 100 when need is met, 0 at half the need |
| Deep % of sleep | 12.5% | 0 at 5% → 100 at 20% |
| REM % of sleep | 12.5% | 0 at 8% → 100 at 23% |
| Awake % of time in bed | 20% | 100 at ≤ 8% → 0 at 20% |
| Bed/wake consistency | 10% | Mean shift vs the previous ≤ 7 nights: 100 at ≤ 30 min → 0 at 120 min |

**Results:**

| Night | Details | Score |
|---|---|---|
| Typical teen night | 7.5 h vs 8.75 h need, 17% deep, 21% REM, 11% awake, 40 min shift | 83 (v4 "quality" ≈ 92) |
| Great night | 8.9 h, 20% / 24%, 6% awake, 10 min shift | 99 |
| Bad night | 5.5 h vs 9 h, 11% / 15%, 17% awake, 100 min shift | 32 |
| Test fixture | 6.7 h vs 8.9 h | 81 |

## Sleep stages (Sleep tab)

The hypnogram uses Google Health `sleep.stages[]` segments (AWAKE / LIGHT / DEEP / REM) from the main sleep. Stage minutes come from `summary.stagesSummary`, and awakenings and time to fall asleep come from the summary as well.

Typical ranges shown in the app:

- **Deep:** 13–23% of sleep. StatPearls gives N3 as ~13–23%. Ohayon 2004 shows slow-wave sleep is highest in youth and falls with age.
- **REM:** 20–25% of sleep (StatPearls; Google Health help).
- **Light:** 50–60% of sleep. Google Health help gives light as 50–60%; in lab terms this is N1 + N2.
- **Awake:** under ~10% of time in bed. Fitbit users often see 10–15% because brief awakenings are counted.

What each stage does, as explained in the app:

- **Deep:** growth-hormone release, muscle repair and immune support (Van Cauter 1998).
- **REM:** memory, learning, mood, emotional regulation and skill learning.
- **Light:** spindles in light sleep help consolidate motor skills (Walker 2002).
- **Awake:** fragmented sleep → grogginess.

Tips (1–3) are chosen from the night's data:

| Trigger | Tip | Source |
|---|---|---|
| Short vs need | An earlier bedtime, with a concrete time | AASM; Mah 2011: sleep extension improved athletes' sprint and shooting |
| Irregular timing (> 45 min) | Keep a steady bedtime | Phillips 2017 |
| Hard workout ending within 2 h of bed | Leave a gap after late training | Stutz 2019: evening exercise is fine except vigorous exercise ≤ 1 h before bed |
| Low deep, high light or high awake | Keep the room cool with AC in Bahrain's heat | Okamoto-Mizuno 2012 |
| Slow to fall asleep or low REM | Cut caffeine and screens late | Drake 2013: caffeine 6 h before bed cut sleep by more than 1 h; Chang 2015: evening screen light delays melatonin |

## Step target

`30-day average × 1.1`, rounded to 500 and kept between 6,000 and 12,000. It defaults to 10,000 until 7 days of data exist. Mortality benefits level off at about 8–10k steps a day for adults under 60 (Paluch 2022), and about 10,000–11,700 steps corresponds to 60 min of moderate-to-vigorous activity in adolescents (Tudor-Locke 2011).

## Sources

- WHOOP recovery: https://www.whoop.com/gb/en/thelocker/how-does-whoop-recovery-work-101/
- WHOOP member averages: https://www.whoop.com/us/en/thelocker/member-averages-recovery-strain-sleep-hrv/ (summary: https://sahha.ai/blog/how-readiness-scores-are-calculated/)
- WHOOP strain: https://www.whoop.com/us/en/thelocker/how-does-whoop-strain-work-101/ · https://developer.whoop.com/docs/whoop-101/ · https://www.whoop.com/us/en/thelocker/grosicki-strain-explained/
- WHOOP Strain Coach: https://www.whoop.com/us/en/thelocker/strain-coach/
- WHOOP sleep need: https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need/ · https://www.whoop.com/gb/en/thelocker/how-well-whoop-measures-sleep/
- Oura readiness: https://ouraring.com/blog/readiness-score/ · https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score · https://support.ouraring.com/hc/en-us/articles/360057791533-Readiness-Contributors
- Google Health sleep score: https://support.google.com/googlehealth/answer/14236513
- Google Health readiness: https://support.google.com/googlehealth/answer/14236710
- Google Health cardio load: https://support.google.com/googlehealth/answer/15402655
- Google Health sleep stages: https://support.google.com/googlehealth/answer/14236712
- Polar Nightly Recharge: https://www.polar.com/en/img/static/whitepapers/pdf/polar-nightly-recharge-white-paper.pdf
- Garmin HRV status: https://www.garmin.com/en-CA/blog/fitness/understanding-the-hrv-status-on-your-garmin-smartwatch/
- Plews et al. 2012: https://www.springermedicine.com/heart-rate-variability-in-elite-triathletes-is-variation-in-vari/21070152
- Buchheit 2014: https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2014.00073/full
- HRV CV and smallest worthwhile change: https://elitehrv.com/improving-hrv-data-interpretation-coefficient-variation · https://journals.lww.com/nsca-jscr/fulltext/2017/02000/intraday_and_interday_reliability_of.34.aspx
- Edwards TRIMP in football: https://www.mdpi.com/2227-7080/11/3/79
- Paluch et al. 2022: https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(21)00302-9/fulltext
- Tudor-Locke et al. 2011: https://pmc.ncbi.nlm.nih.gov/articles/PMC3166269/
- AASM pediatric consensus: https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf
- StatPearls, Physiology, Sleep Stages: https://www.ncbi.nlm.nih.gov/books/NBK526132/
- Ohayon et al. 2004: https://academic.oup.com/sleep/article/27/7/1255/2696490
- Van Cauter et al. 1998: https://academic.oup.com/sleep/article/21/6/553/2725972
- Walker et al. 2002: https://walkerlab.berkeley.edu/reprints/Walker%20et%20al._Neuron_2002.pdf
- Mah et al. 2011: https://med.stanford.edu/news/all-news/2011/07/snooze-you-win-its-true-for-achieving-hoop-dreams-says-study.html
- Phillips et al. 2017: https://www.nature.com/articles/s41598-017-03171-4
- Stutz et al. 2019: https://pubmed.ncbi.nlm.nih.gov/30374942/ · Leota et al. 2025: https://www.nature.com/articles/s41467-025-58271-x
- Okamoto-Mizuno & Mizuno 2012: https://link.springer.com/article/10.1186/1880-6805-31-14
- Drake et al. 2013: https://aasm.org/late-afternoon-and-early-evening-caffeine-can-disrupt-sleep-at-night/
- Chang et al. 2015: https://www.pnas.org/doi/abs/10.1073/pnas.1418490112
- Bevel: https://docs.bevel.health/getting-started · https://www.bevel.health/blog/what-is-strain-score · https://feedback.bevel.health/feature-requests/p/target-strain-20
