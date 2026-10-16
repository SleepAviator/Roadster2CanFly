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
  gasBudget: 6,
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
    title: "Vehicle & thrusters",
    fields: [
      {
        key: "mass",
        label: "Total mass",
        unit: "kg",
        min: 900,
        max: 3500,
        step: 50,
      },
      {
        key: "thrust",
        label: "Maximum lift thrust",
        unit: "kN",
        min: 0,
        max: 80,
        step: 1,
      },
      {
        key: "torque",
        label: "Attitude torque limit",
        unit: "kN·m",
        min: 0,
        max: 50,
        step: 1,
      },
      {
        key: "gasBudget",
        label: "Full-power thrust budget",
        unit: "s",
        min: 0,
        max: 10,
        step: 0.1,
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
  const parameters = { ...DEFAULTS[mode] };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(parameters, key))
      throw new Error(`Unknown parameter: ${key}`);
    if (typeof parameters[key] === "boolean") {
      if (typeof value !== "boolean")
        throw new Error(`${key} must be true or false`);
    } else {
      const field = PARAM_GROUPS.flatMap((group) => group.fields).find(
        (item) => item.key === key,
      );
      if (!Number.isFinite(value) || value < field.min || value > field.max) {
        throw new Error(`${key} must be between ${field.min} and ${field.max}`);
      }
    }
    parameters[key] = value;
  }
  return parameters;
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
