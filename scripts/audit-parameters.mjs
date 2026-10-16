import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULTS,
  NOZZLES,
  PARAM_GROUPS,
  parametersFor,
} from "../src/config.js";
import {
  FlightSimulation,
  initializePhysics,
  STEP,
} from "../src/simulation.js";

const changes = {
  speed: 15,
  height: 10,
  exitAngle: 115,
  flightTime: 3.5,
  rotationTime: 1,
  exhaustSpeed: 400,
  massFlow: 90,
  tankPressure: 100,
  tankVolume: 200,
  mass: 2200,
  thrust: 15,
  torque: 2,
  cgHeight: 0.25,
  stiffness: 20,
  damping: 1,
  travel: 0.1,
  friction: 0.15,
  dragArea: 2,
  wind: 15,
  attitudeAssist: false,
  landingAssist: false,
  autoThrottle: true,
};
const nozzleChanges = {
  foreAngle: 20,
  sideAngle: 20,
  start: 0.5,
  duration: 1,
  throttle: 25,
  enabled: false,
  assisted: false,
};

function nozzleOverride(mode, index, settings) {
  const { nozzles } = parametersFor(mode);
  Object.assign(nozzles[index], settings);
  return { nozzles };
}

export function effectCases(mode) {
  return [
    ...Object.entries(changes)
      .filter(([key]) => key !== "exitAngle" || mode === "ramp")
      .map(([key, value]) => ({
        key,
        // At nominal hardware the programme and auto throttle intentionally agree.
        before: key === "autoThrottle" ? { massFlow: 90 } : {},
        after: {
          ...(key === "autoThrottle" ? { massFlow: 90 } : {}),
          [key]: value,
        },
        change: `${DEFAULTS[mode][key]} → ${value}${key === "autoThrottle" ? " (at 90 kg/s)" : ""}`,
      })),
    ...NOZZLES.flatMap((nozzle, index) =>
      Object.entries(nozzleChanges).map(([key, value]) => ({
        key: `${nozzle.id}.${key}`,
        before: {},
        after: nozzleOverride(mode, index, { [key]: value }),
        change: `${DEFAULTS[mode].nozzles[index][key]} → ${value}`,
      })),
    ),
  ];
}

export function neutralCases(mode) {
  return [
    {
      key: "Tank pressure with ample reserve",
      before: {},
      after: { tankPressure: 500 },
      change: "350 → 500 bar g",
    },
    {
      key: "Tank volume with ample reserve",
      before: {},
      after: { tankVolume: 1200 },
      change: "800 → 1200 L",
    },
    {
      key: "Exhaust limits above expansion cap",
      before: { exhaustSpeed: 800 },
      after: { exhaustSpeed: 1000 },
      change: "800 → 1000 m/s",
    },
    {
      key: "Unused lift request ceiling",
      before: {},
      after: { thrust: 80 },
      change: "42 → 80 kN",
    },
    {
      key: "Unused torque request ceiling",
      before: {},
      after: { torque: 50 },
      change: "24 → 50 kN·m",
    },
    {
      key: "Travel beyond needed compression",
      before: {},
      after: { travel: 0.4 },
      change: "0.26 → 0.40 m",
    },
    {
      key: "Front-left valve with spare capacity",
      before: {},
      after: nozzleOverride(mode, 0, { throttle: 90 }),
      change: "100 → 90%",
    },
    {
      key: "Front-left window after firing ends",
      before: {},
      after: nozzleOverride(mode, 0, { duration: 12 }),
      change: "8 → 12 s",
    },
    {
      key: "Wind when drag area is zero",
      before: { dragArea: 0, wind: -15 },
      after: { dragArea: 0, wind: 15 },
      change: "−15 → +15 m/s; CdA = 0",
    },
    {
      key: "Direction of disabled front-left nozzle",
      before: nozzleOverride(mode, 0, { enabled: false }),
      after: nozzleOverride(mode, 0, { enabled: false, foreAngle: 45 }),
      change: "0 → 45°; nozzle disabled",
    },
  ];
}

