# CareSummary

A SMART on FHIR patient app for **Epic**. Patients sign in with MyChart and see their record in one dashboard:

- **Profile:** name, age, date of birth, MRN, contact details, primary care provider
- **Vital signs:** latest value per type with trend lines
- **Lab results:** searchable table with High/Low flags and reference ranges
- **Medications:** active and past prescriptions with dosing instructions

Runs in the browser using OAuth 2.0 with PKCE. Patient data goes straight from Epic to the browser and is never stored.

## Screenshots

**1. Pick a health system**

![CareSummary sign-in page](docs/login.webp)

**2. Sign in with MyChart**

![MyChart login page](docs/mychart.webp)

**3. See the health record** (Epic sandbox test patient)

![CareSummary dashboard](docs/dashboard.webp)

## Requirements

- [Node.js](https://nodejs.org) 18+ (no dependencies)
- An app on [fhir.epic.com](https://fhir.epic.com) with:
  - **Redirect URI:** `http://localhost:8045`
  - **Incoming APIs:** `Patient.Read`, `Observation.Read (Vital Signs)`, `Observation.Search (Labs)`, `Observation.Search (Vital Signs)`, `MedicationRequest.Search (Signed Medication Order)` (all R4)

## Quick start

```bash
npm run setup
```

Add your client IDs to `.env`:

```ini
EPIC_NON_PROD_CLIENT_ID=your-non-production-client-id
EPIC_PROD_CLIENT_ID=your-production-client-id
REDIRECT_URI=http://localhost:8045
PORT=8045
```

```bash
npm start
```

Open **http://localhost:8045**.

| Script | What it does |
| --- | --- |
| `npm start` | Runs the app |
| `npm run dev` | Runs the app and restarts on `server.js` changes |
| `npm run setup` | Creates `.env` from `.env.example` |
| `npm run update-endpoints` | Refreshes the list of Epic health systems |

## Trying it

| Option | How |
| --- | --- |
| **Demo** | Open http://localhost:8045/?demo for sample data, no login |
| **Epic sandbox** | Click **Try with Epic test patients**, sign in as `fhircamila` / `epicepic1` |
| **Real health system** | Search for a hospital, then **Continue with MyChart** (needs your app approved for production) |

## Configuration

| Variable | Description |
| --- | --- |
| `EPIC_NON_PROD_CLIENT_ID` | Non-production client ID (sandbox) |
| `EPIC_PROD_CLIENT_ID` | Production client ID (real health systems) |
| `REDIRECT_URI` | Must exactly match the redirect URI on your Epic app |
| `PORT` | Port to serve on (default `8045`) |
| `DEFAULT_ORGANIZATION` | Optional health system to preselect |
| `SCOPE` | Optional override for OAuth scopes |

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

## Troubleshooting

| Problem | Fix |
| --- | --- |
| **"The request is invalid"** | `REDIRECT_URI` doesn't exactly match your Epic app |
| **"OAuth2 Error"** at a hospital | Your production client ID isn't active there yet |
| **Port 8045 in use** | Stop the other server or change `PORT` and `REDIRECT_URI` |
| Empty data sections | Check the matching Incoming API is enabled on your Epic app |

## Credits

Built with the help of [Claude](https://claude.ai) by Anthropic.
