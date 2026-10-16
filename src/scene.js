import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { VEHICLE, WHEELS, OBSTACLES, NOZZLES } from "./config.js";

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const TRAIL_LIMIT = 700;
const palette = {
  silver: 0xdde5e9,
  dark: 0x111b23,
  glass: 0x142b3c,
  road: 0x202b32,
  red: 0xff3849,
  ice: 0xc7edff,
};

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.15,
    ...options,
  });
}

function mesh(geometry, material, parent, position) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.receiveShadow = true;
  if (position) object.position.set(...position);
  parent.add(object);
  return object;
}

function box(parent, material, size, position, radius = 0) {
  const geometry = radius
    ? new RoundedBoxGeometry(...size, 2, radius)
    : new THREE.BoxGeometry(...size);
  return mesh(geometry, material, parent, position);
}

function beam(parent, material, start, end, width = 0.16) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const object = box(
    parent,
    material,
    [width, a.distanceTo(b), width],
    a.clone().add(b).multiplyScalar(0.5).toArray(),
  );
  object.quaternion.setFromUnitVectors(UP, b.sub(a).normalize());
  return object;
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material))
      object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

// Cross sections keep the body original, compact, and independent of model downloads.
function loft(sections) {
  const positions = [];
  const indices = [];
  for (const { x, width, top, bottom, shoulder = 0.12 } of sections) {
    const ring = [
      [-width * 0.72, top],
      [-width * 0.95, top - shoulder * 0.35],
      [-width, top - shoulder],
      [-width * 0.94, bottom + 0.08],
      [-width * 0.72, bottom],
      [width * 0.72, bottom],
      [width * 0.94, bottom + 0.08],
      [width, top - shoulder],
      [width * 0.95, top - shoulder * 0.35],
      [width * 0.72, top],
    ];
    ring.forEach(([z, y]) => positions.push(x, y, z));
  }
  const stride = 10;
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < stride; side++) {
      const a = ring * stride + side;
      const b = ring * stride + ((side + 1) % stride);
      const c = a + stride;
      const d = b + stride;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let side = 1; side < stride - 1; side++) {
    indices.push(0, side, side + 1);
    const last = (sections.length - 1) * stride;
    indices.push(last, last + side + 1, last + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addRoadster() {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: palette.silver,
    metalness: 0.62,
    roughness: 0.27,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
  });
  const carbon = standard(0x121c25, { roughness: 0.38, metalness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    metalness: 0.45,
    roughness: 0.12,
    clearcoat: 1,
    emissive: 0x071019,
    emissiveIntensity: 0.4,
  });
  const white = new THREE.MeshBasicMaterial({ color: 0xf1faff });
  const red = new THREE.MeshBasicMaterial({ color: palette.red });

  mesh(
    loft([
      { x: -2.25, width: 0.65, top: 0.08, bottom: -0.19 },
      { x: -2.05, width: 0.91, top: 0.24, bottom: -0.29 },
      { x: -1.45, width: 0.975, top: 0.31, bottom: -0.31 },
      { x: -0.5, width: 0.95, top: 0.24, bottom: -0.31 },
      { x: 0.65, width: 0.94, top: 0.23, bottom: -0.31 },
      { x: 1.45, width: 0.94, top: 0.18, bottom: -0.29 },
      { x: 2.08, width: 0.83, top: 0.06, bottom: -0.23 },
      { x: 2.25, width: 0.64, top: -0.01, bottom: -0.16 },
    ]),
    paint,
    group,
  );

  mesh(
    loft([
      { x: -1.2, width: 0.67, top: 0.32, bottom: 0.21, shoulder: 0.06 },
      { x: -0.72, width: 0.7, top: 0.79, bottom: 0.22, shoulder: 0.15 },
      { x: 0.13, width: 0.68, top: 0.83, bottom: 0.22, shoulder: 0.13 },
      { x: 0.88, width: 0.66, top: 0.26, bottom: 0.2, shoulder: 0.03 },
    ]),
    glass,
    group,
  );
  box(group, carbon, [0.94, 0.045, 1.22], [-0.28, 0.82, 0], 0.02);
  for (const z of [-0.69, 0.69]) {
    beam(group, paint, [-0.79, 0.72, z], [-1.18, 0.29, z], 0.055);
    beam(group, paint, [0.15, 0.78, z], [0.84, 0.27, z], 0.045);
    box(group, carbon, [2.75, 0.1, 0.08], [-0.05, -0.25, z * 1.39], 0.025);
    box(group, carbon, [0.22, 0.025, 0.018], [-0.4, 0.17, z * 1.375], 0.008);
    box(group, paint, [0.27, 0.1, 0.18], [0.53, 0.39, z * 1.47], 0.035);
    box(group, carbon, [0.17, 0.06, 0.07], [0.48, 0.34, z * 1.35], 0.02);
  }
  box(group, carbon, [0.12, 0.13, 1.27], [2.19, -0.11, 0], 0.035);
  box(group, carbon, [0.22, 0.065, 1.62], [2.14, -0.265, 0], 0.025);
  box(group, carbon, [0.18, 0.12, 1.52], [-2.13, -0.235, 0], 0.025);
  for (const sign of [-1, 1]) {
    const headlight = box(
      group,
      white,
      [0.065, 0.043, 0.51],
      [2.12, 0.015, sign * 0.58],
      0.018,
    );
    headlight.rotation.y = sign * 0.12;
    box(group, red, [0.05, 0.045, 0.65], [-2.15, 0.13, sign * 0.5], 0.015);
  }
  box(group, red, [0.045, 0.02, 0.5], [-2.17, 0.13, 0], 0.008);

  const panelGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.96, 0.225, -0.58),
    new THREE.Vector3(1.98, 0.09, -0.54),
    new THREE.Vector3(0.96, 0.225, 0.58),
    new THREE.Vector3(1.98, 0.09, 0.54),
  ]);
  group.add(
    new THREE.LineSegments(
      panelGeometry,
      new THREE.LineBasicMaterial({
        color: 0x7c8b95,
        transparent: true,
        opacity: 0.5,
      }),
    ),
  );

  const rubber = standard(0x12171b, { roughness: 0.98, metalness: 0 });
  const alloy = standard(0xa8b8c2, { roughness: 0.26, metalness: 0.88 });
  const rimDark = standard(0x28343d, { roughness: 0.35, metalness: 0.75 });
  const wheels = WHEELS.map(({ x, z }) => {
    const wheel = new THREE.Group();
    wheel.position.set(x, VEHICLE.mountHeight - VEHICLE.suspensionRest, z);
    group.add(wheel);
    const tireGeometry = new THREE.CylinderGeometry(
      VEHICLE.wheelRadius,
      VEHICLE.wheelRadius,
      0.255,
      32,
      1,
    );
    tireGeometry.rotateX(Math.PI / 2);
    mesh(tireGeometry, rubber, wheel);
    const rimGeometry = new THREE.CylinderGeometry(0.252, 0.252, 0.26, 24, 1);
    rimGeometry.rotateX(Math.PI / 2);
    mesh(rimGeometry, rimDark, wheel);
    const face = Math.sign(z) * 0.136;
    mesh(new THREE.TorusGeometry(0.248, 0.014, 6, 32), alloy, wheel, [
      0,
      0,
      face,
    ]);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const spoke = box(
        wheel,
        alloy,
        [0.035, 0.205, 0.018],
        [-Math.sin(angle) * 0.13, Math.cos(angle) * 0.13, face],
      );
      spoke.rotation.z = angle + 0.1;
    }
    const hubGeometry = new THREE.CylinderGeometry(0.062, 0.062, 0.025, 16);
    hubGeometry.rotateX(Math.PI / 2);
    mesh(hubGeometry, alloy, wheel, [0, 0, face]);
    mesh(new THREE.TorusGeometry(0.39, 0.027, 6, 24, Math.PI), paint, group, [
      x,
      VEHICLE.mountHeight - VEHICLE.suspensionRest + 0.04,
      Math.sign(z) * 0.979,
    ]);
    return wheel;
  });

  const plumeOuter = new THREE.MeshBasicMaterial({
    color: 0xd6edff,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const plumeCore = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jets = [];
  for (const { x, y, z } of NOZZLES) {
    const nozzle = new THREE.Group();
    nozzle.position.set(x, y, z);
    group.add(nozzle);
    const nozzleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 0.1, 12);
    mesh(nozzleGeometry, carbon, nozzle, [0, 0.05, 0]);
    const jet = new THREE.Group();
    nozzle.add(jet);
    const outer = mesh(
      new THREE.ConeGeometry(0.24, 1, 14, 1, true),
      plumeOuter,
      jet,
      [0, -0.5, 0],
    );
    const core = mesh(
      new THREE.ConeGeometry(0.1, 0.73, 10, 1, true),
      plumeCore,
      jet,
      [0, -0.365, 0],
    );
    outer.castShadow = core.castShadow = false;
    outer.receiveShadow = core.receiveShadow = false;
    jet.visible = false;
    jets.push(jet);
  }
  return { group, wheels, jets };
}

