// One place for all mutable match state: every module reads this object and no
// module keeps its own copy of a number the HUD or another system also shows.
// Teams: 'atk' is the player's side (bomb carriers), 'def' holds the sites.
export const TEAMS = { ATK: 'atk', DEF: 'def' };
export const PHASES = { BUY: 'buy', LIVE: 'live', END: 'end', MATCH: 'match' };

export function createState() {
  return {
    phase: PHASES.BUY,
    phaseTime: 15, // seconds left in this phase
    round: 1,
    wins: { atk: 0, def: 0 },
    matchWinner: null,
    money: 800,
    kills: 0,
    deaths: 0,
    // The bomb lives here so the HUD, the bots and the round logic agree.
    bomb: { state: 'carried', site: null, plantProgress: 0, defuseProgress: 0, fuse: 40, x: 0, z: 0 },
    // Grenades the player owns; the buy menu and the HUD both read this.
    grenades: 0,
    armor: 0,
    // Last round's story, for the banner and the kill feed.
    lastWin: null,
    lastReason: '',
    // Deterministic seed for this match (from the URL or the clock at boot).
    seed: 1,
    elapsed: 0,
  };
}
