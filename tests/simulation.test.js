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
      assert.ok(
        Object.values(row).every(
          (value) => typeof value === "string" || Number.isFinite(value),
        ),
      );
      assert.ok(row.thrust >= 0 && row.thrust <= sim.nominalThrust + 0.01);
      assert.ok(row.massFlow >= 0 && row.massFlow <= sim.p.massFlow + 0.01);
      assert.ok(Math.abs(row.thrust - row.massFlow * row.exhaustSpeed) < 0.01);
      assert.ok(
        row.tankPressureBarGauge >= 0 &&
          row.tankPressureBarGauge <= sim.p.tankPressure,
      );
      assert.ok(
        row.vehicleMass <= sim.p.mass &&
          row.vehicleMass >= sim.p.mass - sim.trace[0].usableAirMass,
      );
      assert.ok(row.gasRemaining >= 0 && row.gasRemaining <= 1);
    }
    sim.dispose();
  });

  test(`${mode}: zero mass flow removes lift and rotation and cannot succeed`, () => {
    const sim = run(mode, { massFlow: 0 });
    assert.equal(sim.phase, "crashed");
    assert.ok(sim.trace.every((row) => row.thrust === 0));
    sim.dispose();
  });

  test(`${mode}: changing spare airflow changes the flight with the default lift programme`, () => {
    const lower = run(mode, { massFlow: 90 });
    const higher = run(mode, { massFlow: 150 });
    assert.equal(lower.p.autoThrottle, false);
    assert.ok(higher.metrics.peakHeight - lower.metrics.peakHeight > 2);
    assert.ok(
      Math.max(...higher.trace.map((r) => r.thrust)) >
        Math.max(...lower.trace.map((r) => r.thrust)) * 1.2,
    );
    lower.dispose();
    higher.dispose();
  });

  test(`${mode}: explicit auto throttle can compensate for additional airflow capacity`, () => {
    const lower = run(mode, { massFlow: 90, autoThrottle: true });
    const higher = run(mode, { massFlow: 150, autoThrottle: true });
    assert.equal(lower.phase, "complete");
    assert.equal(higher.phase, "complete");
    assert.equal(lower.metrics.peakHeight, higher.metrics.peakHeight);
    assert.equal(lower.metrics.touchdownSpeed, higher.metrics.touchdownSpeed);
    lower.dispose();
    higher.dispose();
  });
}

test("exhaust-speed changes affect the default kickflip flight instead of being throttled away", () => {
  const lower = run("kickflip", { exhaustSpeed: 400 });
  const higher = run("kickflip", { exhaustSpeed: 600 });
  assert.ok(higher.metrics.peakHeight - lower.metrics.peakHeight > 5);
  lower.dispose();
  higher.dispose();
});

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

test("a tank at ambient pressure removes all actuator forces", () => {
  const sim = run("ramp", { tankPressure: 0 });
  assert.equal(sim.phase, "crashed");
  assert.ok(sim.trace.every((row) => row.thrust === 0));
  assert.equal(sim.gasUsed, 0);
  sim.dispose();
});

test("zero exhaust speed removes all thrust", () => {
  const sim = run("kickflip", { exhaustSpeed: 0 });
  assert.equal(sim.phase, "crashed");
  assert.ok(sim.trace.every((row) => row.thrust === 0 && row.massFlow === 0));
  sim.dispose();
});

test("delaying all firing windows until after the jump prevents success", () => {
  const p = parametersFor("kickflip");
  const sim = run("kickflip", {
    nozzles: p.nozzles.map((n) => ({ ...n, start: 10 })),
  });
  assert.equal(sim.phase, "crashed");
  assert.ok(
    sim.trace
      .filter((r) => r.time < sim.flightStart + 10)
      .every((r) => r.thrust === 0),
  );
  sim.dispose();
});

test("an individual nozzle direction changes the assisted trajectory", () => {
  const p = parametersFor("ramp");
  p.nozzles[0].foreAngle = 90;
  const sim = run("ramp", p);
  assert.equal(sim.phase, "crashed");
  assert.ok(sim.trace.some((r) => Math.abs(r.forceX) > 100));
  sim.dispose();
});

test("tank depletion conserves air mass and reduces rigid-body mass", () => {
  const sim = run("ramp");
  const first = sim.trace[0],
    last = sim.trace.at(-1);
  assert.ok(sim.gasUsed > 100);
  assert.ok(
    Math.abs(first.usableAirMass - last.usableAirMass - sim.gasUsed) < 1e-8,
  );
  assert.ok(Math.abs(sim.body.mass() - (sim.p.mass - sim.gasUsed)) < 0.001);
  for (let i = 1; i < sim.trace.length; i++) {
    assert.ok(
      sim.trace[i].tankPressureBarGauge <=
        sim.trace[i - 1].tankPressureBarGauge + 1e-8,
    );
    assert.ok(sim.trace[i].vehicleMass <= sim.trace[i - 1].vehicleMass + 1e-8);
  }
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
