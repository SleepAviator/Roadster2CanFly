export const VEHICLE = Object.freeze({
  length: 4.5,
  width: 1.95,
  bodyHeight: 0.62,
  wheelbase: 2.7,
  track: 1.65,
  wheelRadius: 0.34,
  suspensionRest: 0.42,
  mountHeight: -0.15,
});

export const WHEELS = Object.freeze([
  { x: 1.35, z: 0.825 },
  { x: 1.35, z: -0.825 },
  { x: -1.35, z: 0.825 },
  { x: -1.35, z: -0.825 },
]);

// Body axes: +X nose, +Y roof, +Z left. Positions are nozzle exit points (m).
export const NOZZLES = Object.freeze([
  Object.freeze({
    id: "front-left",
    label: "Front left",
    x: 1.25,
    y: -0.37,
    z: 0.64,
  }),
  Object.freeze({
    id: "front-right",
    label: "Front right",
    x: 1.25,
    y: -0.37,
    z: -0.64,
  }),
  Object.freeze({
    id: "rear-left",
    label: "Rear left",
    x: -1.25,
    y: -0.37,
    z: 0.64,
  }),
  Object.freeze({
    id: "rear-right",
    label: "Rear right",
    x: -1.25,
    y: -0.37,
    z: -0.64,
  }),
]);

export const AIR = Object.freeze({
  ambientPressure: 101325,
  gasConstant: 287.05,
  temperature: 293.15,
  gamma: 1.4,
  regulatorPressure: 100e5, // Pa absolute; the flow rating is specified here.
});

export const NOZZLE_FIELDS = Object.freeze([
  {
    key: "foreAngle",
    label: "Fore/aft exhaust angle",
    unit: "°",
    min: -180,
    max: 180,
    step: 1,
  },
  {
    key: "sideAngle",
    label: "Side exhaust angle",
    unit: "°",
    min: -180,
    max: 180,
    step: 1,
  },
  { key: "start", label: "Fire from", unit: "s", min: 0, max: 12, step: 0.05 },
  {
    key: "duration",
    label: "Fire for",
    unit: "s",
    min: 0,
    max: 12,
    step: 0.05,
  },
  {
    key: "throttle",
    label: "Valve limit",
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
  },
]);

const nozzleDefaults = Object.freeze(
  NOZZLES.map(({ id }) =>
    Object.freeze({
      id,
      enabled: true,
      assisted: true,
      foreAngle: 0,
      sideAngle: 0,
      start: 0,
      duration: 8,
      throttle: 100,
    }),
  ),
);

export const OBSTACLES = Object.freeze([
  {
    x: -15,
    width: 3.4,
    height: 1.45,
    depth: 4.5,
    label: "CAB",
    color: 0xd7c7ac,
  },
  {
    x: -7.5,
    width: 3.8,
    height: 1.9,
    depth: 5.7,
    label: "TRUCK",
    color: 0x9da8b0,
  },
  { x: 1, width: 5.0, height: 3.9, depth: 10, label: "SEMI", color: 0xe4e8e9 },
  {
    x: 10,
    width: 3.5,
    height: 1.65,
    depth: 4.7,
    label: "SUV",
    color: 0x5f7184,
  },
  {
    x: 17.5,
    width: 3.4,
    height: 1.45,
    depth: 4.5,
    label: "SEDAN",
    color: 0xb14b43,
  },
]);

const common = {
  mass: 1800,
  thrust: 42,
  torque: 24,
  exhaustSpeed: 500,
  massFlow: 120,
  tankPressure: 350,
  tankVolume: 800,
  nozzles: nozzleDefaults,
  stiffness: 40,
  damping: 4.5,
  travel: 0.26,
  friction: 0.9,
  dragArea: 0.65,
  wind: 0,
  cgHeight: 0,
  exitAngle: 135,
  attitudeAssist: true,
  landingAssist: true,
};