export function assertCoverage(mode) {
  const expected = [
    ...PARAM_GROUPS.flatMap((group) => group.fields)
      .filter((field) => !field.mode || field.mode === mode)
      .map((field) => field.key),
    ...Object.keys(DEFAULTS[mode]).filter(
      (key) => typeof DEFAULTS[mode][key] === "boolean",
    ),
    ...NOZZLES.flatMap((nozzle, index) =>
      Object.keys(DEFAULTS[mode].nozzles[index])
        .filter((key) => key !== "id")
        .map((key) => `${nozzle.id}.${key}`),
    ),
  ];
  assert.deepEqual(
    effectCases(mode)
      .map((item) => item.key)
      .sort(),
    expected.sort(),
    "Every exposed physics setting needs an effect case",
  );
}

export function runFlight(mode, overrides = {}) {
  const simulation = new FlightSimulation(mode, overrides);
  const motion = [];
  let flightStep = 0;
  try {
    simulation.start();
    for (let step = 0; step < 45 / STEP && simulation.running; step++) {
      const state = simulation.step();
      if (simulation.flightStart !== null && flightStep++ % 4 === 0) {
        const { position: p, velocity: v, rotation: q } = state;
        const row = [
          p.x,
          p.y,
          p.z,
          v.x,
          v.y,
          v.z,
          q.x,
          q.y,
          q.z,
          q.w,
          state.loadG,
        ];
        assert.ok(row.every(Number.isFinite), "Motion must stay finite");
        motion.push(row);
      }
    }
    assert.equal(simulation.running, false, "Run must terminate within 45 s");
    assert.ok(motion.length > 0, "Run must reach free-flight release");
    return {
      motion,
      phase: simulation.phase,
      reason: simulation.reason,
      duration: simulation.time - simulation.flightStart,
      metrics: { ...simulation.metrics },
    };
  } finally {
    simulation.dispose();
  }
}

export function compareMotion(before, after) {
  const delta = { position: 0, velocity: 0, angle: 0, wheelSupport: 0 };
  for (
    let i = 0;
    i < Math.min(before.motion.length, after.motion.length);
    i++
  ) {
    const a = before.motion[i],
      b = after.motion[i];
    delta.position = Math.max(
      delta.position,
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    );
    delta.velocity = Math.max(
      delta.velocity,
      Math.hypot(a[3] - b[3], a[4] - b[4], a[5] - b[5]),
    );
    const qa = a.slice(6, 10),
      qb = b.slice(6, 10);
    const cosine = Math.min(
      1,
      Math.abs(qa.reduce((sum, value, j) => sum + value * qb[j], 0)) /
        (Math.hypot(...qa) * Math.hypot(...qb)),
    );
    delta.angle = Math.max(
      delta.angle,
      (2 * Math.acos(cosine) * 180) / Math.PI,
    );
    delta.wheelSupport = Math.max(delta.wheelSupport, Math.abs(a[10] - b[10]));
  }
  return delta;
}

export function checkEffect(before, after) {
  const delta = compareMotion(before, after);
  assert.ok(
    delta.position > 0.001 ||
      delta.velocity > 0.001 ||
      delta.angle > 0.1 ||
      delta.wheelSupport > 0.01,
    `No measurable effect on motion or landing forces: ${JSON.stringify(delta)}`,
  );
  return delta;
}

export function checkNeutral(before, after) {
  assert.deepEqual(
    after.motion,
    before.motion,
    "Expected no motion change in this inactive range",
  );
  assert.deepEqual(after.metrics, before.metrics);
  assert.equal(after.phase, before.phase);
  assert.equal(after.duration, before.duration);
}

