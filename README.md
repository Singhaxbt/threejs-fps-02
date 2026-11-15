# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Singhaxbt/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Singhaxbt/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**EMBERLINE** — a round-based tactical FPS in the Counter-Strike style, played in the browser against bots on an original map, Foundry Yard. Five attackers against five defenders, first to five rounds: eliminate the other team, or plant the bomb at Site A (Furnace) or Site B (Depot) and hold it through the fuse. Money earned each round buys rifles, a DMR, an SMG, grenades and Kevlar in the buy phase; bots follow waypoint routes, hold positions, and react to what they see and hear.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Click to play. `W A S D` move, mouse looks, `Click` fires, `R` reloads, `1–4` switch weapons, `G` throws a grenade, `E` plants/defuses the bomb, `B` opens the buy menu, `Ctrl` crouches, `Space` jumps.

## How it is built

Static files under `game/`, ES modules, no build step, three.js 0.187.0 vendored byte-for-byte, nothing loaded over the network. One module per job (`main.js` orchestrates a fixed 60 Hz simulation kept apart from rendering; `player.js`, `bots.js`, `weapon.js`, `bomb.js`, `economy.js`, `rounds.js`, `grenade.js`, `effects.js`, `audio.js`, `hud.js`, `world.js`, `state.js`, `input.js`, `palette.js`), one state store, no per-frame allocation in the hot loops. `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library — deterministic, the same input files always produce the same output bytes.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
