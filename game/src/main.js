// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. ?shot=cover|site|buy|start with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
// One hitscan path serves the player and the bots: fireHitscan(origin, direction,
// shooter) raycasts the world, the bots and the player, and takes the nearest hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, ATK_SPAWNS, DEF_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createState, PHASES } from './state.js';
import { createEconomy } from './economy.js';
import { createRounds } from './rounds.js';
import { createGrenades } from './grenade.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(shot ? seed : (Date.now() % 2147483647) + 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
state.seed = seed;
const world = createWorld(scene);
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera);
const bomb = createBomb(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy(state);
const rounds = createRounds(state);
const grenades = createGrenades(scene, world.colliders);

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
// Reused temporaries: the hot loop allocates nothing.
const direction = new THREE.Vector3();
const origin = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const endPoint = new THREE.Vector3();
const tmpBox = new THREE.Box3();
const tmpSphere = new THREE.Sphere(new THREE.Vector3(), 0.18);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const body = player.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let spectateBot = null;
let stepCount = 0;

const bots = createBots(scene, {
  colliders: world.colliders,
  shootables: world.shootables,
  random,
  onShoot: (bot, eye, dir, target) => botShoot(bot, eye, dir, target),
  onDeath: (bot) => hud.killFeed(`${bot.name} is down`),
});
// Four teammates and five enemies, all with rifles except one pistol scout each side.
bots.makeBot('Ash', 'atk', ATK_SPAWNS[1], 'rifle', 'push');
bots.makeBot('Brick', 'atk', ATK_SPAWNS[2], 'rifle', 'push');
bots.makeBot('Cinder', 'atk', ATK_SPAWNS[3], 'smg', 'push');
bots.makeBot('Dusk', 'atk', ATK_SPAWNS[4], 'rifle', 'push');
bots.makeBot('Ember', 'def', DEF_SPAWNS[0], 'rifle', 'hold');
bots.makeBot('Flint', 'def', DEF_SPAWNS[1], 'rifle', 'hold');
bots.makeBot('Gale', 'def', DEF_SPAWNS[2], 'smg', 'hold');
bots.makeBot('Haze', 'def', DEF_SPAWNS[3], 'rifle', 'hold');
bots.makeBot('Iron', 'def', DEF_SPAWNS[4], 'pistol', 'hold');

const input = createInput(renderer.domElement, onLockChange);

function playerSite() {
  tmpVec.set(body.position.x, body.position.y + 1, body.position.z);
  if (world.siteA.containsPoint(tmpVec)) return 'A';
  if (world.siteB.containsPoint(tmpVec)) return 'B';
  return null;
}

function muzzlePoint() {
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.x += Math.cos(body.yaw) * 0.24;
  muzzle.z -= Math.sin(body.yaw) * 0.24;
  muzzle.y -= 0.16;
  return muzzle;
}

// One hitscan: world, bots and the player are all candidates; the nearest hit
// wins. Returns the hit point in endPoint (or the ray's end at 90 m).
function fireHitscan(from, dir, shooterTeam, shooterRef) {
  scene.updateMatrixWorld(true);
  raycaster.set(from, dir);
  const worldHits = raycaster.intersectObjects(world.shootables, false);
  const botHits = raycaster.intersectObjects(bots.hitMeshes(), false);
  let best = null;
  let bestDist = Infinity;
  let bestKind = null;
  if (worldHits.length && worldHits[0].distance < bestDist) {
    best = worldHits[0];
    bestDist = best.distance;
    bestKind = 'world';
  }
  if (botHits.length && botHits[0].distance < bestDist) {
    best = botHits[0];
    bestDist = best.distance;
    bestKind = 'bot';
  }
  // The player is a box with a head sphere; only bots can hit them.
  if (shooterTeam !== 'atk' && body.alive) {
    const ray = raycaster.ray;
    tmpBox.min.set(body.position.x - 0.34, body.position.y, body.position.z - 0.34);
    tmpBox.max.set(body.position.x + 0.34, body.position.y + 1.72, body.position.z + 0.34);
    tmpSphere.center.set(body.position.x, body.position.y + 1.5, body.position.z);
    const headAt = ray.intersectSphere(tmpSphere, tmpVec);
    const bodyAt = ray.intersectBox(tmpBox, tmpVec2);
    if (headAt && (!bodyAt || headAt.distanceTo(from) < bodyAt.distanceTo(from))) {
      const d = headAt.distanceTo(from);
      if (d < bestDist) {
        best = { point: headAt.clone(), distance: d };
        bestDist = d;
        bestKind = 'player-head';
      }
    } else if (bodyAt) {
      const d = bodyAt.distanceTo(from);
      if (d < bestDist) {
        best = { point: bodyAt.clone(), distance: d };
        bestDist = d;
        bestKind = 'player';
      }
    }
  }
  if (best) {
    endPoint.copy(best.point);
  } else {
    endPoint.copy(from).addScaledVector(dir, 90);
  }
  return { kind: bestKind, hit: best, dist: bestDist };
}

function applyShotResult(result, shooterTeam, shooterRef, def) {
  if (result.kind === 'world') {
    effects.sparksAt(result.hit.point, 6, 2.5);
    return;
  }
  if (result.kind === 'bot') {
    const bot = result.hit.object.userData.bot;
    const part = result.hit.object.userData.part;
    if (bot.team === shooterTeam) return; // no friendly fire
    const dmg = def.damage * (part === 'head' ? def.headMult : 1);
    const died = bots.damage(bot, dmg);
    if (shooterRef === 'player') {
      hud.hitMarker(died, died ? 400 : 90);
      audio.hit(died);
      if (died) {
        state.kills += 1;
        economy.rewardKill();
        hud.killFeed(`YOU ▸ ${bot.name}${part === 'head' ? ' (headshot)' : ''}  +$300`);
      }
    }
    return;
  }
  if (result.kind === 'player' || result.kind === 'player-head') {
    const dmg = def.damage * (result.kind === 'player-head' ? def.headMult : 1);
    player.damage(dmg);
    hud.damageFlash();
    hud.setHealth(body.health, body.armor);
    audio.hurt();
    if (!body.alive) {
      state.deaths += 1;
      hud.killFeed(`${shooterRef.name} ▸ YOU`);
      hud.banner('You are down', 'Spectating your team — the round plays on.', 4000);
    }
  }
}

function playerShoot(spread) {
  const def = weapon.def();
  if (!weapon.takeRound()) {
    audio.dryClick();
    weapon.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  const result = fireHitscan(camera.position, direction, 'atk', 'player');
  effects.tracer(muzzlePoint(), endPoint);
  applyShotResult(result, 'atk', 'player', def);
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.id);
  bots.hearShot(body.position.x, body.position.z, 'atk');
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name, state.grenades);
  return true;
}

