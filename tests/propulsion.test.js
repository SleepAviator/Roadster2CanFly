import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  AIR,
  NOZZLES,
  initialGasMass,
  parametersFor,
  readSetup,
} from "../src/config.js";
import { airSupply, nozzleForces } from "../src/propulsion.js";

const zero = () => new Vector3();
const close = (a, b, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);
function singleManual(overrides = {}) {
  const p = parametersFor("kickflip");
  p.nozzles = p.nozzles.map((n, i) => ({
    ...n,
    assisted: false,
    enabled: i === 0,
    ...overrides,
  }));
  return p;
}

test("mass-flow and speed limits determine available thrust", () => {
  const p = parametersFor("ramp");
  const initial = airSupply(p);
  close(initial.maxThrust, 60000);
  close(
    airSupply({ ...p, exhaustSpeed: 250 }).maxThrust,
    initial.maxThrust / 2,
  );
  close(airSupply({ ...p, massFlow: 60 }).maxThrust, initial.maxThrust / 2);
  assert.ok(airSupply({ ...p, exhaustSpeed: 1000 }).exhaustSpeed < 1000);
});

test("pressure limits flow below regulator pressure and approaches zero at ambient", () => {
  const p = parametersFor("ramp");
  const high = airSupply(p);
  const low = airSupply({ ...p, tankPressure: 25 });
  const nearEmpty = airSupply({ ...p, tankPressure: 0.2 });
  assert.ok(low.maxFlow < high.maxFlow / 3);
  assert.ok(nearEmpty.maxFlow > 0 && nearEmpty.maxFlow < low.maxFlow);
  assert.ok(nearEmpty.exhaustSpeed < low.exhaustSpeed);
  close(airSupply({ ...p, tankPressure: 0 }).maxThrust, 0);
});

test("tank pressure and volume set usable air, with ambient residual retained", () => {
  const p = parametersFor("ramp");
  const initial = airSupply(p);
  close(
    initial.usableMass,
    (p.tankPressure * 1e5 * p.tankVolume) /
      1000 /
      (AIR.gasConstant * AIR.temperature),
  );
  close(
    airSupply({ ...p, tankVolume: p.tankVolume / 2 }).usableMass,
    initial.usableMass / 2,
  );
  const emptied = airSupply(p, initial.usableMass + 10);
  close(emptied.pressureBar, 0);
  close(emptied.usableMass, 0);
  assert.ok(emptied.gasMass > 0);
  assert.ok(initialGasMass(p) > initial.usableMass);
});

test("four assisted point forces reproduce an attainable force and torque request", () => {
  const p = parametersFor("ramp", { cgHeight: 0.1 });
  const force = new Vector3(1500, 20000, -500);
  const torque = new Vector3(1000, 2000, -1500);
  const result = nozzleForces(p, airSupply(p), 0, force, torque, 1 / 240);
  assert.ok(result.force.distanceTo(force) < 1e-7);
  assert.ok(result.torque.distanceTo(torque) < 1e-7);
  for (const jet of result.jets)
    close(jet.thrust, jet.massFlow * jet.exhaustSpeed);
});

test("fixed nozzle exhaust direction reverses thrust and creates a mounting-point moment", () => {
  const p = singleManual({ foreAngle: 90, throttle: 40 });
  const result = nozzleForces(p, airSupply(p), 0, zero(), zero(), 1 / 240);
  close(result.force.x, -6000);
  close(result.force.y, 0);
  close(result.force.z, 0);
  close(result.torque.y, -3840);
  close(result.torque.z, -2220);
  close(result.jets[0].massFlow, 12);
  assert.ok(result.jets.slice(1).every((n) => n.thrust === 0));
  const side = singleManual({ sideAngle: 90 });
  close(
    nozzleForces(side, airSupply(side), 0, zero(), zero(), 1 / 240).force.z,
    -15000,
  );
});

test("each nozzle's enable, valve limit, start and duration gate its output", () => {
  const p = singleManual({ start: 1, duration: 0.5, throttle: 25 });
  const sample = (t) =>
    nozzleForces(p, airSupply(p), t, zero(), zero(), 1 / 240);
  close(sample(0.999).massFlow, 0);
  close(sample(1).massFlow, 7.5);
  close(sample(1.499).massFlow, 7.5);
  close(sample(1.5).massFlow, 0);
  p.nozzles[0].enabled = false;
  close(sample(1.2).massFlow, 0);
  p.nozzles[0].enabled = true;
  p.nozzles[0].duration = 0;
  close(sample(1).massFlow, 0);
});

test("the last gas step cannot expel more mass than remains", () => {
  const p = singleManual();
  const supply = { ...airSupply(p), usableMass: 0.001 };
  const output = nozzleForces(p, supply, 0, zero(), zero(), 0.1);
  close(output.massFlow * 0.1, supply.usableMass);
  close(output.jets[0].thrust, output.massFlow * supply.exhaustSpeed);
});

test("setups preserve each nozzle independently without shared default mutation", () => {
  const p = parametersFor("ramp");
  p.nozzles[0].foreAngle = 35;
  p.nozzles[1].assisted = false;
  p.nozzles[2].start = 1.25;
  p.nozzles[3].duration = 2.5;
  const loaded = readSetup(
    JSON.parse(JSON.stringify({ version: 2, mode: "ramp", parameters: p })),
  );
  assert.deepEqual(loaded.parameters, p);
  assert.equal(parametersFor("ramp").nozzles[0].foreAngle, 0);
  const legacy = readSetup({
    version: 1,
    mode: "ramp",
    parameters: { gasBudget: 6 },
  });
  close(airSupply(legacy.parameters).usableMass, (6 * 42000) / 500);
  assert.equal(legacy.migrated, true);
  close(
    airSupply(
      readSetup({ version: 1, mode: "ramp", parameters: { gasBudget: 0 } })
        .parameters,
    ).maxThrust,
    0,
  );
});

test("invalid tank and nozzle setups fail explicitly", () => {
  assert.throws(
    () => parametersFor("ramp", { tankPressure: NaN }),
    /tankPressure must be between/,
  );
  assert.throws(
    () =>
      parametersFor("ramp", { tankVolume: 2000, tankPressure: 700, mass: 900 }),
    /Tank air mass/,
  );
  assert.throws(
    () => parametersFor("ramp", { nozzles: [] }),
    /four nozzle IDs/,
  );
  const p = parametersFor("ramp");
  p.nozzles[0].id = NOZZLES[1].id;
  assert.throws(() => parametersFor("ramp", p), /duplicate nozzle ID/);
  p.nozzles[0].id = NOZZLES[0].id;
  p.nozzles[0].foreAngle = NaN;
  assert.throws(() => parametersFor("ramp", p), /foreAngle must be between/);
  p.nozzles[0].foreAngle = 0;
  p.nozzles[0].extraForce = 10;
  assert.throws(() => parametersFor("ramp", p), /Unknown nozzle parameter/);
  delete p.nozzles[0].extraForce;
  p.nozzles[0].enabled = "true";
  assert.throws(() => parametersFor("ramp", p), /true or false/);
  assert.throws(() => readSetup({ version: 3 }), /Unsupported setup version/);
  assert.throws(
    () => readSetup({ version: 1, mode: "ramp", parameters: 5 }),
    /Parameters must be an object/,
  );
});
