import * as THREE from "three";
import { SKINS, type SkinId } from "./config";

export interface CarColors {
  paint: number;
  accent: number;
  stripe: number;
  metalness: number;
}

export function getSkinColors(id: SkinId): CarColors {
  const skin = SKINS.find((item) => item.id === id) ?? SKINS[0];
  return {
    paint: skin.paint,
    accent: skin.accent,
    stripe: skin.stripe,
    metalness: skin.metalness,
  };
}

/** Side profile of the body below the belt line, drawn in length (x) / height (y). */
function bodyProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-2.02, 0.22);
  s.quadraticCurveTo(-2.26, 0.24, -2.24, 0.44);
  s.lineTo(-2.16, 0.6);
  s.quadraticCurveTo(-2.0, 0.68, -1.72, 0.69);
  s.lineTo(-0.95, 0.73);
  s.quadraticCurveTo(-0.5, 0.76, -0.24, 0.82);
  s.lineTo(1.12, 0.88);
  s.lineTo(1.78, 0.9);
  s.quadraticCurveTo(2.12, 0.9, 2.2, 0.78);
  s.lineTo(2.24, 0.5);
  s.quadraticCurveTo(2.24, 0.24, 2.0, 0.22);
  s.closePath();
  return s;
}

/** Greenhouse (glass cabin) profile. */
function cabinProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.34, 0.76);
  s.quadraticCurveTo(0.0, 1.12, 0.26, 1.19);
  s.lineTo(0.82, 1.2);
  s.quadraticCurveTo(1.24, 1.16, 1.58, 0.86);
  s.lineTo(1.62, 0.76);
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function paintMaterial(color: number, metalness: number): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: Math.min(0.55, metalness),
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.5,
  });
  mat.userData.role = "paint";
  return mat;
}

function makeWheel(): THREE.Group {
  const wheel = new THREE.Group();

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.3, 22),
    new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.88, metalness: 0.08 }),
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  wheel.add(tire);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.32, 16),
    new THREE.MeshStandardMaterial({ color: 0xd6dde4, metalness: 0.95, roughness: 0.16, envMapIntensity: 1.6 }),
  );
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);

  const spokeMat = new THREE.MeshStandardMaterial({
    color: 0xeef3f8,
    metalness: 0.9,
    roughness: 0.18,
    envMapIntensity: 1.6,
  });
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.05), spokeMat);
    spoke.rotation.x = (i / 6) * Math.PI;
    wheel.add(spoke);
  }

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.34, 14),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.42 }),
  );
  disc.rotation.z = Math.PI / 2;
  wheel.add(disc);

  return wheel;
}

