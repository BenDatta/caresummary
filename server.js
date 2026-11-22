// CareSummary dev server — no dependencies.
// Serves app/ and builds /config.js from .env so client IDs never live in source files.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "app");

// ── load .env (simple KEY=VALUE parser) ──
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnv(path.join(ROOT, ".env"));

const env = process.env;
const PORT = Number(env.PORT) || 8045;
const config = {
  nonProdClientId: env.EPIC_NON_PROD_CLIENT_ID || "",
  prodClientId: env.EPIC_PROD_CLIENT_ID || "",
  redirectUri: env.REDIRECT_URI || `http://localhost:${PORT}`,
  defaultOrganization: env.DEFAULT_ORGANIZATION || "",
  scope: env.SCOPE || "openid fhirUser launch/patient patient/Patient.read patient/Observation.read patient/MedicationRequest.read",
};

if (!config.nonProdClientId && !config.prodClientId) {
  console.warn("⚠️  No client IDs found. Copy .env.example to .env and fill in EPIC_NON_PROD_CLIENT_ID / EPIC_PROD_CLIENT_ID.");
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (url.pathname === "/config.js") {
    res.writeHead(200, { ...headers, "Content-Type": TYPES[".js"] });
    return res.end(`window.APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
  }

  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403, headers); return res.end("Forbidden"); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, headers); return res.end("Not found"); }
    res.writeHead(200, { ...headers, "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  CareSummary running → http://localhost:${PORT}`);
  console.log(`  Demo (sample data)  → http://localhost:${PORT}/?demo`);
  console.log(`  Redirect URI        → ${config.redirectUri}  (must match your Epic app)\n`);
}).on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`❌ Port ${PORT} is already in use. Stop the other server (Ctrl+C in its terminal) or set PORT in .env.`);
  else console.error(e);
  process.exit(1);
});
