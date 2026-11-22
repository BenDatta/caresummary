// Refreshes app/endpoints.json from Epic's published list of R4 FHIR endpoints.
// Usage: npm run update-endpoints
const fs = require("fs");
const path = require("path");

const SOURCE = "https://open.epic.com/Endpoints/R4";
const OUT = path.join(__dirname, "..", "app", "endpoints.json");

(async () => {
  const res = await fetch(SOURCE, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${SOURCE}`);
  const bundle = await res.json();
  const list = (bundle.entry || [])
    .map((e) => e.resource)
    .filter((r) => r?.resourceType === "Endpoint" && r.status === "active" && r.address)
    .map((r) => ({ name: r.name, iss: r.address.endsWith("/") ? r.address : r.address + "/" }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  fs.writeFileSync(OUT, JSON.stringify(list, null, 0).replace(/},{/g, "},\n{"));
  console.log(`Saved ${list.length} health systems to app/endpoints.json`);
})().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
