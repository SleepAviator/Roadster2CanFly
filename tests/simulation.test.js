import test from "node:test";
import assert from "node:assert/strict";
import {
  FlightSimulation,
  initializePhysics,
  STEP,
} from "../src/simulation.js";
import { parametersFor } from "../src/config.js";

await initializePhysics();
function run(mode, parameters = {}) {
  const sim = new FlightSimulation(mode, parameters);
  sim.start();
  for (let i = 0; i < 30 / STEP && sim.running; i++) sim.step();
  return sim;
}

for (const mode of ["ramp", "kickflip"]) {
  test(`${mode}: default preset completes a stable landing`, () => {
    const sim = run(mode);
    const state = sim.snapshot();
    assert.equal(state.phase, "complete", state.reason);
    assert.ok(state.metrics.touchdownSpeed < 4);
    assert.ok(state.metrics.touchdownTilt < 22);
    assert.ok(state.wheelContacts >= 3);
    assert.ok(Math.abs(state.velocity.x) < 0.8);
    assert.ok(state.gasRemaining > 0);
    if (mode === "kickflip") {
      assert.ok(state.metrics.rollTurns > 0.95);
      assert.ok(state.position.x > 22);
    }
    for (const row of sim.trace) {
      assert.ok(Number.isFinite(row.y));
      assert.ok(row.thrust >= 0 && row.thrust <= sim.p.thrust * 1000 + 0.01);
      assert.ok(row.gasRemaining >= 0 && row.gasRemaining <= 1);
    }
    sim.dispose();
  });

  test(`${mode}: zero thrust cannot be reported as a successful demo`, () => {
    const sim = run(mode, { thrust: 0 });
    assert.equal(sim.phase, "crashed");
    assert.ok(sim.trace.every((row) => row.thrust === 0));
    sim.dispose();
  });
}

test("landing without the kickflip does not complete the kickflip stunt", () => {
  const sim = run("kickflip", { torque: 0 });
  assert.equal(sim.phase, "crashed");
  assert.match(sim.reason, /kickflip was not completed/);
  sim.dispose();
});

test("insufficient lift on a heavy car produces a failed landing", () => {
  const sim = run("ramp", { mass: 3500, thrust: 10 });
  assert.equal(sim.phase, "crashed");
  assert.ok(sim.metrics.touchdownSpeed > 4);
  sim.dispose();
});

test("an exhausted gas budget removes all actuator forces", () => {
  const sim = run("ramp", { gasBudget: 0 });
  assert.equal(sim.phase, "crashed");
  assert.ok(sim.trace.every((row) => row.thrust === 0));
  assert.equal(sim.gasUsed, 0);
  sim.dispose();
});

test("unpowered airborne vertical velocity follows gravity", () => {
  const sim = new FlightSimulation("ramp", {
    landingAssist: false,
    attitudeAssist: false,
    dragArea: 0,
  });
  sim.start();
  while (sim.flightStart === null) sim.step();
  const initial = sim.snapshot();
  sim.step(60);
  const result = sim.snapshot();
  const expected = initial.velocity.y - 9.81 * 60 * STEP;
  assert.ok(
    Math.abs(result.velocity.y - expected) < 0.01,
    `${result.velocity.y} vs ${expected}`,
  );
  assert.ok(Math.abs(result.velocity.x - initial.velocity.x) < 0.01);
  sim.dispose();
});

test("replaying a configuration gives the same trajectory on this runtime", () => {
  const first = run("ramp");
  const second = run("ramp");
  assert.deepEqual(first.snapshot(), second.snapshot());
  first.dispose();
  second.dispose();
});

test("invalid or unknown parameters fail explicitly before a simulation is made", () => {
  assert.throws(() => parametersFor("missing"), /Unknown scene/);
  assert.throws(
    () => parametersFor("ramp", { mass: NaN }),
    /mass must be between/,
  );
  assert.throws(
    () => parametersFor("ramp", { mass: -100 }),
    /mass must be between/,
  );
  assert.throws(
    () => parametersFor("ramp", { hiddenForce: 5 }),
    /Unknown parameter/,
  );
  assert.throws(
    () => parametersFor("ramp", { landingAssist: "yes" }),
    /true or false/,
  );
});
