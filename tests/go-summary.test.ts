import assert from "node:assert/strict";
import { test } from "node:test";
import { goSummary } from "../src/service.js";

test("go summary claims no alerts only when the alert source answered", () => {
  assert.match(goSummary(3, "hiking", "ok (no active alerts)"), /no alerts are in effect/);
});

test("go summary says alerts were not checked when the alert lookup was unavailable", () => {
  const s = goSummary(3, "hiking", "unavailable: NWS returned HTTP 400 (point out of bounds)");
  assert.doesNotMatch(s, /no alerts are in effect/);
  assert.match(s, /alerts were not checked for this location/);
});
