// The HE grenade: thrown on an arc, bounces off the map, fuses after 1.6 s and
// hurts everyone in 6 m, less the further away. One mesh per live grenade, pooled
// to two, so throwing never allocates.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const FUSE = 1.6;
const RADIUS = 6;
const MAX_DAMAGE = 110;

export function createGrenades(scene, colliders) {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.5, metalness: 0.4 });
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const pool = [];
  for (let i = 0; i < 2; i += 1) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, active: false, vel: new THREE.Vector3(), fuse: 0 });
  }

  function overlaps(x, y, z) {
    for (const c of colliders) {
      if (x > c.min.x - 0.09 && x < c.max.x + 0.09 && y > c.min.y - 0.09 && y < c.max.y + 0.09 && z > c.min.z - 0.09 && z < c.max.z + 0.09) return c;
    }
    return null;
  }

  return {
    throwFrom(origin, direction) {
      const slot = pool.find((g) => !g.active);
      if (!slot) return false;
      slot.active = true;
      slot.fuse = FUSE;
      slot.mesh.visible = true;
      slot.mesh.position.copy(origin);
      slot.vel.copy(direction).multiplyScalar(14);
      slot.vel.y += 4.5;
      return true;
    },
    // Steps all live grenades; onExplode(x, y, z) is called for each detonation.
    step(dt, onExplode) {
      for (const g of pool) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        const p = g.mesh.position;
        const nx = p.x + g.vel.x * dt;
        const ny = p.y + g.vel.y * dt;
        const nz = p.z + g.vel.z * dt;
        const hit = overlaps(nx, ny, nz);
        if (hit) {
          // Bounce off the face the grenade met: reverse the component that
          // moved into the box and lose a little energy each bounce.
          if (g.vel.x !== 0 && (nx <= hit.min.x || nx >= hit.max.x)) g.vel.x *= -0.45;
          if (g.vel.y !== 0 && (ny <= hit.min.y || ny >= hit.max.y)) g.vel.y *= -0.45;
          if (g.vel.z !== 0 && (nz <= hit.min.z || nz >= hit.max.z)) g.vel.z *= -0.45;
        } else {
          p.set(nx, ny, nz);
        }
        if (p.y < 0.09) {
          p.y = 0.09;
          g.vel.y = Math.abs(g.vel.y) * 0.4;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        }
        if (g.fuse <= 0) {
          g.active = false;
          g.mesh.visible = false;
          onExplode(p.x, p.y, p.z);
        }
      }
    },
    reset() {
      for (const g of pool) {
        g.active = false;
        g.mesh.visible = false;
      }
    },
    damageAt(distance) {
      if (distance >= RADIUS) return 0;
      return Math.round(MAX_DAMAGE * (1 - distance / RADIUS) + 15);
    },
  };
}
