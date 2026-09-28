# Pulse

A mobile-first personal health dashboard (sleep, recovery, strain, workouts, vitals).
Live: https://zuhayrsyed69-netizen.github.io/pulse-dashboard/

- Open the link on your phone and use **Add to Home Screen** to install it.
- Everything is automatic from the **Google Health app** (Fitbit devices) via the Google Health API: nothing is typed in by hand.
- Sleep, Recovery and Strain are calculated by Pulse and refresh on open, when you return to the app, and every 15 minutes while it's open.
- Targets are automatic too: sleep need (8.5 h base + strain + sleep debt − naps), steps (30-day average + 10%, 6,000–12,000) and strain (a band set by today's recovery, shown hatched on the ring).
- Sleep tab: calibrated sleep score, a hypnogram of last night's stages, time/% per stage against typical ranges, plain-language notes and 1–3 tips based on your data.
- Date switcher: tap the date to look back over the last 14 days (read-only).
- Calibration and sources: [docs/calibration.md](docs/calibration.md).
- Everything is stored only in your browser (localStorage). There is no server. Synced data goes straight from Google's API to your browser.
- Plain HTML/CSS/JS, no build step.

## Google Health sync (one-time setup, ~10 min)

1. Create a Google Cloud project: https://console.cloud.google.com/projectcreate
2. Enable the Google Health API: https://console.cloud.google.com/apis/library/health.googleapis.com
3. Google Auth Platform → Branding: app name `Pulse`, your email as support + developer contact.
   Audience: **External**, leave it in **Testing**, add your Google account under **Test users**.
4. Data Access → Add or remove scopes → add:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
5. Clients → Create client → **Web application**
   - Authorized JavaScript origins: `https://zuhayrsyed69-netizen.github.io`
   - Authorized redirect URIs: `https://zuhayrsyed69-netizen.github.io/pulse-dashboard/`
6. Put the Client ID (no secret needed) in `config.js`.

Recovery, strain, sleep score and targets are calculated by Pulse from your Google Health data (see "How are these calculated?" in the app); they are not official Fitbit/Google scores. The Google Health API does not expose app goals, so targets are derived from your own history.