async function writeReport() {
  await initializePhysics();
  const lines = [
    "# Parameter effect audit",
    "",
    `Generated by \`npm run audit:parameters\` on ${new Date().toISOString().slice(0, 10)} with Node ${process.versions.node}.`,
    "",
    "All **99 exposed physics settings across the two scenes** have a case that changes integrated motion or wheel forces: 50 ramp settings and 49 kickflip settings. This includes all seven settings on each of the four nozzles. The ramp exit angle is only exposed in the ramp scene. Coverage is checked against the parameter schema, so a newly added setting without an effect case fails the audit.",
    "",
    "Each case changes one setting from the successful preset, except the thrust-mode comparison, which holds flow at 90 kg/s to make controller compensation visible. Comparisons use actual rigid-body position, velocity, orientation and wheel support, not available thrust or tank readouts. Motion is sampled at 60 Hz, aligned by fixed step since free-flight release; maxima cover the common portion before either run terminates. A passing effect exceeds 1 mm in position, 1 mm/s in velocity, 0.1° in orientation, or 0.01 times vehicle weight in wheel support. A changed success/failure label alone does not pass.",
    "",
    "These are sensitivity checks of this reduced model, not physical validation or proof that every increment changes every run. The driven approach/ramp are prescribed. Camera and playback controls only affect presentation; setup/export controls store or retrieve parameters and telemetry.",
    "",
    "## Conditions that can leave a flight unchanged",
    "",
    "Tank pressure above the 100 bar absolute regulator and tank volume add reserve. With the same initial loaded mass, extra reserve has no motion effect unless pressure falls enough to restrict delivery. Exhaust limits above ideal expansion speed are clipped. Lift, torque and assisted nozzle valve settings are ceilings; unused capacity adds no force. Travel affects the bump stop only when compression reaches it. Extra firing duration after demand ends, or the direction of a disabled nozzle, adds no force. Wind requires nonzero drag. Auto throttle can compensate for hardware changes; attitude assistance can correct rotation errors. The tests below deliberately check both active and inactive conditions.",
    "",
  ];
  for (const mode of ["ramp", "kickflip"]) {
    assertCoverage(mode);
    const baseline = runFlight(mode);
    assert.equal(baseline.phase, "complete");
    lines.push(
      `## ${mode === "ramp" ? "Ramp" : "Kickflip"}`,
      "",
      `Successful default: peak rise **${baseline.metrics.peakHeight.toFixed(3)} m**, touchdown **${baseline.metrics.touchdownSpeed.toFixed(3)} m/s**, peak wheel support **${baseline.metrics.peakLoadG.toFixed(3)} × weight**.`,
      "",
      "| Setting | Change | Max Δposition (m) | Max Δvelocity (m/s) | Max Δangle (°) | Max Δwheel support (× weight) | Result |",
      "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    );
    for (const item of effectCases(mode)) {
      const before = Object.keys(item.before).length
        ? runFlight(mode, item.before)
        : baseline;
      const after = runFlight(mode, item.after);
      const delta = checkEffect(before, after);
      lines.push(
        `| \`${item.key}\` | ${item.change} | ${delta.position.toFixed(3)} | ${delta.velocity.toFixed(3)} | ${delta.angle.toFixed(3)} | ${delta.wheelSupport.toFixed(3)} | ${after.phase} |`,
      );
    }
    lines.push(
      "",
      "Expected unchanged cases (motion samples and landing metrics must match exactly on this runtime):",
      "",
      "| Condition | Change | Result |",
      "| --- | --- | --- |",
    );
    for (const item of neutralCases(mode)) {
      const before = Object.keys(item.before).length
        ? runFlight(mode, item.before)
        : baseline;
      checkNeutral(before, runFlight(mode, item.after));
      lines.push(
        `| ${item.key} | ${item.change} | Identical motion and landing metrics |`,
      );
    }
    lines.push("");
    console.log(
      `${mode}: ${effectCases(mode).length} effect checks and ${neutralCases(mode).length} expected unchanged checks passed`,
    );
  }
  await writeFile(
    new URL("../docs/PARAMETER_AUDIT.md", import.meta.url),
    lines.join("\n"),
  );
  console.log("Wrote docs/PARAMETER_AUDIT.md");
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await writeReport();
