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

function paintMaterial(color: number, metalness: number, roughness = 0.28): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    envMapIntensity: 1.2,
  });
}

function makeWheel(): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.92, metalness: 0.1 }),
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  wheel.add(tire);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.92, roughness: 0.18 }),
  );
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.32, 10),
    new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.7, roughness: 0.3 }),
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.22, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe8eef4, metalness: 0.85, roughness: 0.2 }),
    );
    spoke.position.y = 0.1;
    spoke.rotation.z = (i / 5) * Math.PI * 2;
    wheel.add(spoke);
  }
  return wheel;
}

export function createSportsCar(colors: CarColors, compact = false): THREE.Group {
  const car = new THREE.Group();
  const scale = compact ? 0.92 : 1;
  car.scale.setScalar(scale);

  const paint = paintMaterial(colors.paint, colors.metalness);
  paint.userData.role = "paint";
  const accent = paintMaterial(colors.accent, Math.min(0.95, colors.metalness + 0.1), 0.34);
  accent.userData.role = "accent";
  const stripe = paintMaterial(colors.stripe, 0.55, 0.32);
  stripe.userData.role = "stripe";
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x8ea4bb,
    metalness: 0.15,
    roughness: 0.04,
    transparent: true,
    opacity: 0.62,
    transmission: 0.35,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.4, roughness: 0.55 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdde3ea, metalness: 0.95, roughness: 0.14 });
  const head = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xfff1c2,
    emissiveIntensity: 2.4,
    metalness: 0.4,
    roughness: 0.2,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0xff2a22,
    emissive: 0xff120c,
    emissiveIntensity: 1.9,
    metalness: 0.3,
    roughness: 0.25,
  });

  const add = (mesh: THREE.Mesh, shadow = true) => {
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    car.add(mesh);
    return mesh;
  };

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.22, 4.1), accent);
  chassis.position.y = 0.36;
  add(chassis);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.4, 3.55), paint);
  body.position.set(0, 0.58, 0.08);
  add(body);

  const sideSkirtL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 2.6), accent);
  sideSkirtL.position.set(-0.94, 0.38, 0.1);
  add(sideSkirtL);
  const sideSkirtR = sideSkirtL.clone();
  sideSkirtR.position.x = 0.94;
  add(sideSkirtR);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.2), paint);
  hood.position.set(0, 0.74, -1.12);
  add(hood);

  const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 3.4), stripe);
  stripeMesh.position.set(0, 0.8, -0.05);
  add(stripeMesh, false);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.58), paint);
  nose.position.set(0, 0.52, -1.9);
  add(nose);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.06, 0.34), black);
  splitter.position.set(0, 0.3, -2.12);
  add(splitter);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 1.28), paint);
  cabin.position.set(0, 0.94, 0.18);
  add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.08, 1.05), paint);
  roof.position.set(0, 1.16, 0.22);
  add(roof);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.4, 0.06), glass);
  windshield.position.set(0, 0.94, -0.48);
  windshield.rotation.x = -0.52;
  add(windshield, false);

  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.34, 0.06), glass);
  rearGlass.position.set(0, 0.94, 0.84);
  rearGlass.rotation.x = 0.46;
  add(rearGlass, false);

  for (const x of [-0.78, 0.78]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.9), glass);
    window.position.set(x, 0.94, 0.16);
    add(window, false);
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.22, 0.28), accent);
  bumper.position.set(0, 0.4, 2.08);
  add(bumper);

  const spoilerArmL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.08), black);
  spoilerArmL.position.set(-0.55, 1.08, 1.55);
  add(spoilerArmL);
  const spoilerArmR = spoilerArmL.clone();
  spoilerArmR.position.x = 0.55;
  add(spoilerArmR);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.32), paint);
  spoiler.position.set(0, 1.2, 1.55);
  add(spoiler);

  for (const x of [-0.58, 0.58]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.08), head);
    lamp.position.set(x, 0.54, -2.18);
    add(lamp, false);
  }

  for (const x of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.07), tail);
    lamp.position.set(x, 0.56, 2.22);
    add(lamp, false);
  }

  const grill = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.06), black);
  grill.position.set(0, 0.46, -2.2);
  add(grill, false);

  for (const x of [-0.82, 0.82]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.12), paint);
    mirror.position.set(x, 0.84, -0.18);
    add(mirror);
  }

  for (const x of [-0.38, 0.38]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), chrome);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(x, 0.3, 2.22);
    add(exhaust, false);
  }

  const wheels: THREE.Group[] = [];
  const wheelPositions: [number, number, number][] = [
    [-0.86, 0.38, -1.28],
    [0.86, 0.38, -1.28],
    [-0.86, 0.38, 1.32],
    [0.86, 0.38, 1.32],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = makeWheel();
    wheel.position.set(x, y, z);
    car.add(wheel);
    wheels.push(wheel);
  }

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  car.add(blob);

  car.userData.wheels = wheels;
  car.userData.paintMats = [paint, accent, stripe];
  return car;
}

export function applyCarColors(car: THREE.Group, colors: CarColors): void {
  car.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (!Array.isArray(mat) && mat instanceof THREE.MeshStandardMaterial && mat.userData.role) {
      if (mat.userData.role === "paint") {
        mat.color.setHex(colors.paint);
        mat.metalness = colors.metalness;
      } else if (mat.userData.role === "accent") {
        mat.color.setHex(colors.accent);
      } else if (mat.userData.role === "stripe") {
        mat.color.setHex(colors.stripe);
      }
    }
  });
}

export function createTrafficCar(color = 0xc8cdd4): THREE.Group {
  return createSportsCar(
    {
      paint: color,
      accent: 0x1a1c20,
      stripe: 0x2a2e34,
      metalness: 0.5,
    },
    true,
  );
}