export const DEFAULTS = Object.freeze({
  ramp: Object.freeze({
    ...common,
    speed: 12,
    height: 20,
    flightTime: 5.6,
    rotationTime: 1.6,
  }),
  kickflip: Object.freeze({
    ...common,
    speed: 18,
    height: 7.5,
    flightTime: 4.2,
    rotationTime: 3.0,
  }),
});

export const PARAM_GROUPS = [
  {
    title: "Flight plan",
    fields: [
      {
        key: "speed",
        label: "Launch speed",
        unit: "m/s",
        min: 6,
        max: 30,
        step: 0.5,
      },
      {
        key: "height",
        label: "Ramp / jump height",
        unit: "m",
        min: 4,
        max: 30,
        step: 0.5,
      },
      {
        key: "exitAngle",
        label: "Ramp exit angle",
        unit: "°",
        min: 100,
        max: 180,
        step: 1,
        mode: "ramp",
      },
      {
        key: "flightTime",
        label: "Target flight time",
        unit: "s",
        min: 2,
        max: 7,
        step: 0.1,
      },
      {
        key: "rotationTime",
        label: "Rotation duration",
        unit: "s",
        min: 0.6,
        max: 5,
        step: 0.1,
      },
    ],
  },
  {
    title: "Cold-air supply",
    fields: [
      {
        key: "exhaustSpeed",
        label: "Exhaust-air speed limit",
        unit: "m/s",
        min: 0,
        max: 1000,
        step: 10,
      },
      {
        key: "massFlow",
        label: "Rated total mass flow",
        unit: "kg/s",
        min: 0,
        max: 400,
        step: 1,
      },
      {
        key: "tankPressure",
        label: "Initial tank pressure",
        unit: "bar g",
        min: 0,
        max: 700,
        step: 1,
      },
      {
        key: "tankVolume",
        label: "Tank internal volume",
        unit: "L",
        min: 10,
        max: 2000,
        step: 10,
      },
    ],
  },
  {
    title: "Vehicle & control limits",
    fields: [
      {
        key: "mass",
        label: "Initial loaded mass",
        unit: "kg",
        min: 900,
        max: 3500,
        step: 50,
      },
      {
        key: "thrust",
        label: "Lift request limit",
        unit: "kN",
        min: 0,
        max: 80,
        step: 1,
      },
      {
        key: "torque",
        label: "Attitude torque request limit",
        unit: "kN·m",
        min: 0,
        max: 50,
        step: 1,
      },
      {
        key: "cgHeight",
        label: "Center of mass offset",
        unit: "m",
        min: -0.25,
        max: 0.35,
        step: 0.01,
      },
    ],
  },
  {
    title: "Suspension & environment",
    fields: [
      {
        key: "stiffness",
        label: "Spring stiffness / wheel",
        unit: "kN/m",
        min: 15,
        max: 100,
        step: 1,
      },
      {
        key: "damping",
        label: "Damping / wheel",
        unit: "kN·s/m",
        min: 0.5,
        max: 12,
        step: 0.1,
      },
      {
        key: "travel",
        label: "Suspension compression travel",
        unit: "m",
        min: 0.1,
        max: 0.4,
        step: 0.01,
      },
      {
        key: "friction",
        label: "Ground friction",
        unit: "μ",
        min: 0.1,
        max: 1.4,
        step: 0.05,
      },
      {
        key: "dragArea",
        label: "Drag coefficient × area",
        unit: "m²",
        min: 0,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "wind",
        label: "Wind along runway",
        unit: "m/s",
        min: -15,
        max: 15,
        step: 0.5,
      },
    ],
  },
];

export const SOURCES = Object.freeze({
  event: "https://www.youtube.com/watch?v=qt5p-_tE8d0",
  ramp: "https://www.youtube.com/watch?v=7p5LxFdc-Qg",
  kickflip: "https://www.youtube.com/watch?v=r5vsHHPVhJg",
});