function addRamp(parent, p) {
  const thetaMax = ((p.exitAngle ?? 135) * Math.PI) / 180;
  const radius = p.height / (1 - Math.cos(thetaMax));
  const segments = Math.max(64, Math.ceil(thetaMax * 40));
  const halfWidth = 2.55;
  const thickness = 0.22;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (thetaMax * i) / segments;
    for (const r of [radius, radius + thickness]) {
      for (const z of [-halfWidth, halfWidth]) {
        positions.push(r * Math.sin(theta), radius - r * Math.cos(theta), z);
      }
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 4;
    indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
    indices.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7);
    indices.push(a, a + 4, a + 2, a + 2, a + 4, a + 6);
    indices.push(a + 1, a + 3, a + 5, a + 3, a + 7, a + 5);
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  deck.setIndex(indices);
  deck.computeVertexNormals();
  mesh(
    deck,
    standard(0x8a9ca8, {
      roughness: 0.56,
      metalness: 0.48,
      side: THREE.DoubleSide,
    }),
    parent,
  );

  const edge = new THREE.MeshBasicMaterial({ color: 0xd9f1fa });
  const structure = standard(0x405560, { roughness: 0.55, metalness: 0.65 });
  const lighter = standard(0x617781, { roughness: 0.48, metalness: 0.7 });
  for (const z of [-halfWidth + 0.08, halfWidth - 0.08]) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (thetaMax * i) / segments;
      points.push(
        new THREE.Vector3(
          (radius - 0.025) * Math.sin(theta),
          radius - (radius - 0.025) * Math.cos(theta),
          z,
        ),
      );
    }
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        segments,
        0.025,
        5,
        false,
      ),
      edge,
      parent,
    );
  }

  // The frame stays beyond the outside of the arc, clear of the return flight.
  const outerX = radius * (thetaMax >= Math.PI / 2 ? 1 : Math.sin(thetaMax));
  const towerX = outerX + 3.3;
  const rearX = towerX + 2.8;
  for (const z of [-3.05, 3.05]) {
    for (const x of [towerX, rearX]) {
      box(
        parent,
        structure,
        [0.22, p.height + 0.8, 0.22],
        [x, (p.height + 0.8) / 2, z],
      );
      box(parent, structure, [1.0, 0.2, 1.0], [x, 0.1, z]);
    }
    for (let y = 0; y < p.height; y += 4) {
      const nextY = Math.min(y + 4, p.height + 0.8);
      beam(parent, lighter, [towerX, y, z], [rearX, nextY, z], 0.09);
      beam(parent, lighter, [rearX, y, z], [towerX, nextY, z], 0.09);
      beam(parent, structure, [towerX, nextY, z], [rearX, nextY, z], 0.12);
    }
    for (let i = 1; i <= 7; i++) {
      const theta = (thetaMax * i) / 7;
      const x = (radius + 0.35) * Math.sin(theta);
      const y = radius - (radius + 0.35) * Math.cos(theta);
      if (y > 0.1) beam(parent, structure, [x, y, z], [towerX, y, z], 0.16);
    }
  }
  for (let i = 1; i <= 10; i++) {
    const theta = (thetaMax * i) / 10;
    const x = (radius + 0.28) * Math.sin(theta);
    const y = radius - (radius + 0.28) * Math.cos(theta);
    beam(parent, structure, [x, y, -3.05], [x, y, 3.05], 0.15);
  }
  beam(
    parent,
    structure,
    [towerX, p.height + 0.8, -3.05],
    [towerX, p.height + 0.8, 3.05],
    0.18,
  );
}

