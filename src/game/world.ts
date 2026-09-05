import * as THREE from "three";
import { LANE_WIDTH, ROAD_WIDTH, SHOULDER_WIDTH } from "./config";

const ROAD_LENGTH = 900;
const ROAD_CENTER_Z = -ROAD_LENGTH / 2 + 60;

export const SKY_TOP = 0x0b1f3f;
export const SKY_MID = 0x2f6fae;
export const HORIZON = 0xe6b98a;
export const FOG_COLOR = 0xc8b49c;

function makeSkyTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${SKY_TOP.toString(16).padStart(6, "0")}`);
  grad.addColorStop(0.45, `#${SKY_MID.toString(16).padStart(6, "0")}`);
  grad.addColorStop(0.78, "#8fb4d6");
  grad.addColorStop(1, `#${HORIZON.toString(16).padStart(6, "0")}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function makeAsphaltTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2b2d33";
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + n));
  }
  ctx.putImageData(image, 0, 0);

  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, 0);
    ctx.lineTo(Math.random() * size, size);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 40);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Recycled {
  object: THREE.Object3D;
  baseZ: number;
}

export class World {
  readonly group = new THREE.Group();
  readonly sunLight: THREE.DirectionalLight;
  private asphalt: THREE.Texture;
  private dashes: Recycled[] = [];
  private rails: Recycled[] = [];
  private lamps: Recycled[] = [];
  private props: Recycled[] = [];
  private scrolled = 0;

  private readonly dashSpacing = 9;
  private readonly railSpacing = 7;
  private readonly lampSpacing = 46;
  private readonly propSpacing = 13;
  private readonly span = 340;

  constructor(scene: THREE.Scene) {
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(FOG_COLOR, 90, 300);

    const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x3a2f26, 0.85);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0x8fa6c4, 0.35);
    scene.add(ambient);

    this.sunLight = new THREE.DirectionalLight(0xffd9a8, 2.1);
    this.sunLight.position.set(-38, 52, -18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 180;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.bias = -0.0008;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.5);
    rim.position.set(24, 18, 26);
    scene.add(rim);

    this.asphalt = makeAsphaltTexture();
    this.buildGround();
    this.buildRoad();
    this.buildDashes();
    this.buildGuardrails();
    this.buildLamps();
    this.buildScenery();
    this.buildDistantHills();

    scene.add(this.group);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, ROAD_LENGTH + 200),
      new THREE.MeshStandardMaterial({ color: 0x4d5b3c, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, ROAD_CENTER_Z);
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private buildRoad(): void {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      new THREE.MeshStandardMaterial({ map: this.asphalt, roughness: 0.92, metalness: 0.04 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, ROAD_CENTER_Z);
    road.receiveShadow = true;
    this.group.add(road);

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x6b6255, roughness: 1 });
    for (const dir of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(SHOULDER_WIDTH, ROAD_LENGTH), shoulderMat);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(dir * (ROAD_WIDTH / 2 + SHOULDER_WIDTH / 2), -0.02, ROAD_CENTER_Z);
      shoulder.receiveShadow = true;
      this.group.add(shoulder);
    }

    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xf2f2f2,
      roughness: 0.6,
      emissive: 0x222222,
    });
    for (const dir of [-1, 1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.26, ROAD_LENGTH), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(dir * (ROAD_WIDTH / 2 - 0.42), 0.012, ROAD_CENTER_Z);
      this.group.add(line);
    }
  }

  private buildDashes(): void {
    const geo = new THREE.PlaneGeometry(0.22, 3.4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5e9c8, roughness: 0.55, emissive: 0x2a2313 });
    const count = Math.ceil(this.span / this.dashSpacing);
    for (const x of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
      for (let i = 0; i < count; i++) {
        const dash = new THREE.Mesh(geo, mat);
        dash.rotation.x = -Math.PI / 2;
        const z = 20 - i * this.dashSpacing;
        dash.position.set(x, 0.014, z);
        this.group.add(dash);
        this.dashes.push({ object: dash, baseZ: z });
      }
    }
  }

  private buildGuardrails(): void {
    const postGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7c8288, metalness: 0.7, roughness: 0.5 });
    const railGeo = new THREE.BoxGeometry(0.1, 0.34, this.railSpacing);
    const railMat = new THREE.MeshStandardMaterial({ color: 0xc3ccd4, metalness: 0.85, roughness: 0.32 });
    const railX = ROAD_WIDTH / 2 + SHOULDER_WIDTH - 0.4;
    const count = Math.ceil(this.span / this.railSpacing);

    for (const dir of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const z = 20 - i * this.railSpacing;
        const unit = new THREE.Group();
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.45;
        post.castShadow = true;
        unit.add(post);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(0, 0.78, -this.railSpacing / 2);
        rail.castShadow = true;
        unit.add(rail);
        unit.position.set(dir * railX, 0, z);
        this.group.add(unit);
        this.rails.push({ object: unit, baseZ: z });
      }
    }
  }

  private buildLamps(): void {
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 8.4, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x565d64, metalness: 0.7, roughness: 0.45 });
    const armGeo = new THREE.BoxGeometry(2.6, 0.14, 0.14);
    const headGeo = new THREE.BoxGeometry(1.05, 0.2, 0.5);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cf,
      emissive: 0xffd98a,
      emissiveIntensity: 1.5,
      roughness: 0.4,
    });
    const signPost = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6);
    const signGeo = new THREE.BoxGeometry(2.2, 1.2, 0.08);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x1e6b3a, roughness: 0.7 });
    const signFace = new THREE.MeshStandardMaterial({ color: 0xe8f2e8, roughness: 0.6 });

    const count = Math.ceil(this.span / this.lampSpacing);
    for (let i = 0; i < count * 2; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const z = 20 - Math.floor(i / 2) * this.lampSpacing - (dir > 0 ? this.lampSpacing / 2 : 0);
      const unit = new THREE.Group();

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 4.2;
      pole.castShadow = true;
      unit.add(pole);

      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(-dir * 1.3, 8.3, 0);
      unit.add(arm);

      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(-dir * 2.4, 8.16, 0);
      unit.add(head);

      if (i % 6 === 3) {
        const sp = new THREE.Mesh(signPost, poleMat);
        sp.position.set(-dir * 0.9, 1.6, 2.5);
        unit.add(sp);
        const board = new THREE.Mesh(signGeo, [signMat, signMat, signMat, signMat, signFace, signMat]);
        board.position.set(-dir * 0.9, 3.4, 2.5);
        board.castShadow = true;
        unit.add(board);
      }

      unit.position.set(dir * (ROAD_WIDTH / 2 + SHOULDER_WIDTH + 1.1), 0, z);
      this.group.add(unit);
      this.lamps.push({ object: unit, baseZ: z });
    }
  }

  private buildScenery(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.95 });
    const leafGeo = new THREE.ConeGeometry(1.5, 4, 7);
    const leafMats = [0x2f6b39, 0x3c7a44, 0x275c33].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }),
    );
    const rockGeo = new THREE.DodecahedronGeometry(0.9, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7468, roughness: 1, flatShading: true });

    const count = Math.ceil(this.span / this.propSpacing);
    for (let i = 0; i < count * 2; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const z = 20 - Math.floor(i / 2) * this.propSpacing - (dir > 0 ? this.propSpacing / 2 : 0);
      const unit = new THREE.Group();

      if (Math.random() < 0.78) {
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.1;
        trunk.castShadow = true;
        unit.add(trunk);
        const leaves = new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]);
        leaves.position.y = 3.6;
        leaves.castShadow = true;
        unit.add(leaves);
        const scale = 0.75 + Math.random() * 0.85;
        unit.scale.setScalar(scale);
      } else {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.y = 0.5;
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        unit.add(rock);
      }

      const offset = 4 + Math.random() * 26;
      unit.position.set(dir * (ROAD_WIDTH / 2 + SHOULDER_WIDTH + offset), 0, z);
      this.group.add(unit);
      this.props.push({ object: unit, baseZ: z });
    }
  }

  private buildDistantHills(): void {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x5c6b7a, roughness: 1, flatShading: true });
    const farMat = new THREE.MeshStandardMaterial({ color: 0x7b8899, roughness: 1, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const far = i % 3 === 0;
      const radius = 30 + Math.random() * 60;
      const height = 24 + Math.random() * 52;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), far ? farMat : hillMat);
      hill.position.set(
        dir * (90 + Math.random() * 190),
        height / 2 - 6,
        -180 - Math.random() * 520,
      );
      hill.rotation.y = Math.random() * Math.PI;
      this.group.add(hill);
    }
  }

  private recycle(items: Recycled[], spacing: number, count: number): void {
    const total = spacing * count;
    for (const item of items) {
      let z = item.baseZ + this.scrolled;
      z = ((((z - 20) % total) + total) % total) + 20 - total;
      item.object.position.z = z;
    }
  }

  scroll(distanceDelta: number): void {
    this.scrolled += distanceDelta;
    this.asphalt.offset.y -= distanceDelta / (ROAD_LENGTH / 40);

    this.recycle(this.dashes, this.dashSpacing, this.dashes.length / 2);
    this.recycle(this.rails, this.railSpacing, this.rails.length / 2);
    this.recycle(this.lamps, this.lampSpacing, this.lamps.length / 2);
    this.recycle(this.props, this.propSpacing, this.props.length / 2);
  }

  followShadow(targetZ: number): void {
    this.sunLight.position.set(-38, 52, targetZ - 18);
    this.sunLight.target.position.set(0, 0, targetZ - 24);
    this.sunLight.target.updateMatrixWorld();
  }
}
