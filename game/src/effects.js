// Tracers, impact sparks and the bomb's explosion — all pooled and preallocated,
// so a firefight never allocates. Tracers are thin stretched boxes from muzzle to
// hit point; sparks are one THREE.Points cloud whose vertices are recycled.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 12;
const SPARK_COUNT = 240;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIdx = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26);
  scene.add(boomLight);
  let boomLife = 0;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();

  return {
    tracer(a, b) {
      const t = tracers[tracerIdx];
      tracerIdx = (tracerIdx + 1) % TRACER_COUNT;
      from.copy(a);
      to.copy(b);
      const len = from.distanceTo(to);
      if (len < 0.5) return;
      t.mesh.visible = true;
      t.mesh.position.copy(from).add(to).multiplyScalar(0.5);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, len);
      t.life = 0.12;
    },
    sparksAt(p, count, speed) {
      for (let n = 0; n < count; n += 1) {
        const i = sparkIdx;
        sparkIdx = (sparkIdx + 1) % SPARK_COUNT;
        sparkPos[i * 3] = p.x;
        sparkPos[i * 3 + 1] = p.y;
        sparkPos[i * 3 + 2] = p.z;
        sparkVel[i * 3] = (Math.random() * 2 - 1) * speed;
        sparkVel[i * 3 + 1] = Math.random() * speed;
        sparkVel[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
        sparkLife[i] = 0.35 + Math.random() * 0.25;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    explosion(x, y, z) {
      boom.position.set(x, y + 0.4, z);
      boom.visible = true;
      boom.scale.setScalar(0.5);
      boomLife = 0.7;
      boomLight.position.set(x, y + 1.5, z);
      boomLight.intensity = 60;
    },
    step(dt) {
      for (const t of tracers) {
        if (!t.mesh.visible) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      let any = false;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        if (sparkLife[i] <= 0) continue;
        any = true;
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -10;
      }
      if (any) sparkGeo.attributes.position.needsUpdate = true;
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / 0.7;
        boom.scale.setScalar(0.5 + k * 11);
        boom.material.opacity = Math.max(0, 0.85 * (1 - k));
        boomLight.intensity = Math.max(0, 60 * (1 - k));
        if (boomLife <= 0) boom.visible = false;
      }
    },
  };
}