function addParkedVehicle(parent, obstacle, index) {
  const group = new THREE.Group();
  group.position.x = obstacle.x;
  parent.add(group);
  const { width: w, height: h, depth: l } = obstacle;
  const paint = standard(obstacle.color, { roughness: 0.38, metalness: 0.43 });
  const dark = standard(0x1a242c, { roughness: 0.8, metalness: 0.08 });
  const glass = standard(0x173445, { roughness: 0.15, metalness: 0.6 });
  const trim = standard(0x7f929b, { roughness: 0.3, metalness: 0.85 });
  const lamps = new THREE.MeshBasicMaterial({ color: 0xd4e9e9 });
  const tail = new THREE.MeshBasicMaterial({ color: 0xc13c38 });
  const tireRadius = index === 2 ? 0.54 : index === 1 ? 0.43 : 0.34;
  if (index === 2) {
    // A tractor and exposed rear chassis, with no trailer over the jump corridor.
    box(group, dark, [w * 0.82, 0.3, l * 0.94], [0, tireRadius + 0.1, 0], 0.1);
    box(
      group,
      paint,
      [w * 0.9, h * 0.66, l * 0.37],
      [0, h * 0.67, l * 0.03],
      0.18,
    );
    box(
      group,
      paint,
      [w * 0.84, h * 0.24, l * 0.25],
      [0, h * 0.38, l * 0.335],
      0.15,
    );
    box(
      group,
      glass,
      [w * 0.76, h * 0.19, 0.035],
      [0, h * 0.79, l * 0.217],
      0.02,
    );
    box(group, trim, [w * 0.62, h * 0.2, 0.06], [0, h * 0.38, l * 0.466], 0.02);
    box(
      group,
      dark,
      [w * 0.52, 0.1, l * 0.16],
      [0, tireRadius + 0.32, -l * 0.28],
      0.04,
    );
    for (const x of [-w * 0.46, w * 0.46]) {
      box(group, trim, [0.14, h * 0.68, 0.14], [x, h * 0.58, -l * 0.13], 0.04);
    }
  } else if (index === 1) {
    box(group, paint, [w * 0.9, h * 0.38, l * 0.92], [0, h * 0.4, 0], 0.12);
    box(
      group,
      paint,
      [w * 0.87, h * 0.55, l * 0.36],
      [0, h * 0.72, l * 0.19],
      0.1,
    );
    box(
      group,
      glass,
      [w * 0.76, h * 0.28, 0.035],
      [0, h * 0.78, l * 0.375],
      0.02,
    );
    box(group, dark, [w * 0.75, 0.07, l * 0.4], [0, h * 0.59, -l * 0.23], 0.03);
  } else {
    box(group, paint, [w * 0.95, h * 0.38, l * 0.96], [0, h * 0.4, 0], 0.16);
    box(
      group,
      glass,
      [w * 0.76, h * 0.42, l * 0.46],
      [0, h * 0.75, -l * 0.025],
      0.15,
    );
    box(
      group,
      paint,
      [w * 0.72, 0.07, l * 0.27],
      [0, h * 0.98, -l * 0.04],
      0.035,
    );
  }
  const axlePositions =
    index === 2 ? [l * 0.32, -l * 0.22, -l * 0.36] : [l * 0.31, -l * 0.31];
  for (const x of [-w * 0.43, w * 0.43]) {
    for (const z of axlePositions) {
      const tire = new THREE.CylinderGeometry(tireRadius, tireRadius, 0.3, 18);
      tire.rotateZ(Math.PI / 2);
      mesh(tire, dark, group, [x, tireRadius, z]);
      const rim = new THREE.CylinderGeometry(
        tireRadius * 0.62,
        tireRadius * 0.62,
        0.315,
        16,
      );
      rim.rotateZ(Math.PI / 2);
      mesh(rim, trim, group, [x, tireRadius, z]);
    }
  }
  for (const x of [-w * 0.33, w * 0.33]) {
    box(group, lamps, [w * 0.19, 0.1, 0.045], [x, h * 0.39, l * 0.49], 0.02);
    box(group, tail, [w * 0.15, 0.09, 0.045], [x, h * 0.38, -l * 0.49], 0.02);
  }
}

