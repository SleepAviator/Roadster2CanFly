import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3, Quaternion } from "three";
import {
  VEHICLE,
  WHEELS,
  OBSTACLES,
  parametersFor,
  rideHeight,
} from "./config.js";

export const STEP = 1 / 240;
const GRAVITY = 9.81;
const UP = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Z = new Vector3(0, 0, 1);
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const smooth = (u) => {
  u = clamp(u, 0, 1);
  return u * u * u * (10 + u * (-15 + 6 * u));
};
let initialization;
export const initializePhysics = () => (initialization ??= RAPIER.init());

function hermite(t, duration, y0, v0, y1, v1) {
  const u = clamp(t / duration, 0, 1),
    u2 = u * u,
    u3 = u2 * u;
  return {
    y:
      (2 * u3 - 3 * u2 + 1) * y0 +
      (u3 - 2 * u2 + u) * duration * v0 +
      (-2 * u3 + 3 * u2) * y1 +
      (u3 - u2) * duration * v1,
    v:
      ((6 * u2 - 6 * u) * y0 +
        (3 * u2 - 4 * u + 1) * duration * v0 +
        (-6 * u2 + 6 * u) * y1 +
        (3 * u2 - 2 * u) * duration * v1) /
      duration,
    a:
      ((12 * u - 6) * y0 +
        (6 * u - 4) * duration * v0 +
        (-12 * u + 6) * y1 +
        (6 * u - 2) * duration * v1) /
      (duration * duration),
  };
}

function bump(t, duration, height, baseline) {
  const half = duration / 2;
  const rising = t <= half;
  const u = clamp((rising ? t : t - half) / half, 0, 1);
  const sign = rising ? 1 : -1;
  return {
    y: baseline + height * (rising ? smooth(u) : 1 - smooth(u)),
    v: (sign * height * 30 * u * u * (u - 1) * (u - 1)) / half,
    a: (sign * height * 60 * u * (2 * u * u - 3 * u + 1)) / (half * half),
  };
}

/** SI-unit rigid-body model. The driven approach is prescribed; free flight is force-integrated. */
export class FlightSimulation {
  constructor(mode = "ramp", overrides = {}) {
    this.reset(mode, overrides);
  }

