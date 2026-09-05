import * as THREE from "three";

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  shake = 0;
  private look = new THREE.Vector3();
  private ideal = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
    this.camera.position.set(0, 5.2, 10.5);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  impact(amount = 0.55): void {
    this.shake = Math.max(this.shake, amount);
  }

  menu(carX: number, dt: number): void {
    this.ideal.set(carX * 0.35 - 2.8, 3.4, 6.4);
    this.camera.position.lerp(this.ideal, 1 - Math.exp(-dt * 2.4));
    this.look.set(carX * 0.4, 0.7, -4);
    this.camera.lookAt(this.look);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 52, 0.08);
    this.camera.updateProjectionMatrix();
  }

  garage(dt: number): void {
    this.ideal.set(3.4, 1.7, 5.2);
    this.camera.position.lerp(this.ideal, 1 - Math.exp(-dt * 3));
    this.look.set(0, 0.7, 0);
    this.camera.lookAt(this.look);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 42, 0.1);
    this.camera.updateProjectionMatrix();
  }

  /** Places the camera at its chase pose immediately so a new run does not start mid-swoop. */
  snapToChase(): void {
    this.shake = 0;
    this.camera.position.set(0, 4.6, 9.2);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    this.look.set(0, 0.85, -12);
    this.camera.lookAt(this.look);
  }

  chase(carX: number, carY: number, speed: number, dt: number): void {
    const speedT = THREE.MathUtils.clamp((speed - 38) / 48, 0, 1);
    this.ideal.set(carX * 0.22, 4.6 + carY * 0.22, 9.2 + speedT * 1.6);
    this.camera.position.lerp(this.ideal, 1 - Math.exp(-dt * 6.5));
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    this.look.set(carX * 0.12, 0.85 + carY * 0.15, -12);
    this.camera.lookAt(this.look);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 58 + speedT * 10, 0.08);
    this.camera.updateProjectionMatrix();
  }
}
