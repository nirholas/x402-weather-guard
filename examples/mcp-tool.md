# Exposing x402-weather-guard as an MCP tool

[MCP](https://modelcontextprotocol.io) lets Claude (and other MCP clients) call
this service directly. The wrapper below holds the wallet, pays the x402
invoice, and hands the artifact straight back to the model.

## Minimal server

```ts
// mcp-x402-weather-guard.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSigner, wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = process.env.WEATHER_GUARD_URL ?? "http://localhost:4024";

const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const payFetch = wrapFetchWithPayment(fetch, signer);

const server = new McpServer({ name: "x402-weather-guard", version: "0.1.0" });

server.tool(
  "hourly_forecast",
  "Hourly forecast for a point and window, plus active alerts",
  {
    lat: z.number().describe("Latitude, -90…90."),
    lon: z.number().describe("Longitude, -180…180."),
    hours: z.number().optional().describe("Length of the window in hours, 1–168. Default 24."),
    start: z.string().optional().describe("ISO-8601 start of the window. Default: now."),
  },
  async (args) => {
    const url = new URL(`${BASE_URL}/forecast`);
    url.searchParams.set("lat", String(args.lat));
    url.searchParams.set("lon", String(args.lon));
    if (args.hours) url.searchParams.set("hours", String(args.hours));
    if (args.start) url.searchParams.set("start", args.start);
    const res = await payFetch(url);
    if (!res.ok) throw new Error(`GET /forecast → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

server.tool(
  "weather_decision",
  "Go / risky / no-go verdict for a plan, with reasoning and alternative windows",
  {
    lat: z.number().describe("Latitude, -90…90."),
    lon: z.number().describe("Longitude, -180…180."),
    start: z.string().optional().describe("ISO-8601 start of the plan. Default: now."),
    end: z.string().optional().describe("ISO-8601 end of the plan. Default: three hours after `start`. Max 72 hours long."),
    activity: z.string().optional().describe("Which threshold profile to judge against. Default `outdoor-event`. See `GET /profiles` (free) for the exact numbers."),
    thresholds: z.string().optional().describe("Override any individual threshold from the chosen profile — `maxPrecipProbabilityPct`, `maxPrecipMm`, `maxWindKph`, `maxGustKph`, `minTempC`, `maxTempC`, `minVisibilityM`."),
    lookaheadHours: z.number().optional().describe("How far past the window to search for alternatives, up to 160. Default 48."),
  },
  async (args) => {
    const url = `${BASE_URL}/decision`;
    const res = await payFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`POST /decision → ${res.status}`);
    return { content: [{ type: "text", text: JSON.stringify(await res.json(), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

## Wire it into Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-weather-guard": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-x402-weather-guard.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedTestKey",
        "WEATHER_GUARD_URL": "http://localhost:4024"
      }
    }
  }
}
```

## Spending caps

Each GET /forecast call costs $0.001. Wrap `payFetch` with a
budget so a runaway loop cannot drain the wallet:

```ts
let spentMicros = 0;
const CAP_MICROS = 1_000_000; // $1.00

const cappedFetch: typeof fetch = async (input, init) => {
  if (spentMicros >= CAP_MICROS) throw new Error("x402 spend cap reached");
  const res = await payFetch(input, init);
  const receipt = res.headers.get("X-PAYMENT-RESPONSE");
  if (receipt) {
    const { amount } = JSON.parse(Buffer.from(receipt, "base64").toString());
    spentMicros += Number(amount ?? 0);
  }
  return res;
};
```

## Notes

- The tool descriptions above come from [`skill.md`](../skill.md) — keep them in
  sync so the model knows exactly what it is buying.
- Paying on Solana instead? Swap `x402-fetch` for a Solana x402 client; the 402
  challenge already advertises the `solana` rail, so nothing on this
  server changes.
- Discovery for autonomous agents: [`/.well-known/x402`](../public/.well-known/x402).