function botShoot(bot, eye, dir, target) {
  const def = WEAPONS[bot.weapon];
  // Bots miss on purpose at range: angular error grows with distance.
  const dist = eye.distanceTo(tmpVec.set(target.x, target.y, target.z));
  const err = 0.012 + dist * 0.0011 + (target.kind === 'player' ? player.groundSpeed() * 0.004 : 0);
  direction.copy(dir);
  direction.x += (random() * 2 - 1) * err;
  direction.y += (random() * 2 - 1) * err;
  direction.z += (random() * 2 - 1) * err;
  direction.normalize();
  const result = fireHitscan(eye, direction, bot.team, bot);
  effects.tracer(eye, endPoint);
  applyShotResult(result, bot.team, bot, def);
  audio.shot(def.id);
  bots.hearShot(bot.pos.x, bot.pos.z, bot.team);
}

function startRound() {
  player.reset(ATK_SPAWNS[0][0], ATK_SPAWNS[0][1], 0);
  weapon.refillAll();
  state.armor = 0;
  bots.reset(ATK_SPAWNS, DEF_SPAWNS, true);
  bomb.reset();
  grenades.reset();
  spectateBot = null;
  rounds.startBuy();
  hud.setHealth(100, 0);
  hud.setMoney(state.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
  hud.banner(`Round ${state.round}`, 'Buy phase — B opens the shop. First to 5 rounds wins the match.', 3000);
}

function endRoundUI(winner, reason) {
  const won = winner === 'atk';
  economy.rewardRound(won);
  hud.banner(won ? 'Round won' : 'Round lost', `${reason}  ${won ? '+$3,000' : '+$1,400'}`, 3600);
  hud.setMoney(state.money);
  audio.round(won);
}

function checkRoundEnd() {
  if (state.phase !== PHASES.LIVE) return;
  if (body.alive === false && bots.aliveCount('atk') === 0) {
    rounds.endRound('def', 'Your team was eliminated.');
    endRoundUI('def', 'Your team was eliminated.');
  } else if (bots.aliveCount('def') === 0) {
    rounds.endRound('atk', 'Defenders eliminated.');
    endRoundUI('atk', 'Defenders eliminated.');
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
    audio.unlock();
  } else if (state.phase !== PHASES.MATCH && !hud.buyVisible()) {
    // Losing the lock pauses — except while the buy menu is open, because
    // opening it exits the lock on purpose and the menu must stay clickable.
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (!body.alive && state.phase === PHASES.LIVE) {
    if (!spectateBot || !spectateBot.alive) {
      spectateBot = bots.list.find((b) => b.team === 'atk' && b.alive) || null;
    }
    if (spectateBot) {
      camera.position.set(spectateBot.pos.x, spectateBot.pos.y + 1.55, spectateBot.pos.z);
      camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function buyAction(what) {
  if (state.phase !== PHASES.BUY) return;
  if (what.startsWith('weapon:')) {
    const id = what.slice(7);
    if (weapon.owned[id]) {
      weapon.select(id);
    } else if (economy.buyWeapon(id)) {
      weapon.buy(id);
      weapon.select(id);
      audio.buy();
    }
  } else if (what === 'grenade') {
    if (economy.buyGrenade()) audio.buy();
  } else if (what === 'armor') {
    if (economy.buyArmor()) {
      player.state.armor = 50;
      audio.buy();
    }
  }
  hud.setMoney(state.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
  hud.setHealth(body.health, body.armor);
  if (hud.buyVisible()) hud.showBuy(state.money, { ...weapon.owned, armor: state.armor > 0 });
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === PHASES.MATCH) {
    rounds.resetMatch();
    startRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});
hud.onBuy((what) => buyAction(what));

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const keys = input.state.keys;
  const pressed = input.takePressed();
  const fireEdge = input.takeFireEdge();

  // Round clock first: buy -> live -> end -> next round / match.
  const transition = rounds.step(dt);
  if (transition === 'live') {
    hud.hideBuy();
    hud.banner(`Round ${state.round} — go`, 'Plant the bomb at A or B, or eliminate the defenders.', 2600);
  } else if (transition === 'timeout') {
    endRoundUI('def', 'Time expired — the bomb never went off.');
  } else if (transition === 'next') {
    startRound();
  } else if (transition === 'match') {
    const won = state.matchWinner === 'atk';
    hud.showOverlay('match', {
      title: won ? 'Match won' : 'Match lost',
      copy: won
        ? `Attackers take Foundry Yard ${state.wins.atk}–${state.wins.def}. You finished ${state.kills} kills.`
        : `Defenders hold Foundry Yard ${state.wins.def}–${state.wins.atk}. You finished ${state.kills} kills.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  if (state.phase === PHASES.LIVE || state.phase === PHASES.BUY) {
    player.step(dt, keys);
    const look = input.takeLook();
    player.look(look.x, look.y);
  }

  // Actions: reload, switch, grenade, buy menu, plant/defuse.
  if (body.alive && (state.phase === PHASES.LIVE || state.phase === PHASES.BUY)) {
    if (keys.has('KeyR')) weapon.reload();
    if (pressed.has('Digit1')) weapon.select('pistol');
    if (pressed.has('Digit2')) weapon.select('rifle');
    if (pressed.has('Digit3')) weapon.select('smg');
    if (pressed.has('Digit4')) weapon.select('dmr');
    if (pressed.has('KeyG') && state.phase === PHASES.LIVE && state.grenades > 0) {
      camera.getWorldDirection(direction);
      if (grenades.throwFrom(camera.position, direction)) {
        state.grenades -= 1;
        hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
      }
    }
    if (pressed.has('KeyB') && state.phase === PHASES.BUY) {
      if (hud.buyVisible()) {
        hud.hideBuy();
        input.requestLock();
      } else {
        hud.showBuy(state.money, { ...weapon.owned, armor: state.armor > 0 });
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
    // Number-key buying while the menu is open.
    if (hud.buyVisible()) {
      if (pressed.has('Digit1')) buyAction('weapon:pistol');
      if (pressed.has('Digit2')) buyAction('weapon:rifle');
      if (pressed.has('Digit3')) buyAction('weapon:smg');
      if (pressed.has('Digit4')) buyAction('weapon:dmr');
      if (pressed.has('Digit5')) buyAction('grenade');
    }
  }

  // Firing: auto weapons hold, semi-auto weapons need the click edge.
  if (body.alive && state.phase === PHASES.LIVE && !hud.buyVisible()) {
    const def = weapon.def();
    const wantFire = def.auto ? input.state.firing : fireEdge;
    if (wantFire && weapon.ready()) playerShoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    else if (wantFire && weapon.state.mag === 0 && weapon.state.reloadLeft === 0) weapon.reload();
  }
  weapon.step(dt);

  // The bomb: plant with E in a site, defuse by a defender standing in it.
  // Only live rounds plant, tick or defuse; the buy and end phases freeze it.
  let defuser = null;
  let bombEvent = null;
  if (state.phase === PHASES.LIVE) {
    if (bomb.state.mode === 'planted') {
      const siteBox = bomb.state.site === 'A' ? world.siteA : world.siteB;
      defuser = bots.list.find((b) => b.alive && b.team === 'def' && siteBox.containsPoint(tmpVec.set(b.pos.x, b.pos.y + 1, b.pos.z)));
      if (defuser) {
        defuser.state = 'hold';
        defuser.route = [];
      }
    }
    bombEvent = bomb.step(dt, keys.has('KeyE'), playerSite(), defuser);
  }
  if (bombEvent === 'planted') {
    bomb.place(body.position.x, body.position.z);
    economy.rewardPlant();
    hud.killFeed(`Bomb planted at Site ${bomb.state.site}  +$300`);
    hud.banner('Bomb planted', `Site ${bomb.state.site} — defend it for 40 seconds.`, 3200);
    audio.beep(true);
    bots.retake(bomb.state.site === 'A' ? 'aSite' : 'bSite');
    hud.setMoney(state.money);
  } else if (bombEvent === 'defused') {
    rounds.endRound('def', 'The bomb was defused.');
    endRoundUI('def', 'The bomb was defused.');
  } else if (bombEvent === 'exploded') {
    effects.explosion(bomb.mesh.position.x, bomb.mesh.position.y, bomb.mesh.position.z);
    audio.explode();
    const bp = bomb.mesh.position;
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - bp.x, bot.pos.z - bp.z);
      if (d < 12) bots.damage(bot, Math.round(200 * (1 - d / 12) + 40));
    }
    if (body.alive) {
      const d = Math.hypot(body.position.x - bp.x, body.position.z - bp.z);
      if (d < 12) {
        player.damage(Math.round(200 * (1 - d / 12) + 40));
        hud.damageFlash();
        hud.setHealth(body.health, body.armor);
      }
    }
    rounds.endRound('atk', 'The bomb detonated.');
    endRoundUI('atk', 'The bomb detonated.');
  }

  // Grenades: fly, bounce, then hurt everyone nearby. Frozen outside live play.
  if (state.phase === PHASES.LIVE || state.phase === PHASES.BUY) {
    grenades.step(dt, (x, y, z) => {
    effects.explosion(x, y, z);
    effects.sparksAt(tmpVec.set(x, y, z), 20, 5);
    audio.explode();
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - x, bot.pos.y + 1 - y, bot.pos.z - z);
      const dmg = grenades.damageAt(d);
      if (dmg > 0 && bots.damage(bot, dmg)) {
        hud.killFeed(`Grenade ▸ ${bot.name}`);
      }
    }
    if (body.alive) {
      const d = Math.hypot(body.position.x - x, body.position.y + 1 - y, body.position.z - z);
      const dmg = grenades.damageAt(d);
      if (dmg > 0) {
        player.damage(dmg);
        hud.damageFlash();
        hud.setHealth(body.health, body.armor);
      }
    }
    });
  }

  bots.step(dt, elapsed, body, state.phase === PHASES.LIVE);
  effects.step(dt);
  checkRoundEnd();

  // HUD, every step (the HUD itself skips unchanged values).
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
  hud.setMoney(state.money);
  const t = Math.max(0, Math.ceil(state.phaseTime));
  const phaseLabel = state.phase === PHASES.BUY ? 'BUY' : state.phase === PHASES.LIVE ? 'ROUND' : state.phase === PHASES.END ? 'END' : 'MATCH';
  hud.setTimer(`${phaseLabel} ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, state.phase === PHASES.LIVE && t <= 10);
  hud.setScore(state.wins.atk, state.wins.def, state.round);
  hud.setCrosshair(body.alive ? weapon.spread(player.groundSpeed()) : 0);
  if (bomb.state.mode === 'carried') {
    hud.setBomb(state.phase === PHASES.LIVE && body.alive ? 'BOMB — hold E in a site to plant' : '', false);
  } else if (bomb.state.mode === 'planted') {
    const fusing = Math.max(0, Math.ceil(bomb.state.fuse));
    hud.setBomb(defuser ? 'DEFUSE IN PROGRESS — stop them!' : `BOMB PLANTED — ${fusing}s`, fusing <= 10 || !!defuser);
  } else {
    hud.setBomb('', false);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  startRound();
  if (name === 'cover') {
    // Mid-round firefight: the player is on the west side of the mid lane,
    // a defender crosses the mid door. (The centre pillar sits at x=0, z=3..9,
    // so the player stands off to the side for a clear line of fire.)
    rounds.startLive();
    body.position.set(-6, 0, 10);
    const foe = bots.list.find((b) => b.name === 'Flint');
    foe.pos.set(-1.5, 0, -1);
    foe.yaw = Math.PI;
    const mate = bots.list.find((b) => b.name === 'Ash');
    mate.pos.set(-4, 0, 6);
    mate.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(-1.5, 1.3, -1));
    playerShoot(0);
    // Four steps: the 0.06 s muzzle flash is spent, the 0.12 s tracer is not.
    settle(4);
    aimAt(new THREE.Vector3(-1.5, 1.3, -1));
  } else if (name === 'site') {
    // The bomb is planted at A; the player holds the angle from inside the
    // site, the bomb and a defender both in frame. The defender stands just
    // outside the site box, so no defuse is in progress yet.
    rounds.startLive();
    bomb.state.mode = 'planted';
    bomb.state.site = 'A';
    bomb.state.fuse = 32;
    bomb.place(17, -11);
    body.position.set(12.5, 0, -4.5);
    const foe = bots.list.find((b) => b.name === 'Ember');
    foe.pos.set(16, 0, -6);
    foe.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(16.5, 1.2, -8));
  } else if (name === 'buy') {
    // Buy phase at spawn with the shop open, looking up the east lane.
    body.position.set(0, 0, 15);
    state.money = 4700;
    settle(10);
    hud.showBuy(state.money, { ...weapon.owned, armor: false });
    aimAt(new THREE.Vector3(6, 1.4, -4));
  } else {
    // Start overlay over the yard, looking up the west lane.
    body.position.set(0.6, 0, 15.5);
    settle(20);
    aimAt(new THREE.Vector3(-4, 1.4, -2));
    hud.showOverlay('start');
  }
  hud.hideBanner();
  hud.setScore(state.wins.atk, state.wins.def, state.round);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = { state, player: body, bots, weapon, bomb, rounds };
syncCamera();
hud.setHealth(100, 0);
hud.setMoney(state.money);
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name, state.grenades);
startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
