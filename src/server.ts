/**
 * x402-weather-guard — Express server with the dual-rail x402 paywall.
 *
 * Paid routes return the purchased artifact directly in the 200 response body.
 * Buyers pay in USDC on Base (EVM) or on Solana; the 402 challenge advertises
 * both rails and the client picks.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  facilitatorUrl,
  paywall,
  rails,
  solanaCheckoutRouter,
  usingSuiteDefaultPayTo,
  type RoutePrices,
} from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import {
  ACTIVITY_PROFILES,
  BadRequestError,
  decision,
  forecast,
  UPSTREAMS,
  UpstreamError,
  type Thresholds,
} from "./service.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

/** Paid routes. Anything not listed here is free. */
const ROUTES: RoutePrices = {
  "GET /forecast": {
    price: "$0.001",
    description:
      "Hourly weather forecast for a point and window — temperature, precipitation, wind, gusts, cloud, visibility, conditions — plus any active NWS alerts.",
    outputSchema: ROUTE_SCHEMAS["GET /forecast"],
  },
  "POST /decision": {
    price: "$0.002",
    description:
      "Go / no-go / risky verdict for a plan at a point and time window, with the threshold breaches that produced it and alternative windows that would clear the same bar.",
    outputSchema: ROUTE_SCHEMAS["POST /decision"],
  },
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

// Dual-rail x402 paywall: USDC on Base or Solana.
app.use(paywall(ROUTES, { service: "x402-weather-guard" }));

// Optional: browser (Phantom) Solana checkout helper. No-op when the modal
// package is not installed — agent clients never need it.
const checkoutRouter = await solanaCheckoutRouter();
if (checkoutRouter) app.use("/api/x402-checkout", checkoutRouter);

// Discovery manifest — registered before express.static so it keeps an explicit
// application/json content type (the file has no extension).
app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").sendFile(join(publicDir, ".well-known", "x402"));
});

// Agent-facing contract and machine spec, served from the repo root.
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(join(root, "skill.md"));
});
app.get("/openapi.json", (_req, res) => {
  res.type("application/json").sendFile(join(root, "openapi.json"));
});

// Static site. `index: false` keeps `/` on the JSON handler below — the landing
// page is served from there only when the caller actually asked for HTML.
app.use(express.static(publicDir, { index: false }));

// Free: service info. Browsers and crawlers (Accept: text/html) get the landing
// page with the origin's title/description/favicon metadata; agents and curl get
// the JSON contract.
app.get("/", (req, res) => {
  if (req.accepts(["json", "html"]) === "html") {
    res.sendFile(join(publicDir, "index.html"));
    return;
  }
  res.json({
    name: "x402-weather-guard",
    description:
      "Go/no-go weather decisions for plans — forecasts and verdicts from Open-Meteo/NWS, keyless and live",
    payment: {
      protocol: "x402",
      note: "Pay in USDC on Base or Solana — your client picks the rail.",
      facilitator: facilitatorUrl(),
      rails: rails(),
    },
    backend: {
      live: true,
      keyless: true,
      upstreams: UPSTREAMS,
      note: "Open-Meteo covers the globe and is the forecast of record. NWS supplies active watches and warnings inside US jurisdictions; elsewhere the alert set is empty and alertStatus says so.",
    },
    activityProfiles: Object.keys(ACTIVITY_PROFILES),
    routes: {
      "GET /forecast": {
        price: "$0.001",
        params: "lat, lon (required); hours (1-168, default 24); start (ISO-8601, default now)",
        returns: "hourly forecast for the window + active NWS alerts",
      },
      "POST /decision": {
        price: "$0.002",
        params:
          "JSON body { lat, lon, start?, end?, activity?, thresholds?, lookaheadHours? }",
        returns: "verdict (go | risky | no-go), reasoning, worst hour, alerts, alternative windows",
      },
      "GET /health": { price: "free" },
      "GET /.well-known/x402": { price: "free" },
      "GET /skill.md": { price: "free" },
      "GET /openapi.json": { price: "free" },
    },
    docs: "https://nirholas.github.io/x402-weather-guard/",
    skill: "https://github.com/nirholas/x402-weather-guard/blob/main/skill.md",
  });
});

// Free: health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Free: the built-in activity threshold profiles, so a caller can see exactly
// what bar a verdict was measured against before paying for one.
app.get("/profiles", (_req, res) => {
  res.json({
    profiles: ACTIVITY_PROFILES,
    note: "Pass `activity` to pick a profile, and `thresholds` to override any individual field.",
  });
});

/** Map a service error onto an honest HTTP status. Nothing settles on 4xx/5xx. */
function sendError(res: express.Response, err: unknown): void {
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof UpstreamError) {
    res.status(502).json({ error: "upstream_error", message: err.message });
    return;
  }
  res.status(502).json({
    error: "upstream_error",
    message: err instanceof Error ? err.message : "Upstream request failed",
  });
}

// Paid: $0.001 — hourly forecast. Artifact returned in this response body.
app.get("/forecast", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const hoursRaw = req.query.hours;
  const hours = hoursRaw == null ? 24 : Number(hoursRaw);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    res.status(400).json({
      error: "invalid_hours",
      message: "Query param 'hours' must be a number between 1 and 168.",
    });
    return;
  }
  try {
    res.json(
      await forecast(lat, lon, {
        hours,
        start: req.query.start ? String(req.query.start) : undefined,
      }),
    );
  } catch (err) {
    sendError(res, err);
  }
});

// Paid: $0.002 — go/no-go verdict. Artifact returned in this response body.
app.post("/decision", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const thresholds =
    body.thresholds && typeof body.thresholds === "object"
      ? (body.thresholds as Partial<Thresholds>)
      : undefined;
  try {
    res.json(
      await decision({
        lat,
        lon,
        start: body.start ? String(body.start) : undefined,
        end: body.end ? String(body.end) : undefined,
        activity: body.activity ? String(body.activity) : undefined,
        thresholds,
        lookaheadHours: body.lookaheadHours != null ? Number(body.lookaheadHours) : undefined,
      }),
    );
  } catch (err) {
    sendError(res, err);
  }
});

// Unknown route.
app.use((_req, res) => {
  res
    .status(404)
    .json({ error: "not_found", docs: "https://nirholas.github.io/x402-weather-guard/" });
});

const port = Number(process.env.PORT ?? 4024);
app.listen(port, () => {
  const pkg = require("../package.json") as { version: string };
  console.log(`x402-weather-guard v${pkg.version} listening on :${port}`);
  console.log("  payment rails:");
  for (const rail of rails()) {
    console.log(
      `    ${rail.rail === "evm" ? "EVM   " : "Solana"}  ${rail.network.padEnd(14)} ${rail.asset} → ${rail.payTo}`,
    );
  }
  console.log(`  facilitator: ${facilitatorUrl()}`);
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note:        using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log(`  backend:     ${UPSTREAMS.join(", ")} (keyless, live)`);
  console.log(`  profiles:    ${Object.keys(ACTIVITY_PROFILES).join(", ")}`);
  console.log("  paid routes:");
  for (const [route, spec] of Object.entries(ROUTES)) {
    console.log(`    ${route.padEnd(28)} ${typeof spec === "string" ? spec : spec.price}`);
  }
  console.log("  free routes: GET /, GET /health, GET /profiles, GET /.well-known/x402, GET /skill.md");
});