export function createSportsCar(colors: CarColors, compact = false): THREE.Group {
  const car = new THREE.Group();
  if (compact) car.scale.setScalar(0.94);

  const paint = paintMaterial(colors.paint, colors.metalness);

  const accent = new THREE.MeshStandardMaterial({
    color: colors.accent,
    metalness: 0.45,
    roughness: 0.45,
    envMapIntensity: 1.1,
  });
  accent.userData.role = "accent";

  const stripe = new THREE.MeshStandardMaterial({
    color: colors.stripe,
    metalness: 0.5,
    roughness: 0.3,
    envMapIntensity: 1.2,
  });
  stripe.userData.role = "stripe";

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x121a24,
    metalness: 0.2,
    roughness: 0.06,
    transmission: 0.55,
    thickness: 0.4,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 2,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.85, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xe2e8ee,
    metalness: 1,
    roughness: 0.12,
    envMapIntensity: 1.8,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfffaea,
    emissive: 0xfff0c0,
    emissiveIntensity: 2.6,
    roughness: 0.18,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2b1e,
    emissive: 0xff1408,
    emissiveIntensity: 2.4,
    roughness: 0.22,
  });

  const add = (mesh: THREE.Mesh, shadow = true): THREE.Mesh => {
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    car.add(mesh);
    return mesh;
  };

  // Body is deliberately narrower than the track so the wheels and arches stay visible.
  const body = new THREE.Mesh(extrude(bodyProfile(), 1.44, 0.09), paint);
  add(body);

  // The greenhouse is solid paint with separate glazing panels; a fully glass cabin reads
  // as an open cockpit from the chase camera.
  const cabin = new THREE.Mesh(extrude(cabinProfile(), 1.24, 0.05), paint);
  add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.58, 0.05), glass);
  windshield.position.set(0, 0.99, -0.09);
  windshield.rotation.x = -0.95;
  add(windshield, false);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.52, 0.05), glass);
  rearGlass.position.set(0, 1.04, 1.24);
  rearGlass.rotation.x = 1.14;
  add(rearGlass, false);

  for (const x of [-0.69, 0.69]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.92), glass);
    sideGlass.position.set(x, 1.0, 0.56);
    add(sideGlass, false);
  }

  const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.7), stripe);
  roofStripe.position.set(0, 1.25, 0.53);
  add(roofStripe, false);

  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.4), stripe);
  hoodStripe.position.set(0, 0.74, -1.32);
  add(hoodStripe, false);

  const deckStripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.5), stripe);
  deckStripe.position.set(0, 0.91, 1.72);
  add(deckStripe, false);

  // Sills, splitter and diffuser.
  for (const x of [-0.8, 0.8]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 2.2), accent);
    sill.position.set(x, 0.3, 0.1);
    add(sill);
  }

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.07, 0.42), accent);
  splitter.position.set(0, 0.21, -2.14);
  add(splitter);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 0.36), accent);
  diffuser.position.set(0, 0.29, 2.12);
  add(diffuser);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.34), rubber);
    fin.position.set(-0.51 + i * 0.34, 0.29, 2.14);
    add(fin, false);
  }

  // Rear fascia with a light bar.
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.1), accent);
  fascia.position.set(0, 0.62, 2.22);
  add(fascia, false);

  for (const x of [-0.46, 0.46]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.07), tailMat);
    lamp.position.set(x, 0.66, 2.26);
    add(lamp, false);
  }
  const centreBar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), tailMat);
  centreBar.position.set(0, 0.66, 2.26);
  add(centreBar, false);

  // Ducktail spoiler.
  for (const x of [-0.55, 0.55]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), accent);
    stand.position.set(x, 0.98, 1.88);
    add(stand);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.36), paint);
  wing.position.set(0, 1.09, 1.88);
  wing.rotation.x = -0.1;
  add(wing);

  // Front end.
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.1), headMat);
    lamp.position.set(x, 0.6, -2.2);
    lamp.rotation.x = 0.12;
    add(lamp, false);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.08), rubber);
  grille.position.set(0, 0.4, -2.24);
  add(grille, false);
  for (const x of [-0.66, 0.66]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), rubber);
    intake.position.set(x, 0.36, -2.2);
    add(intake, false);
  }

  for (const x of [-0.88, 0.88]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.13), paint);
    mirror.position.set(x, 0.87, -0.26);
    add(mirror);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.05), accent);
    stalk.position.set(x * 0.84, 0.85, -0.26);
    add(stalk, false);
  }

  for (const x of [-0.3, 0.3]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 12), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.34, 2.3);
    add(pipe, false);
  }

  // Wheels sit slightly proud of the body and get arches so they read from behind.
  const wheels: THREE.Group[] = [];
  const archGeo = new THREE.TorusGeometry(0.5, 0.1, 8, 18, Math.PI);
  for (const [x, z] of [
    [-0.86, -1.32],
    [0.86, -1.32],
    [-0.86, 1.36],
    [0.86, 1.36],
  ] as [number, number][]) {
    const wheel = makeWheel();
    wheel.position.set(x, 0.38, z);
    car.add(wheel);
    wheels.push(wheel);

    const arch = new THREE.Mesh(archGeo, paint);
    arch.position.set(x * 0.93, 0.38, z);
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = true;
    car.add(arch);
  }

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  blob.renderOrder = -1;
  car.add(blob);

  car.userData.wheels = wheels;
  return car;
}

export function applyCarColors(car: THREE.Group, colors: CarColors): void {
  car.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (Array.isArray(mat) || !(mat instanceof THREE.MeshStandardMaterial)) return;
    switch (mat.userData.role) {
      case "paint":
        mat.color.setHex(colors.paint);
        mat.metalness = Math.min(0.55, colors.metalness);
        break;
      case "accent":
        mat.color.setHex(colors.accent);
        break;
      case "stripe":
        mat.color.setHex(colors.stripe);
        break;
      default:
        break;
    }
  });
}

export function createTrafficCar(color = 0xc8cdd4): THREE.Group {
  return createSportsCar({ paint: color, accent: 0x1a1c20, stripe: 0x2a2e34, metalness: 0.4 }, true);
}
