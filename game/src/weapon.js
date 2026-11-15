// Four weapons and the buy catalog. Each weapon owns its numbers (damage, headshot
// multiplier, magazine, fire gap, spread, reload, price); main.js owns the ray and
// the damage, so a weapon never needs to know what it hit. The view model is rebuilt
// from boxes when the weapon changes — a rifle is long, an SMG short, a DMR thin
// with a scope, a pistol small — so the weapon in hand reads at a glance.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, damage: 22, headMult: 4, mag: 12, reserve: 48, gap: 0.18, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, kick: 0.04 },
  rifle: { id: 'rifle', name: 'VK-7 Vulture', short: 'VK-7', price: 2700, damage: 26, headMult: 4, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.055 },
  smg: { id: 'smg', name: 'K-9 Kestrel', short: 'K-9', price: 1500, damage: 18, headMult: 4, mag: 32, reserve: 96, gap: 0.07, auto: true, reload: 1.7, spreadStill: 0.004, spreadMove: 0.034, kick: 0.035 },
  dmr: { id: 'dmr', name: 'LS-88 Longshot', short: 'LS-88', price: 4000, damage: 62, headMult: 4, mag: 5, reserve: 20, gap: 0.55, auto: false, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.02, kick: 0.09 },
};
export const WEAPON_ORDER = ['pistol', 'rifle', 'smg', 'dmr'];
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.25 });

  let model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.17),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // Parts per weapon, in view-model space (x right, y up, z back toward the eye).
  function buildModel(def) {
    while (model.children.length) model.remove(model.children[0]);
    const add = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      model.add(mesh);
    };
    if (def.id === 'pistol') {
      add(0.05, 0.07, 0.2, 0, 0, -0.1, body);
      add(0.045, 0.12, 0.05, 0, -0.08, 0.02, grip);
    } else if (def.id === 'smg') {
      add(0.08, 0.09, 0.3, 0, 0, -0.12, body);
      add(0.04, 0.04, 0.22, 0, 0.02, -0.32, grip);
      add(0.05, 0.14, 0.06, 0, -0.1, -0.05, grip);
    } else if (def.id === 'dmr') {
      add(0.07, 0.08, 0.55, 0, 0, -0.2, body);
      add(0.03, 0.03, 0.42, 0, 0.02, -0.55, dark);
      add(0.05, 0.05, 0.16, 0, 0.07, -0.15, dark);
      add(0.06, 0.07, 0.2, 0, -0.02, 0.28, grip);
    } else {
      add(0.09, 0.1, 0.42, 0, 0, -0.12, body);
      add(0.045, 0.045, 0.4, 0, 0.025, -0.5, grip);
      add(0.075, 0.08, 0.22, 0, -0.02, 0.18, grip);
    }
  }

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  let current = 'pistol';
  const state = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  buildModel(WEAPONS.pistol);

  function def() {
    return WEAPONS[current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 12;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  function save() {
    owned[current] = { mag: state.mag, reserve: state.reserve };
  }

  return {
    state,
    def,
    owned,
    step,
    current() {
      return current;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed) {
      return def().spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def().spreadMove;
    },
    select(id) {
      if (!owned[id] || id === current) return false;
      save();
      current = id;
      state.mag = owned[id].mag;
      state.reserve = owned[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      buildModel(def());
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    refillReserve() {
      for (const id of Object.keys(owned)) owned[id].reserve = WEAPONS[id].reserve;
      if (owned[current]) {
        state.reserve = WEAPONS[current].reserve;
      }
    },
    // A new round tops every owned weapon's magazine and reserve up; the
    // weapon in hand stays in hand.
    refillAll() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = WEAPONS[id].mag;
        owned[id].reserve = WEAPONS[id].reserve;
      }
      state.mag = WEAPONS[current].mag;
      state.reserve = WEAPONS[current].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
