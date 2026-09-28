# Pulse

A mobile-first personal health dashboard (sleep, recovery, strain, workouts, vitals).
Live: https://zuhayrsyed69-netizen.github.io/pulse-dashboard/

- Open the link on your phone and use **Add to Home Screen** to install it.
- Type values in by hand, or sync them from the **Google Health app** (Fitbit devices) through the Google Health API.
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
6. Copy the Client ID (no secret needed) and paste it in Pulse → Settings (gear icon), or set it in `config.js`.

Recovery, strain and sleep quality are calculated by Pulse from your Google Health data (see "How are these calculated?" in the app); they are not official Fitbit/Google scores.
