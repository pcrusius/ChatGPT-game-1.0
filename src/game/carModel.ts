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

/**
 * Greenhouse built as a tapered box: narrower and shorter at the roof, with raked front and
 * rear glass. A straight extrusion here reads as a slab bolted to the deck.
 */
function greenhouse(inflate: number, withRoof: boolean): THREE.BufferGeometry {
  const bw = 1.44 / 2 + inflate;
  const tw = 1.02 / 2 + inflate;
  const yBottom = 0.76 - inflate;
  const yTop = 1.34 + (withRoof ? 0 : -0.008);
  const zFront = -0.38 - inflate;
  const zRear = 1.5 + inflate;
  const zft = zFront + 0.78;
  const zrt = zRear - 0.56;

  const v = [
    [-bw, yBottom, zFront],
    [bw, yBottom, zFront],
    [bw, yBottom, zRear],
    [-bw, yBottom, zRear],
    [-tw, yTop, zft],
    [tw, yTop, zft],
    [tw, yTop, zrt],
    [-tw, yTop, zrt],
  ];

  const faces: number[][] = [
    [0, 1, 5],
    [0, 5, 4], // windshield
    [3, 7, 6],
    [3, 6, 2], // rear glass
    [1, 2, 6],
    [1, 6, 5], // right side
    [0, 4, 7],
    [0, 7, 3], // left side
  ];
  if (withRoof) {
    faces.push([4, 5, 6], [4, 6, 7]);
  }

  const positions: number[] = [];
  for (const face of faces) {
    for (const index of face) positions.push(...v[index]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
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
    color: 0x0e151f,
    metalness: 0.1,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.8,
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

  const body = new THREE.Mesh(extrude(bodyProfile(), 1.62, 0.09), paint);
  add(body);

  // Solid body-coloured cabin with a marginally larger opaque glazing shell over its sides.
  // Transmissive glass disappears against the sky and makes the car look like a roadster.
  const cabin = new THREE.Mesh(greenhouse(0, true), paint);
  add(cabin);

  const glazing = new THREE.Mesh(greenhouse(0.012, false), glass);
  add(glazing, false);

  const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.72), stripe);
  roofStripe.position.set(0, 1.35, 0.68);
  add(roofStripe, false);

  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.4), stripe);
  hoodStripe.position.set(0, 0.72, -1.34);
  add(hoodStripe, false);

  const deckStripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.5), stripe);
  deckStripe.position.set(0, 0.88, 1.74);
  add(deckStripe, false);

  // Sills, splitter and diffuser.
  for (const x of [-0.88, 0.88]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 2.2), accent);
    sill.position.set(x, 0.29, 0.1);
    add(sill);
  }

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.07, 0.42), accent);
  splitter.position.set(0, 0.2, -2.14);
  add(splitter);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.22, 0.34), accent);
  diffuser.position.set(0, 0.28, 2.12);
  add(diffuser);
  for (const x of [-0.44, 0, 0.44]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.32), rubber);
    fin.position.set(x, 0.28, 2.14);
    add(fin, false);
  }

  // Rear fascia with a light bar. Lamps have to clear the extruded body or they end up
  // buried inside it and never show.
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.28, 0.1), accent);
  fascia.position.set(0, 0.6, 2.26);
  add(fascia, false);

  for (const x of [-0.52, 0.52]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.08), tailMat);
    lamp.position.set(x, 0.64, 2.31);
    add(lamp, false);
  }
  const centreBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.07), tailMat);
  centreBar.position.set(0, 0.64, 2.31);
  add(centreBar, false);

  // Ducktail spoiler.
  for (const x of [-0.6, 0.6]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.19, 0.1), accent);
    stand.position.set(x, 0.95, 1.9);
    add(stand);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.07, 0.36), paint);
  wing.position.set(0, 1.05, 1.9);
  wing.rotation.x = -0.1;
  add(wing);

  // Front end.
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.1), headMat);
    lamp.position.set(x, 0.58, -2.29);
    lamp.rotation.x = 0.12;
    add(lamp, false);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.08), rubber);
  grille.position.set(0, 0.4, -2.3);
  add(grille, false);
  for (const x of [-0.66, 0.66]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), rubber);
    intake.position.set(x, 0.36, -2.3);
    add(intake, false);
  }

  for (const x of [-0.98, 0.98]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.13), paint);
    mirror.position.set(x, 0.86, -0.26);
    add(mirror);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), accent);
    stalk.position.set(x * 0.86, 0.84, -0.26);
    add(stalk, false);
  }

  for (const x of [-0.32, 0.32]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 12), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 0.34, 2.3);
    add(pipe, false);
  }

  // Wheels sit slightly proud of the body and get arches so they read from behind.
  const wheels: THREE.Group[] = [];
  const archGeo = new THREE.TorusGeometry(0.51, 0.1, 8, 18, Math.PI);
  for (const [x, z] of [
    [-0.94, -1.34],
    [0.94, -1.34],
    [-0.94, 1.38],
    [0.94, 1.38],
  ] as [number, number][]) {
    const wheel = makeWheel();
    wheel.position.set(x, 0.38, z);
    car.add(wheel);
    wheels.push(wheel);

    const arch = new THREE.Mesh(archGeo, paint);
    arch.position.set(x * 0.94, 0.38, z);
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
