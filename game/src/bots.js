// The other nine players: four teammates and five enemies. A bot is a body with a
// weapon, a route and a state machine — route (follow the waypoint graph), hold
// (guard a site and scan), engage (face, react, burst fire), investigate (walk to
// the last sound or sighting), retake (converge on a planted bomb). Bots see with
// a raycast, hear shots inside 26 m, and shoot with the same weapon numbers the
// player uses, so a duel is decided by positioning and aim, not by hidden stats.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './player.js';
import { WAYPOINTS } from './world.js';
import { WEAPONS } from './weapon.js';

const NAMES_ATK = ['Ash', 'Brick', 'Cinder', 'Dusk'];
const NAMES_DEF = ['Ember', 'Flint', 'Gale', 'Haze', 'Iron'];
const ROUTE_SPEED = 4.2;
const HOLD_SPEED = 2.6;
const HEAR_RANGE = 26;
const SIGHT_RANGE = 46;
const EYE_HEIGHT = 1.5;
const BOT_HEIGHT = 1.72;

function routeTo(fromNode, toNode) {
  // BFS over the waypoint graph; returns node ids from start to goal.
  if (fromNode === toNode) return [toNode];
  const prev = { [fromNode]: null };
  const queue = [fromNode];
  while (queue.length) {
    const node = queue.shift();
    for (const next of WAYPOINTS[node].links) {
      if (prev[next] !== undefined) continue;
      prev[next] = node;
      if (next === toNode) {
        const path = [next];
        let at = node;
        while (at) {
          path.unshift(at);
          at = prev[at];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [toNode];
}

function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [id, node] of Object.entries(WAYPOINTS)) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function createBots(scene, options) {
  const { colliders, shootables, random, onShoot, onDeath } = options;
  const mover = createMover(colliders, 0.34);
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const eye = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const wish = new THREE.Vector3();

  const clothAtk = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.friend), roughness: 0.7 });
  const clothDef = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.foe), roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.62, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
  const gunGeo = new THREE.BoxGeometry(0.05, 0.08, 0.5);

  const list = [];

  function makeBot(name, team, spawn, weaponId, role) {
    const group = new THREE.Group();
    const cloth = team === 'atk' ? clothAtk : clothDef;
    const torso = new THREE.Mesh(torsoGeo, cloth);
    torso.position.y = 0.95;
    torso.castShadow = true;
    const head = new THREE.Mesh(headGeo, skin);
    head.position.y = 1.5;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), dark);
    visor.position.set(0, 1.52, -0.14);
    const legL = new THREE.Mesh(legGeo, dark);
    legL.position.set(-0.12, 0.25, 0);
    const legR = new THREE.Mesh(legGeo, dark);
    legR.position.set(0.12, 0.25, 0);
    const gun = new THREE.Mesh(gunGeo, dark);
    gun.position.set(0.18, 1.12, -0.28);
    group.add(torso, head, visor, legL, legR, gun);
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);

    const bot = {
      name, team, role, weapon: weaponId, group, torso, head,
      pos: group.position,
      vel: new THREE.Vector3(),
      yaw: team === 'atk' ? 0 : Math.PI,
      hp: 100, alive: true, fall: 0,
      state: 'route', route: [], routeIdx: 0, holdNode: null,
      target: null, targetKind: null, lastSeen: null, lastSeenAt: -99,
      lastHeard: null, reactAt: 0, burstLeft: 0, nextShotAt: 0, burstPauseUntil: 0,
      strafeDir: 1, strafeUntil: 0, losTimer: random() * 0.15, scanPhase: random() * 6,
      home: { x: spawn[0], z: spawn[1] },
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    list.push(bot);
    return bot;
  }

  function setRoute(bot, toNode) {
    const from = nearestNode(bot.pos.x, bot.pos.z);
    bot.route = routeTo(from, toNode);
    bot.routeIdx = 0;
    bot.state = 'route';
  }

  function assignRoundRoles(randomize) {
    // Attackers push both sites and mid; defenders hold the sites and mid.
    const atk = list.filter((b) => b.team === 'atk');
    const def = list.filter((b) => b.team === 'def');
    const atkGoals = ['aSite', 'aSite', 'bSite', 'midNorth'];
    const defGoals = ['aHold', 'aHold', 'bHold', 'bHold', 'midNorth'];
    atk.forEach((bot, i) => {
      bot.holdNode = atkGoals[i % atkGoals.length];
      setRoute(bot, bot.holdNode);
    });
    def.forEach((bot, i) => {
      bot.holdNode = defGoals[i % defGoals.length];
      setRoute(bot, bot.holdNode);
    });
    if (randomize) {
      for (const bot of list) bot.scanPhase = random() * 6;
    }
  }

  function canSee(bot, tx, ty, tz) {
    eye.set(bot.pos.x, bot.pos.y + EYE_HEIGHT, bot.pos.z);
    targetPos.set(tx, ty, tz);
    dir.copy(targetPos).sub(eye);
    const dist = dir.length();
    if (dist > SIGHT_RANGE) return false;
    dir.normalize();
    raycaster.set(eye, dir);
    raycaster.far = dist;
    return raycaster.intersectObjects(shootables, false).length === 0;
  }

  function perceive(bot, time, player) {
    // Nearest visible enemy: the player or an opposing bot.
    let best = null;
    let bestD = Infinity;
    const consider = (x, y, z, kind, ref) => {
      const dx = x - bot.pos.x;
      const dz = z - bot.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD && canSee(bot, x, y, z)) {
        bestD = d;
        best = { kind, ref, x, y, z };
      }
    };
    if (player.alive) consider(player.position.x, player.position.y + 1.4, player.position.z, 'player', player);
    for (const other of list) {
      if (!other.alive || other.team === bot.team) continue;
      consider(other.pos.x, other.pos.y + 1.4, other.pos.z, 'bot', other);
    }
    if (best) {
      bot.target = best;
      bot.lastSeen = { x: best.x, y: best.y, z: best.z };
      bot.lastSeenAt = time;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactAt = time + 0.35 + random() * 0.4;
        bot.burstLeft = 0;
        bot.nextShotAt = 0;
      }
    } else if (bot.state === 'engage' && time - bot.lastSeenAt > 1.2) {
      bot.state = 'investigate';
      bot.target = null;
      if (bot.lastSeen) setRoute(bot, nearestNode(bot.lastSeen.x, bot.lastSeen.z));
    }
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    wish.set(dx / dist, 0, dz / dist);
    const blend = Math.min(1, 30 * dt / speed);
    bot.vel.x += (wish.x * speed - bot.vel.x) * blend;
    bot.vel.z += (wish.z * speed - bot.vel.z) * blend;
    bot.yaw = Math.atan2(-wish.x, -wish.z);
    bot.vel.y -= 20 * dt;
    mover.move(bot.pos, bot.vel, dt, BOT_HEIGHT);
    return false;
  }

  function stepBot(bot, dt, time, player, canFight) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    // Bots only perceive and fight during live rounds; in the buy phase they
    // walk their routes and hold, but never shoot.
    if (canFight) {
      bot.losTimer -= dt;
      if (bot.losTimer <= 0) {
        bot.losTimer = 0.15;
        perceive(bot, time, player);
      }
    }

    if (bot.state === 'engage' && bot.target) {
      const t = bot.target;
      const dx = t.x - bot.pos.x;
      const dz = t.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      // Strafe sideways while fighting so a duel is not a still target.
      if (time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = time + 0.7 + random() * 0.9;
      }
      const sideX = Math.cos(bot.yaw) * bot.strafeDir;
      const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
      wish.set(sideX, 0, sideZ);
      const blend = Math.min(1, 30 * dt / HOLD_SPEED);
      bot.vel.x += (wish.x * HOLD_SPEED - bot.vel.x) * blend;
      bot.vel.z += (wish.z * HOLD_SPEED - bot.vel.z) * blend;
      bot.vel.y -= 20 * dt;
      mover.move(bot.pos, bot.vel, dt, BOT_HEIGHT);
      // Fire in bursts once the reaction time has passed and the aim is on.
      if (time >= bot.reactAt && time >= bot.burstPauseUntil) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.nextShotAt = time;
        }
        if (time >= bot.nextShotAt && bot.burstLeft > 0) {
          bot.burstLeft -= 1;
          bot.nextShotAt = time + WEAPONS[bot.weapon].gap;
          if (bot.burstLeft === 0) bot.burstPauseUntil = time + 0.9 + random() * 0.7;
          eye.set(bot.pos.x, bot.pos.y + EYE_HEIGHT, bot.pos.z);
          targetPos.set(t.x, t.y, t.z);
          dir.copy(targetPos).sub(eye).normalize();
          onShoot(bot, eye, dir, t);
        }
      }
      return;
    }

    if (bot.state === 'route') {
      const node = WAYPOINTS[bot.route[bot.routeIdx]];
      if (!node) {
        bot.state = 'hold';
        return;
      }
      if (moveToward(bot, node.x, node.z, ROUTE_SPEED, dt)) bot.routeIdx += 1;
      return;
    }

    if (bot.state === 'investigate') {
      const node = WAYPOINTS[bot.route[bot.routeIdx]];
      if (!node) {
        bot.state = 'hold';
        bot.scanPhase = time;
        return;
      }
      if (moveToward(bot, node.x, node.z, ROUTE_SPEED, dt)) bot.routeIdx += 1;
      return;
    }

    // hold: stand, sweep the view toward the direction the enemy comes from,
    // and wait for a target or a sound.
    bot.vel.x *= Math.max(0, 1 - 9 * dt);
    bot.vel.z *= Math.max(0, 1 - 9 * dt);
    bot.vel.y -= 20 * dt;
    mover.move(bot.pos, bot.vel, dt, BOT_HEIGHT);
    const faceYaw = bot.team === 'def' ? Math.PI : 0;
    bot.yaw = faceYaw + Math.sin(time * 0.7 + bot.scanPhase) * 0.6;
  }

  function hearShot(x, z, team) {
    for (const bot of list) {
      if (!bot.alive || bot.team === team || bot.state === 'engage') continue;
      const dx = x - bot.pos.x;
      const dz = z - bot.pos.z;
      if (dx * dx + dz * dz > HEAR_RANGE * HEAR_RANGE) continue;
      bot.lastHeard = { x, z };
      if (bot.state === 'hold' || bot.state === 'route') {
        bot.state = 'investigate';
        setRoute(bot, nearestNode(x, z));
      }
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      onDeath(bot);
      return true;
    }
    // Being shot at reveals the shooter: turn and look.
    return false;
  }

  function reset(spawnsAtk, spawnsDef, randomize) {
    // Spawn [0] of the attacker list is the human player's slot; the bots
    // take the remaining slots so nobody ever spawns on top of the player.
    let atkIndex = 0;
    let defIndex = 0;
    list.forEach((bot) => {
      const isAtk = bot.team === 'atk';
      const spawns = isAtk ? spawnsAtk : spawnsDef;
      const spawn = spawns[(isAtk ? 1 + atkIndex++ : defIndex++) % spawns.length];
      bot.pos.set(spawn[0], 0, spawn[1]);
      bot.vel.set(0, 0, 0);
      bot.yaw = bot.team === 'atk' ? 0 : Math.PI;
      bot.hp = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.lastHeard = null;
      bot.burstLeft = 0;
    });
    assignRoundRoles(randomize);
  }

  return {
    list,
    makeBot,
    step(dt, time, player, canFight) {
      for (const bot of list) stepBot(bot, dt, time, player, canFight);
    },
    hearShot,
    damage,
    reset,
    retake(siteNode) {
      for (const bot of list) {
        if (!bot.alive || bot.team !== 'def') continue;
        setRoute(bot, siteNode);
      }
    },
    aliveCount(team) {
      return list.filter((b) => b.team === team && b.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of list) {
        if (bot.alive) meshes.push(bot.torso, bot.head);
      }
      return meshes;
    },
  };
}
