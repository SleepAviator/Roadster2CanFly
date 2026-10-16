import test from "node:test";
import { initializePhysics } from "../src/simulation.js";
import {
  assertCoverage,
  effectCases,
  neutralCases,
  runFlight,
  checkEffect,
  checkNeutral,
} from "../scripts/audit-parameters.mjs";

await initializePhysics();
for (const mode of ["ramp", "kickflip"]) {
  const baseline = runFlight(mode);
  test(`${mode}: sensitivity cases cover every exposed physics setting`, () =>
    assertCoverage(mode));
  for (const item of effectCases(mode)) {
    test(`${mode}: ${item.key} affects integrated motion or landing forces`, () => {
      const before = Object.keys(item.before).length
        ? runFlight(mode, item.before)
        : baseline;
      checkEffect(before, runFlight(mode, item.after));
    });
  }
  for (const item of neutralCases(mode)) {
    test(`${mode}: expected unchanged range — ${item.key}`, () => {
      const before = Object.keys(item.before).length
        ? runFlight(mode, item.before)
        : baseline;
      checkNeutral(before, runFlight(mode, item.after));
    });
  }
}
