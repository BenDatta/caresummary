# CareSummary

A patient-facing **SMART on FHIR** app for **Epic**. Patients pick their health system, sign in with MyChart, and see their health record in one dashboard.

## Screenshots

**1. Pick a health system**

![CareSummary sign-in page](docs/login.webp)

**2. Sign in with MyChart**

![MyChart login page](docs/mychart.webp)

**3. See the health record** (Epic sandbox test patient)

![CareSummary dashboard](docs/dashboard.webp)

## What was built

- **Epic app** registered on fhir.epic.com with sandbox and production client IDs, using only these APIs: `Patient.Read`, `Observation.Read/Search (Vital Signs)`, `Observation.Search (Labs)`, `MedicationRequest.Search`
- **Secure sign-in** with SMART on FHIR and OAuth 2.0 PKCE (no client secret, token kept in the browser session)
- **Hospital search** across Epic's directory of 477 health systems, plus a shortcut to Epic's test patients
- **Dashboard** with profile, vitals with trend lines, labs with High/Low flags, and medications
- **Privacy first:** data goes straight from Epic to the browser and is never stored
- **No frameworks:** plain HTML/CSS/JS and a dependency-free Node server, with client IDs kept in `.env`

## Project structure

```
├── server.js                  # Node server; serves app/ and /config.js from .env
├── scripts/update-endpoints.js
└── app/
    ├── index.html
    ├── app.js                 # SMART auth, FHIR calls, dashboard UI
    ├── style.css
    ├── demo-data.js           # Sample data for ?demo
    └── endpoints.json         # Epic R4 health systems
```

## Credits

Built with the help of [Claude](https://claude.ai) by Anthropic.