export function parametersFor(mode, overrides = {}) {
  if (!Object.hasOwn(DEFAULTS, mode)) throw new Error(`Unknown scene: ${mode}`);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Parameters must be an object");
  const parameters = {
    ...DEFAULTS[mode],
    nozzles: nozzleDefaults.map((n) => ({ ...n })),
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(parameters, key))
      throw new Error(`Unknown parameter: ${key}`);
    if (key === "nozzles") {
      if (!Array.isArray(value) || value.length !== NOZZLES.length)
        throw new Error(
          "nozzles must contain all four nozzle IDs exactly once",
        );
      const ids = new Set();
      for (const nozzle of value) {
        if (!nozzle || typeof nozzle !== "object" || Array.isArray(nozzle))
          throw new Error("Each nozzle must be an object");
        const index = NOZZLES.findIndex((n) => n.id === nozzle.id);
        if (index < 0 || ids.has(nozzle.id))
          throw new Error(`Unknown or duplicate nozzle ID: ${nozzle.id}`);
        ids.add(nozzle.id);
        for (const [setting, input] of Object.entries(nozzle)) {
          if (setting === "id") continue;
          if (setting === "enabled" || setting === "assisted") {
            if (typeof input !== "boolean")
              throw new Error(`${nozzle.id}.${setting} must be true or false`);
          } else {
            const field = NOZZLE_FIELDS.find((f) => f.key === setting);
            if (!field) throw new Error(`Unknown nozzle parameter: ${setting}`);
            validateNumber(`${nozzle.id}.${setting}`, input, field);
          }
          parameters.nozzles[index][setting] = input;
        }
      }
      continue;
    }
    if (typeof parameters[key] === "boolean") {
      if (typeof value !== "boolean")
        throw new Error(`${key} must be true or false`);
    } else {
      const field = PARAM_GROUPS.flatMap((group) => group.fields).find(
        (item) => item.key === key,
      );
      validateNumber(key, value, field);
    }
    parameters[key] = value;
  }
  if (initialGasMass(parameters) >= parameters.mass)
    throw new Error(
      "Tank air mass must be less than the initial loaded vehicle mass. Reduce tank pressure or volume, or increase vehicle mass.",
    );
  return parameters;
}

function validateNumber(name, value, field) {
  if (!Number.isFinite(value) || value < field.min || value > field.max)
    throw new Error(`${name} must be between ${field.min} and ${field.max}`);
}

export function initialGasMass(p) {
  return (
    ((AIR.ambientPressure + p.tankPressure * 1e5) * p.tankVolume) /
    1000 /
    (AIR.gasConstant * AIR.temperature)
  );
}

export function readSetup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Setup must be a JSON object.");
  if (value.version !== 1 && value.version !== 2)
    throw new Error("Unsupported setup version. Expected version 2.");
  let overrides = value.parameters ?? {};
  if (typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Parameters must be an object");
  // Preserve the old impulse capacity as usable air mass when loading a v1 setup.
  if (value.version === 1) {
    const { gasBudget = 6, ...legacy } = overrides;
    validateNumber("gasBudget", gasBudget, { min: 0, max: 10 });
    overrides = { ...legacy };
    const thrust = legacy.thrust ?? DEFAULTS[value.mode]?.thrust;
    if (gasBudget === 0 || thrust === 0) overrides.tankPressure = 0;
    else
      overrides.tankVolume = Math.max(
        10,
        ((((gasBudget * thrust * 1000) / common.exhaustSpeed) *
          AIR.gasConstant *
          AIR.temperature) /
          (common.tankPressure * 1e5)) *
          1000,
      );
  }
  return {
    mode: value.mode,
    parameters: parametersFor(value.mode, overrides),
    migrated: value.version === 1,
  };
}

export function rideHeight(p) {
  const sag = (p.mass * 9.81) / (4 * p.stiffness * 1000);
  return (
    VEHICLE.wheelRadius -
    VEHICLE.mountHeight +
    VEHICLE.suspensionRest -
    Math.min(sag, p.travel)
  );
}
