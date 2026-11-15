// The bomb: the objective beyond killing. The player carries it; holding E inside
// a site plants it (3.2 s, standing in the zone); a planted bomb ticks 40 s to an
// explosion the attackers win, unless a defender stands in the site holding E for
// 5 s to defuse it. The mesh is a small amber box with a blinking light, so the
// planted bomb reads from across the map.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5;
const FUSE_TIME = 40;

export function createBomb(scene) {
  const mesh = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 }),
  );
  box.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  light.position.set(0, 0.13, 0);
  mesh.add(box, light);
  mesh.visible = false;
  scene.add(mesh);

  const state = { mode: 'carried', site: null, progress: 0, fuse: FUSE_TIME, blink: 0 };

  return {
    state,
    mesh,
    // Called every step with the planter's situation; returns an event or null.
    // holdingE: the player holds E; inSite: 'A' | 'B' | null; defuser: a defender
    // bot standing in the planted site (or null).
    step(dt, holdingE, inSite, defuser) {
      state.blink += dt;
      light.material.color.setHex(Math.floor(state.blink * 2) % 2 === 0 ? 0xf0a830 : 0x571f16);
      if (state.mode === 'carried') {
        if (holdingE && inSite) {
          state.progress += dt / PLANT_TIME;
          state.site = inSite;
          if (state.progress >= 1) {
            state.mode = 'planted';
            state.fuse = FUSE_TIME;
            state.progress = 0;
            mesh.visible = true;
            return 'planted';
          }
        } else {
          state.progress = 0;
          state.site = null;
        }
        return null;
      }
      if (state.mode === 'planted') {
        state.fuse -= dt;
        if (defuser) {
          state.progress += dt / DEFUSE_TIME;
          if (state.progress >= 1) {
            state.mode = 'defused';
            mesh.visible = false;
            return 'defused';
          }
        } else {
          state.progress = 0;
        }
        if (state.fuse <= 0) {
          state.mode = 'exploded';
          mesh.visible = false;
          return 'exploded';
        }
        return null;
      }
      return null;
    },
    place(x, z) {
      mesh.position.set(x, 0.1, z);
      mesh.visible = true;
    },
    reset() {
      state.mode = 'carried';
      state.site = null;
      state.progress = 0;
      state.fuse = FUSE_TIME;
      mesh.visible = false;
    },
    plantedSite() {
      return state.mode === 'planted' ? state.site : null;
    },
  };
}

export { PLANT_TIME, DEFUSE_TIME, FUSE_TIME };
