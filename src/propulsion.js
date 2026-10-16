import { Vector3, Quaternion } from "three";
import { AIR, NOZZLES, initialGasMass } from "./config.js";

const DOWN = new Vector3(0, -1, 0);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const toRadians = Math.PI / 180;

/** Isothermal ideal-air reservoir, ideal regulator and pressure-limited valve flow. */
export function airSupply(p, gasUsed = 0) {
  const volume = p.tankVolume / 1000;
  const ambientMass =
    (AIR.ambientPressure * volume) / (AIR.gasConstant * AIR.temperature);
  const gasMass = Math.max(ambientMass, initialGasMass(p) - gasUsed);
  const usableMass = Math.max(0, gasMass - ambientMass);
  const pressure = (gasMass * AIR.gasConstant * AIR.temperature) / volume;
  const inlet = Math.min(pressure, AIR.regulatorPressure);
  const ratio = Math.min(1, AIR.ambientPressure / inlet);
  const { gamma: g } = AIR;
  const criticalRatio = (2 / (g + 1)) ** (g / (g - 1));
  const chokedFlux = Math.sqrt(g) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)));
  const flux =
    ratio <= criticalRatio
      ? chokedFlux
      : Math.sqrt(
          Math.max(
            0,
            ((2 * g) / (g - 1)) * (ratio ** (2 / g) - ratio ** ((g + 1) / g)),
          ),
        );
  // The user's aggregate flow rating defines four equal valve throats at 100 bar absolute.
  const maxFlow =
    usableMass > 1e-9
      ? (((p.massFlow * inlet) / AIR.regulatorPressure) * flux) / chokedFlux
      : 0;
  // Ideal expansion to ambient sets an upper speed bound; the user may request less.
  const idealSpeed = Math.sqrt(
    Math.max(
      0,
      ((2 * g) / (g - 1)) *
        AIR.gasConstant *
        AIR.temperature *
        (1 - ratio ** ((g - 1) / g)),
    ),
  );
  const exhaustSpeed = Math.min(p.exhaustSpeed, idealSpeed);
  return {
    gasMass,
    usableMass,
    pressureBar: Math.max(0, (pressure - AIR.ambientPressure) / 1e5),
    maxFlow,
    exhaustSpeed,
    maxThrust: maxFlow * exhaustSpeed,
  };
}

/** Mix a body-frame wrench into four real forces; schedules and valves limit each one. */
export function nozzleForces(
  p,
  supply,
  flightTime,
  requestedForce,
  requestedTorque,
  dt,
) {
  const count = NOZZLES.length;
  const center = new Vector3(0, NOZZLES[0].y - p.cgHeight, 0);
  const residual = requestedTorque
    .clone()
    .sub(center.clone().cross(requestedForce));
  // Sum (|r|² I - r rᵀ) for the centered rectangular nozzle arrangement is diagonal.
  const moment = NOZZLES.reduce(
    (sum, n) => sum.add(new Vector3(n.z ** 2, n.x ** 2 + n.z ** 2, n.x ** 2)),
    new Vector3(),
  );
  const angular = residual.divide(moment);
  const jets = NOZZLES.map((mount, i) => {
    const n = p.nozzles[i];
    const force = requestedForce
      .clone()
      .divideScalar(count)
      .add(angular.clone().cross(new Vector3(mount.x, 0, mount.z)));
    const requested = force.length();
    const direction =
      n.assisted && requested > 1e-9
        ? force.multiplyScalar(-1 / requested)
        : DOWN.clone();
    // Angles rotate the exhaust vector in body axes. In assisted mode these are trims.
    direction
      .applyQuaternion(
        new Quaternion().setFromAxisAngle(X, -n.sideAngle * toRadians),
      )
      .applyQuaternion(
        new Quaternion().setFromAxisAngle(Z, n.foreAngle * toRadians),
      );
    const active =
      n.enabled && flightTime >= n.start && flightTime < n.start + n.duration;
    const capacity = ((supply.maxThrust / count) * n.throttle) / 100;
    const thrust = active
      ? n.assisted
        ? Math.min(requested, capacity)
        : capacity
      : 0;
    return {
      id: mount.id,
      active,
      direction,
      thrust,
      massFlow: supply.exhaustSpeed > 0 ? thrust / supply.exhaustSpeed : 0,
      exhaustSpeed: supply.exhaustSpeed,
    };
  });
  const requestedFlow = jets.reduce((sum, jet) => sum + jet.massFlow, 0);
  const scale =
    requestedFlow > 0
      ? Math.min(1, supply.usableMass / (requestedFlow * dt))
      : 1;
  const force = new Vector3(),
    torque = new Vector3();
  for (const [i, jet] of jets.entries()) {
    jet.thrust *= scale;
    jet.massFlow *= scale;
    jet.force = jet.direction.clone().multiplyScalar(-jet.thrust);
    force.add(jet.force);
    torque.add(
      new Vector3(NOZZLES[i].x, center.y, NOZZLES[i].z).cross(jet.force),
    );
  }
  return { jets, force, torque, massFlow: requestedFlow * scale };
}