  reset(mode = this.mode, overrides = {}) {
    this.world?.free();
    this.events?.free();
    this.mode = mode;
    this.p = parametersFor(mode, overrides);
    const p = this.p;
    this.height = rideHeight(p);
    this.time = 0;
    this.phase = "ready";
    this.running = false;
    this.reason = "";
    this.flightStart = null;
    this.touchdownTime = null;
    this.airborne = false;
    this.rollAngle = 0;
    this.gasUsed = 0;
    this.thrustLevel = 0;
    this.torqueLevel = 0;
    this.wheelCompression = [0, 0, 0, 0];
    this.wheelContacts = 0;
    this.normalLoad = 0;
    this.metrics = {
      peakHeight: 0,
      peakLoadG: 0,
      touchdownSpeed: null,
      touchdownTilt: null,
      flightDuration: null,
      rollTurns: 0,
    };
    this.trace = [];
    this.stepCount = 0;
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 8;
    this.events = new RAPIER.EventQueue(true);
    this.hazards = new Map();
    const floor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(140, 0.1, 30)
        .setTranslation(0, -0.1, 0)
        .setFriction(p.friction)
        .setRestitution(0),
    );
    this.hazards.set(floor.handle, "Underbody struck the runway");
    if (mode === "kickflip") {
      for (const item of OBSTACLES) {
        const obstacle = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            item.width / 2,
            item.height / 2,
            item.depth / 2,
          ).setTranslation(item.x, item.height / 2, 0),
        );
        this.hazards.set(
          obstacle.handle,
          `Collision with the ${item.label.toLowerCase()}`,
        );
      }
    } else {
      const end = (p.exitAngle * Math.PI) / 180;
      const radius = p.height / (1 - Math.cos(end));
      for (let i = 0; i < 64; i++) {
        const a = (end * i) / 64,
          b = (end * (i + 1)) / 64,
          mid = (a + b) / 2;
        const q = new Quaternion().setFromAxisAngle(AXIS_Z, mid);
        const deck = this.world.createCollider(
          RAPIER.ColliderDesc.cuboid((radius * (b - a)) / 2 + 0.01, 0.07, 2.5)
            .setTranslation(
              (radius + 0.07) * Math.sin(mid),
              radius * (1 - Math.cos(mid)) - 0.07 * Math.cos(mid),
              0,
            )
            .setRotation(q),
        );
        this.hazards.set(deck.handle, "Collision with the ramp");
      }
    }
    const mass = p.mass;
    this.inertia = new Vector3(
      (mass * (VEHICLE.width ** 2 + VEHICLE.bodyHeight ** 2)) / 12,
      (mass * (VEHICLE.length ** 2 + VEHICLE.width ** 2)) / 12,
      (mass * (VEHICLE.length ** 2 + VEHICLE.bodyHeight ** 2)) / 12,
    );
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setAdditionalMassProperties(
          mass,
          { x: 0, y: p.cgHeight, z: 0 },
          this.inertia,
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setCcdEnabled(true)
        .setAngularDamping(0.04),
    );
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        VEHICLE.length / 2,
        VEHICLE.bodyHeight / 2,
        VEHICLE.width / 2,
      )
        .setMass(0)
        .setFriction(p.friction)
        .setRestitution(0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    this.approachDuration = mode === "ramp" ? 36 / p.speed : 1.8;
    this.rampDuration =
      mode === "ramp"
        ? ((p.height / (1 - Math.cos((p.exitAngle * Math.PI) / 180)) -
            this.height) *
            ((p.exitAngle * Math.PI) / 180)) /
          p.speed
        : 0;
    this._guided(0);
    this._record();
    return this.snapshot();
  }

  start() {
    if (this.phase === "ready") {
      this.running = true;
      this.phase = "approach";
    }
  }

  _guided(time) {
    const p = this.p;
    let point,
      rotation = new Quaternion();
    if (time <= this.approachDuration) {
      const endX = this.mode === "ramp" ? 0 : -37;
      point = new Vector3(
        endX - p.speed * (this.approachDuration - time),
        this.height,
        0,
      );
      this.phase = this.running ? "approach" : "ready";
    } else {
      const theta =
        (clamp((time - this.approachDuration) / this.rampDuration, 0, 1) *
          p.exitAngle *
          Math.PI) /
        180;
      const radius = p.height / (1 - Math.cos((p.exitAngle * Math.PI) / 180));
      point = new Vector3(
        (radius - this.height) * Math.sin(theta),
        radius * (1 - Math.cos(theta)) + this.height * Math.cos(theta),
        0,
      );
      rotation.setFromAxisAngle(AXIS_Z, theta);
      this.phase = "ramp";
    }
    this.body.setTranslation(point, false);
    this.body.setRotation(rotation, false);
    this.guidedVelocity =
      this.mode === "ramp" && time > this.approachDuration
        ? new Vector3(p.speed, 0, 0).applyQuaternion(rotation)
        : new Vector3(p.speed, 0, 0);
    const sag = (this.p.mass * GRAVITY) / (4 * this.p.stiffness * 1000);
    this.wheelCompression.fill(Math.min(sag, p.travel));
  }

  _release() {
    const end = this.approachDuration + this.rampDuration;
    this._guided(end);
    this.launchPosition = new Vector3().copy(this.body.translation());
    this.launchRotation = new Quaternion().copy(this.body.rotation());
    this.launchVelocity = this.guidedVelocity.clone();
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel(this.launchVelocity, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.flightStart = this.time;
    this.phase = "flight";
  }

  _suspension(position, rotation, velocity, omega) {
    const p = this.p;
    const up = UP.clone().applyQuaternion(rotation);
    const com = new Vector3().copy(this.body.worldCom());
    this.wheelContacts = 0;
    this.normalLoad = 0;
    for (let i = 0; i < WHEELS.length; i++) {
      const w = WHEELS[i];
      const restPoint = new Vector3(
        w.x,
        VEHICLE.mountHeight - VEHICLE.suspensionRest,
        w.z,
      )
        .applyQuaternion(rotation)
        .add(position);
      const penetration = VEHICLE.wheelRadius - restPoint.y;
      const canContact =
        up.y > 0.35 &&
        penetration > 0 &&
        Math.abs(restPoint.z) < 30 &&
        Math.abs(restPoint.x) < 140;
      this.wheelCompression[i] = canContact
        ? Math.min(penetration / up.y, p.travel)
        : 0;
      if (!canContact) continue;
      this.wheelContacts++;
      const r = restPoint.clone().sub(com);
      const pointVelocity = omega.clone().cross(r).add(velocity);
      // Progressive bump stop: additional tire/stop stiffness once the suspension travel is used.
      const bump = Math.max(0, penetration - p.travel * up.y);
      const normal = Math.max(
        0,
        p.stiffness * 1000 * penetration +
          p.stiffness * 6000 * bump -
          p.damping * 1000 * pointVelocity.y,
      );
      this.normalLoad += normal;
      const friction = new Vector3(
        (-pointVelocity.x * p.mass * 1.6) / 4,
        0,
        (-pointVelocity.z * p.mass * 2) / 4,
      );
      friction.clampLength(0, p.friction * normal);
      const force = friction.setY(normal);
      this.body.addForceAtPoint(force, restPoint, true);
    }
  }

  _actuators(tf, position, rotation, velocity, omega) {
    const p = this.p;
    this.thrustLevel = 0;
    this.torqueLevel = 0;
    if (this.gasUsed >= p.gasBudget || p.thrust <= 0) return;
    const maxThrust = p.thrust * 1000;
    let thrust = 0;
    if (p.landingAssist && this.touchdownTime === null) {
      let target;
      if (tf <= p.flightTime) {
        target =
          this.mode === "ramp"
            ? hermite(
                tf,
                p.flightTime,
                this.launchPosition.y,
                this.launchVelocity.y,
                this.height - 0.035,
                -0.45,
              )
            : bump(tf, p.flightTime, p.height, this.height - 0.035);
      } else target = { y: this.height - 0.035, v: -0.4, a: 0 };
      const acceleration =
        GRAVITY +
        target.a +
        11 * (target.y - position.y) +
        6.5 * (target.v - velocity.y);
      thrust = clamp(p.mass * acceleration, 0, maxThrust);
    }
    const torque = new Vector3();
    if (
      p.attitudeAssist &&
      (this.touchdownTime === null || this.time - this.touchdownTime < 0.25)
    ) {
      let target;
      if (this.mode === "ramp") {
        target = this.launchRotation
          .clone()
          .slerp(
            new Quaternion().setFromAxisAngle(UP, Math.PI),
            smooth(tf / p.rotationTime),
          );
      } else {
        target = new Quaternion().setFromAxisAngle(
          AXIS_X,
          2 * Math.PI * smooth((tf - 0.25) / p.rotationTime),
        );
      }
      const error = target.multiply(rotation.clone().invert()).normalize();
      if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w);
      const inverse = rotation.clone().invert();
      const localError = new Vector3(error.x, error.y, error.z)
        .multiplyScalar(2)
        .applyQuaternion(inverse);
      const localOmega = omega.clone().applyQuaternion(inverse);
      torque
        .copy(localError)
        .multiplyScalar(100)
        .addScaledVector(localOmega, -20)
        .multiply(this.inertia)
        .applyQuaternion(rotation)
        .clampLength(0, p.torque * 1000);
    }
    // Express both actuator impulses as equivalent seconds of full-power lift thrust.
    const requestedBudget =
      ((thrust + torque.length() / 1.5) / maxThrust) * STEP;
    const scale =
      requestedBudget > 0
        ? Math.min(1, (p.gasBudget - this.gasUsed) / requestedBudget)
        : 1;
    thrust *= scale;
    torque.multiplyScalar(scale);
    // Idealized vectorable resultant. No nozzle-flow or ground-effect model is claimed.
    this.body.addForce({ x: 0, y: thrust, z: 0 }, true);
    this.body.addTorque(torque, true);
    this.thrustLevel = thrust / maxThrust;
    this.torqueLevel = p.torque > 0 ? torque.length() / (p.torque * 1000) : 0;
    this.gasUsed = Math.min(
      p.gasBudget,
      this.gasUsed + requestedBudget * scale,
    );
  }

  step(count = 1) {
    for (let j = 0; j < count && this.running; j++) {
      this.time += STEP;
      this.stepCount++;
      if (
        this.flightStart === null &&
        this.time < this.approachDuration + this.rampDuration
      ) {
        this._guided(this.time);
      } else {
        if (this.flightStart === null) this._release();
        const position = new Vector3().copy(this.body.translation());
        const rotation = new Quaternion()
          .copy(this.body.rotation())
          .normalize();
        const velocity = new Vector3().copy(this.body.linvel());
        const omega = new Vector3().copy(this.body.angvel());
        this.body.resetForces(false);
        this.body.resetTorques(false);
        this._suspension(position, rotation, velocity, omega);
        const tf = this.time - this.flightStart;
        if (this.wheelContacts === 0 && position.y - this.height > 0.35)
          this.airborne = true;
        if (this.mode === "kickflip") {
          this.rollAngle += omega.x * STEP;
          this.metrics.rollTurns = this.rollAngle / (2 * Math.PI);
        }
        if (
          this.airborne &&
          this.wheelContacts > 0 &&
          tf > 0.7 &&
          this.touchdownTime === null
        ) {
          this.touchdownTime = this.time;
          this.phase = "landing";
          this.metrics.touchdownSpeed = Math.max(0, -velocity.y);
          this.metrics.touchdownTilt =
            (Math.acos(clamp(UP.clone().applyQuaternion(rotation).y, -1, 1)) *
              180) /
            Math.PI;
          this.metrics.flightDuration = tf;
        }
        this._actuators(tf, position, rotation, velocity, omega);
        const airVelocity = velocity
          .clone()
          .sub(new Vector3(this.p.wind, 0, 0));
        this.body.addForce(
          airVelocity
            .clone()
            .multiplyScalar(
              -0.5 * 1.225 * this.p.dragArea * airVelocity.length(),
            ),
          true,
        );
        this.world.step(this.events);
        this.events.drainCollisionEvents((a, b, started) => {
          if (
            !started ||
            (a !== this.collider.handle && b !== this.collider.handle)
          )
            return;
          const other = a === this.collider.handle ? b : a;
          if (this.hazards.has(other))
            this._finish("crashed", this.hazards.get(other));
        });
        this.metrics.peakHeight = Math.max(
          this.metrics.peakHeight,
          this.body.translation().y - this.height,
        );
        this.metrics.peakLoadG = Math.max(
          this.metrics.peakLoadG,
          this.normalLoad / (this.p.mass * GRAVITY),
        );
        if (this.touchdownTime !== null && this.running) {
          if (
            this.metrics.touchdownSpeed > 4 ||
            this.metrics.touchdownTilt > 22
          ) {
            this._finish(
              "crashed",
              this.metrics.touchdownSpeed > 4
                ? "Hard landing: vertical speed exceeded 4 m/s"
                : "Landing attitude exceeded 22°",
            );
          } else if (
            this.time - this.touchdownTime > 1.0 &&
            this.wheelContacts >= 3 &&
            this.body.linvel().y > -0.25 &&
            this.body.linvel().y < 0.25 &&
            Math.abs(this.body.linvel().x) < 0.8
          ) {
            const lastObstacle = OBSTACLES.at(-1);
            if (this.mode === "kickflip" && this.metrics.rollTurns < 0.95) {
              this._finish(
                "crashed",
                "Landed, but the full kickflip was not completed",
              );
            } else if (
              this.mode === "kickflip" &&
              this.body.translation().x <
                lastObstacle.x + lastObstacle.width / 2 + VEHICLE.length / 2
            ) {
              this._finish(
                "crashed",
                "Landed before clearing the vehicle lineup",
              );
            } else this._finish("complete", "Wheels down. Landing stabilized.");
          }
        }
        if (this.body.translation().y < -2 && this.running)
          this._finish("crashed", "Vehicle left the modeled ground");
        if (tf > this.p.flightTime + 9 && this.running)
          this._finish(
            "crashed",
            "Landing did not stabilize within the time limit",
          );
      }
      if (this.stepCount % 4 === 0 || !this.running) this._record();
    }
    return this.snapshot();
  }

  _finish(phase, reason) {
    this.phase = phase;
    this.reason = reason;
    this.running = false;
  }

  snapshot() {
    const guided = this.flightStart === null;
    return {
      time: this.time,
      phase: this.phase,
      reason: this.reason,
      position: { ...this.body.translation() },
      rotation: { ...this.body.rotation() },
      velocity: { ...(guided ? this.guidedVelocity : this.body.linvel()) },
      wheelCompression: [...this.wheelCompression],
      wheelContacts: this.wheelContacts,
      thrustLevel: this.thrustLevel,
      torqueLevel: this.torqueLevel,
      gasRemaining:
        this.p.gasBudget > 0
          ? Math.max(0, 1 - this.gasUsed / this.p.gasBudget)
          : 0,
      altitude: Math.max(0, this.body.translation().y - this.height),
      loadG: this.normalLoad / (this.p.mass * GRAVITY),
      metrics: { ...this.metrics },
    };
  }

  _record() {
    const s = this.snapshot();
    this.trace.push({
      time: s.time,
      x: s.position.x,
      y: s.position.y,
      z: s.position.z,
      vx: s.velocity.x,
      vy: s.velocity.y,
      vz: s.velocity.z,
      qx: s.rotation.x,
      qy: s.rotation.y,
      qz: s.rotation.z,
      qw: s.rotation.w,
      thrust: s.thrustLevel * this.p.thrust * 1000,
      loadG: s.loadG,
      gasRemaining: s.gasRemaining,
      phase: s.phase,
    });
  }

  dispose() {
    this.world.free();
    this.events.free();
  }
}
