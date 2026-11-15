// EMBERLINE look plan: a dusk foundry yard — warm dark concrete, amber work lights,
// teal defender cloth, red-orange attacker cloth. Six base tones plus one colour per
// team; every colour in the game comes from this file, and the same names are the CSS
// custom properties in index.html.
export const PALETTE = {
  canvas: '#17130e', // sky / fog / page background
  surface: '#26211a', // walls, floor
  hairline: '#3a3126', // crates, cover, trim
  ink: '#ece3d0', // HUD text, view-model metal
  muted: '#9a8d76', // secondary text, distant geometry
  accent: '#f0a830', // amber: work lights, site A, the bomb, tracers
  siteB: '#3fb8a6', // teal: site B, defender cloth
  foe: '#e05545', // attacker cloth, damage flashes
  friend: '#3fb8a6', // teammate cloth (same teal as site B)
};

export function shade(name) {
  return PALETTE[name];
}
