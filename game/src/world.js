// FOUNDRY YARD — an original 44 x 36 m compound. Attackers spawn south, defenders
// north; two bomb sites, A (Furnace, east, amber) and B (Depot, west, teal), joined
// by three lanes: west, mid and east. Every box is a collider for players and bots
// and a surface a bullet stops on. Waypoints are the graph the bots route on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'A', label: 'Furnace', color: 'accent' },
  B: { name: 'B', label: 'Depot', color: 'siteB' },
};

// Waypoint graph: nodes the bots walk between (BFS in bots.js).
export const WAYPOINTS = {
  atkSpawn: { x: 0, z: 15, links: ['midSouth', 'atkWest', 'atkEast'] },
  atkWest: { x: -10, z: 12, links: ['atkSpawn', 'westLane', 'midSouth'] },
  atkEast: { x: 10, z: 12, links: ['atkSpawn', 'eastLane', 'midSouth'] },
  westLane: { x: -14, z: 6, links: ['atkWest', 'bDoor'] },
  eastLane: { x: 14, z: 6, links: ['atkEast', 'aDoor'] },
  midSouth: { x: 0, z: 8, links: ['atkSpawn', 'atkWest', 'atkEast', 'midDoor'] },
  midDoor: { x: 0, z: -1, links: ['midSouth', 'midNorth', 'bDoor', 'aDoor'] },
  midNorth: { x: 0, z: -10, links: ['midDoor', 'defSpawn', 'aHold', 'bHold'] },
  bDoor: { x: -6, z: -2, links: ['westLane', 'midDoor', 'bSite'] },
  aDoor: { x: 6, z: -2, links: ['eastLane', 'midDoor', 'aSite'] },
  bSite: { x: -17, z: -11, links: ['bDoor', 'bHold'] },
  aSite: { x: 17, z: -11, links: ['aDoor', 'aHold'] },
  bHold: { x: -18, z: -13.5, links: ['bSite', 'midNorth', 'defSpawn'] },
  aHold: { x: 18, z: -13.5, links: ['aSite', 'midNorth', 'defSpawn'] },
  defSpawn: { x: 0, z: -15, links: ['midNorth', 'aHold', 'bHold'] },
};

export const ATK_SPAWNS = [[0, 15], [-3, 15.5], [3, 15.5], [-1.5, 16.5], [1.5, 16.5]];
export const DEF_SPAWNS = [[0, -15], [-3, -15.5], [3, -15.5], [-8, -14], [8, -14]];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter: 44 x 36 m, 4.6 m walls, open to the sky.
  box(44.4, 0.4, 36.4, 0, -0.2, 0, 'surface');
  box(0.4, 4.6, 36.4, -22.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 22.2, 2.3, 0, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(44.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // Mid pillars split the centre lane into two sub-lanes.
  box(2, 3.2, 6, 0, 1.6, 6, 'hairline');
  box(2, 3.2, 4, 0, 1.6, -6, 'hairline');
  // Cross wall at z = -2 with a door in each lane.
  box(9, 3.2, 0.6, -13, 1.6, -2, 'surface');
  box(9, 3.2, 0.6, 13, 1.6, -2, 'surface');
  // Site A (Furnace) cover.
  box(2.4, 1.1, 1.2, 16, 0.55, -9, 'hairline');
  box(1.2, 1.1, 2.4, 19.5, 0.55, -12, 'hairline');
  box(1.2, 2.6, 1.2, 14, 1.3, -13.5, 'hairline');
  box(1.6, 0.8, 1.6, 17, 0.4, -14.5, 'hairline');
  // Site B (Depot) cover, mirrored.
  box(2.4, 1.1, 1.2, -16, 0.55, -9, 'hairline');
  box(1.2, 1.1, 2.4, -19.5, 0.55, -12, 'hairline');
  box(1.2, 2.6, 1.2, -14, 1.3, -13.5, 'hairline');
  box(1.6, 0.8, 1.6, -17, 0.4, -14.5, 'hairline');
  // Mid and south cover: crates to crouch behind, low walls, pillars.
  box(1.6, 1.1, 1.6, -6, 0.55, 2, 'hairline');
  box(1.6, 1.1, 1.6, 6, 0.55, 8, 'hairline');
  box(3.0, 1.1, 1.2, -8, 0.55, 12, 'hairline');
  box(3.0, 1.1, 1.2, 8, 0.55, 12, 'hairline');
  box(1.2, 2.2, 1.2, -10, 1.1, -8, 'hairline');
  box(1.2, 2.2, 1.2, 10, 1.1, -8, 'hairline');
  box(1.6, 0.8, 1.6, -6, 0.4, 14, 'hairline');
  box(1.6, 0.8, 1.6, 6, 0.4, 14, 'hairline');
  // Jumpable crate stacks for an off-angle.
  box(0.9, 0.9, 0.9, -4.2, 0.45, -4.5, 'hairline');
  box(0.9, 0.9, 0.9, -4.2, 1.35, -4.5, 'hairline');
  box(0.9, 0.9, 0.9, 4.2, 0.45, -4.5, 'hairline');

  // Site pads and floating letters (visual only, no colliders): the plant zones.
  function sitePad(cx, cz, material, letter) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(8, 0.04, 8), materials[material]);
    pad.position.set(cx, 0.02, cz);
    pad.receiveShadow = true;
    group.add(pad);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PALETTE[material];
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(3.2, 3.2, 1);
    sprite.position.set(cx, 3.4, cz);
    group.add(sprite);
  }
  sitePad(17, -11, 'accent', 'A');
  sitePad(-17, -11, 'siteB', 'B');

  // Light: warm key from the south-east, cool fill from the north-west, and a
  // tinted lamp over each site so the two objectives read at a glance.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.6));
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.8);
  key.position.set(12, 18, 10);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.8);
  fill.position.set(-10, 12, -8);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16);
  lampA.position.set(17, 3.4, -11);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.siteB), 14, 16);
  lampB.position.set(-17, 3.4, -11);
  scene.add(lampB);

  const siteA = new THREE.Box3(new THREE.Vector3(13, 0, -15), new THREE.Vector3(21, 4, -7));
  const siteB = new THREE.Box3(new THREE.Vector3(-21, 0, -15), new THREE.Vector3(-13, 4, -7));

  return { colliders, shootables, group, siteA, siteB };
}