export class SceneView {
  constructor(container) {
    if (!container) throw new Error("SceneView requires a container.");
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080f19);
    this.scene.fog = new THREE.FogExp2(0x080f19, 0.0075);
    this.camera = new THREE.PerspectiveCamera(47, 1, 0.1, 360);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "scene-canvas";
    this.renderer.domElement.style.cssText =
      "display:block;width:100%;height:100%;touch-action:none;";
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive three-dimensional Roadster flight simulation. Drag to orbit; scroll to zoom.",
    );
    container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 150;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.012;
    this.controls.target.set(-14, 7, 0);
    this.cameraMode = "orbit";
    this.mode = "ramp";
    this.parameters = { height: 20, exitAngle: 135 };
    this.wheelAngle = 0;
    this.previousTime = -1;
    this.forward = new THREE.Vector3();
    this.desiredCamera = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();

    this.addStage();
    const car = addRoadster();
    this.car = car.group;
    this.wheels = car.wheels;
    this.jets = car.jets;
    this.scene.add(this.car);

    this.trailPositions = new Float32Array(TRAIL_LIMIT * 3);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.trailPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.trailGeometry.setDrawRange(0, 0);
    this.trail = new THREE.Line(
      this.trailGeometry,
      new THREE.LineBasicMaterial({
        color: 0x8bd0dc,
        transparent: true,
        opacity: 0.48,
      }),
    );
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.trailCount = 0;
    this.lastTrail = new THREE.Vector3(Infinity, Infinity, Infinity);

    this.modeGroup = new THREE.Group();
    this.scene.add(this.modeGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.setMode("ramp", this.parameters);
    this.resize();
  }

  addStage() {
    const ambient = new THREE.HemisphereLight(0xc7def2, 0x58606b, 2.05);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xe3f0ff, 3.6);
    key.position.set(-22, 40, 25);
    key.target.position.set(-9, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -85,
      right: 65,
      top: 48,
      bottom: -45,
      near: 1,
      far: 140,
    });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.00015;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8eaac9, 1.6);
    rim.position.set(24, 24, -25);
    this.scene.add(rim);

    const ground = mesh(
      new THREE.PlaneGeometry(260, 180),
      standard(0x111c25, { roughness: 1, metalness: 0 }),
      this.scene,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-10, -0.028, 0);
    ground.castShadow = false;
    const grid = new THREE.GridHelper(220, 44, 0x32444f, 0x253540);
    grid.position.set(-10, -0.015, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.24;
    this.scene.add(grid);
    const road = mesh(
      new THREE.PlaneGeometry(150, 10.5),
      standard(palette.road, { roughness: 0.91, metalness: 0.08 }),
      this.scene,
      [-12.5, -0.004, 0],
    );
    road.rotation.x = -Math.PI / 2;
    road.castShadow = false;
    const marking = standard(0x98a9b2, {
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.5,
    });
    const led = new THREE.MeshBasicMaterial({ color: 0xeb3449 });
    for (const z of [-5.23, 5.23]) {
      box(this.scene, led, [144, 0.025, 0.035], [-13, 0.018, z]);
      for (let x = -80; x <= 55; x += 5) {
        box(this.scene, led, [0.17, 0.05, 0.1], [x, 0.035, z]);
      }
    }
    for (let x = -80; x <= 55; x += 10) {
      for (const z of [-4.72, 4.72])
        box(this.scene, marking, [0.055, 0.012, 0.65], [x, 0.01, z]);
    }
    for (let x = -78; x <= 54; x += 8) {
      box(this.scene, marking, [2.6, 0.012, 0.055], [x, 0.01, 0]);
    }

    const poleMaterial = standard(0x32424e, {
      roughness: 0.55,
      metalness: 0.65,
    });
    const panel = new THREE.MeshBasicMaterial({ color: 0xb3d6ed });
    for (const x of [-60, -25, 16, 48]) {
      box(this.scene, poleMaterial, [0.14, 12, 0.14], [x, 6, -15]);
      box(this.scene, poleMaterial, [0.15, 0.15, 3.5], [x, 11.9, -13.4]);
      box(this.scene, panel, [0.65, 0.05, 1.6], [x, 11.78, -12.5]);
    }
    const horizon = box(
      this.scene,
      standard(0x17232e, { roughness: 1, metalness: 0 }),
      [150, 7, 3],
      [-10, 3.5, -45],
    );
    horizon.castShadow = false;
    box(
      this.scene,
      new THREE.MeshBasicMaterial({ color: 0x375664 }),
      [150, 0.035, 0.035],
      [-10, 7.04, -43.4],
    );

    const dustMaterial = new THREE.MeshBasicMaterial({
      color: 0xc0d4da,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.dust = [0, 1, 2].map(() => {
      const ring = mesh(
        new THREE.RingGeometry(0.86, 1, 48),
        dustMaterial.clone(),
        this.scene,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.castShadow = ring.receiveShadow = false;
      ring.visible = false;
      return ring;
    });
    dustMaterial.dispose();
  }

  setMode(mode, parameters) {
    if (mode !== "ramp" && mode !== "kickflip")
      throw new Error(`Unknown scene mode: ${mode}`);
    this.mode = mode;
    this.parameters = { ...parameters };
    this.scene.remove(this.modeGroup);
    disposeTree(this.modeGroup);
    this.modeGroup = new THREE.Group();
    this.scene.add(this.modeGroup);
    if (mode === "ramp") addRamp(this.modeGroup, parameters);
    else
      OBSTACLES.forEach((obstacle, index) =>
        addParkedVehicle(this.modeGroup, obstacle, index),
      );

    const zoneX = mode === "ramp" ? -43 : 47;
    const zone = mesh(
      new THREE.PlaneGeometry(11, 6.3),
      new THREE.MeshBasicMaterial({
        color: 0x88c3bd,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
      this.modeGroup,
      [zoneX, 0.015, 0],
    );
    zone.rotation.x = -Math.PI / 2;
    zone.castShadow = zone.receiveShadow = false;
    const zoneTrim = new THREE.MeshBasicMaterial({
      color: 0x7da9aa,
      transparent: true,
      opacity: 0.65,
    });
    for (const x of [zoneX - 5.5, zoneX + 5.5]) {
      for (const z of [-3.15, 3.15]) {
        box(
          this.modeGroup,
          zoneTrim,
          [1.35, 0.016, 0.055],
          [x + (x < zoneX ? 0.65 : -0.65), 0.025, z],
        );
        box(
          this.modeGroup,
          zoneTrim,
          [0.055, 0.016, 0.85],
          [x, 0.025, z + (z < 0 ? 0.4 : -0.4)],
        );
      }
    }
    this.reset();
  }

  setCamera(mode) {
    if (!["orbit", "follow", "side"].includes(mode))
      throw new Error(`Unknown camera: ${mode}`);
    this.cameraMode = mode;
    this.controls.enabled = mode === "orbit";
    if (mode === "orbit") this.frameScene();
  }

  frameScene() {
    const height =
      this.mode === "ramp"
        ? this.parameters.height
        : this.parameters.height * 0.7;
    const centerX = this.mode === "ramp" ? -19 : 0;
    const targetY = Math.max(3.7, height * 0.38);
    const aspectAdjustment = Math.max(
      1,
      1.35 / Math.max(this.camera.aspect, 0.5),
    );
    const distance = (this.mode === "ramp" ? 66 : 70) * aspectAdjustment;
    this.controls.target.set(centerX, targetY, 0);
    this.camera.position.set(
      centerX - distance * 0.3,
      targetY + distance * 0.29,
      distance * 0.89,
    );
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  reset() {
    this.trailCount = 0;
    this.trailGeometry?.setDrawRange(0, 0);
    this.lastTrail?.set(Infinity, Infinity, Infinity);
    this.previousTime = -1;
    this.wheelAngle = 0;
    this.jets?.forEach((jet) => {
      jet.visible = false;
    });
    if (this.cameraMode === "orbit") this.frameScene();
  }

  render(snapshot, deltaSeconds = 0.016) {
    if (!snapshot) return;
    if (snapshot.time < this.previousTime) this.reset();
    const simulationDelta =
      this.previousTime < 0
        ? 0
        : Math.max(0, snapshot.time - this.previousTime);
    this.previousTime = snapshot.time;
    const { position, rotation, velocity } = snapshot;
    this.car.position.set(position.x, position.y, position.z);
    this.car.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.forward.set(1, 0, 0).applyQuaternion(this.car.quaternion);
    const rollingSpeed =
      this.forward.x * velocity.x +
      this.forward.y * velocity.y +
      this.forward.z * velocity.z;
    this.wheelAngle -=
      (rollingSpeed * Math.min(simulationDelta, 0.2)) / VEHICLE.wheelRadius;
    this.wheels.forEach((wheel, index) => {
      wheel.position.y =
        VEHICLE.mountHeight -
        VEHICLE.suspensionRest +
        (snapshot.wheelCompression?.[index] ?? 0);
      wheel.rotation.z = this.wheelAngle;
    });

    const thrust = THREE.MathUtils.clamp(snapshot.thrustLevel || 0, 0, 1);
    this.jets.forEach((jet, index) => {
      const output = snapshot.nozzles[index];
      const level =
        snapshot.availableThrust > 0
          ? THREE.MathUtils.clamp(
              output.thrust / (snapshot.availableThrust / NOZZLES.length),
              0,
              1,
            )
          : 0;
      jet.visible = output.thrust > 10;
      // Snapshot directions are body-frame exhaust vectors, opposite to each actual point force.
      jet.parent.quaternion.setFromUnitVectors(
        DOWN,
        new THREE.Vector3().copy(output.direction),
      );
      const pulse = 0.94 + 0.06 * Math.sin(snapshot.time * 49 + index * 2.3);
      jet.scale.set(
        0.55 + level * 0.7,
        (0.6 + level * 2.6) * pulse,
        0.55 + level * 0.7,
      );
    });
    this.dust.forEach((ring, index) => {
      const progress = (snapshot.time * 0.85 + index / 3) % 1;
      ring.visible = thrust > 0.02 && position.y < 7 && position.y > 0;
      ring.position.set(position.x, 0.035 + index * 0.008, position.z);
      ring.scale.setScalar(1 + progress * (2.8 + position.y * 0.4));
      ring.material.opacity =
        thrust * 0.12 * (1 - progress) * Math.max(0, 1 - position.y / 7);
    });

    if (
      snapshot.phase !== "ready" &&
      snapshot.phase !== "complete" &&
      this.car.position.distanceToSquared(this.lastTrail) > 0.14
    ) {
      if (this.trailCount === TRAIL_LIMIT) {
        this.trailPositions.copyWithin(0, 3);
        this.trailCount--;
      }
      this.trailPositions.set(
        [position.x, position.y, position.z],
        this.trailCount++ * 3,
      );
      this.trailGeometry.attributes.position.needsUpdate = true;
      this.trailGeometry.setDrawRange(0, this.trailCount);
      this.lastTrail.copy(this.car.position);
    }

    const dt = Math.min(Math.max(deltaSeconds, 0.001), 0.08);
    if (this.cameraMode === "follow") {
      const direction = Math.abs(velocity.x) > 1 ? Math.sign(velocity.x) : 1;
      this.desiredTarget.set(
        position.x + direction * 2.5,
        position.y + 0.4,
        position.z,
      );
      this.desiredCamera.set(
        position.x - direction * 12,
        Math.max(5, position.y + 6),
        position.z + 13,
      );
      const mix = 1 - Math.exp(-dt * 3.8);
      this.camera.position.lerp(this.desiredCamera, mix);
      this.controls.target.lerp(this.desiredTarget, mix);
      this.camera.lookAt(this.controls.target);
    } else if (this.cameraMode === "side") {
      const targetX = this.mode === "ramp" ? -19 : 0;
      const targetY =
        this.mode === "ramp"
          ? this.parameters.height * 0.44
          : this.parameters.height * 0.48;
      const distance =
        74 * Math.max(1, 1.3 / Math.max(this.camera.aspect, 0.5));
      this.desiredTarget.set(targetX, targetY, 0);
      this.desiredCamera.set(targetX, targetY + 4, distance);
      const mix = 1 - Math.exp(-dt * 4.5);
      this.camera.position.lerp(this.desiredCamera, mix);
      this.controls.target.lerp(this.desiredTarget, mix);
      this.camera.lookAt(this.controls.target);
    } else this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.cameraMode === "orbit") this.frameScene();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
