// The round machine: buy (15 s, everyone at spawn, the buy menu is openable),
// live (100 s, the round is played), end (4 s banner, then the next round).
// First team to 5 rounds takes the match. main.js checks the win conditions and
// calls endRound; this module only moves time and resets the board.
import { PHASES } from './state.js';

const BUY_TIME = 15;
const ROUND_TIME = 100;
const END_TIME = 4;
const WIN_ROUNDS = 5;

export function createRounds(state) {
  return {
    startBuy() {
      state.phase = PHASES.BUY;
      state.phaseTime = BUY_TIME;
    },
    startLive() {
      state.phase = PHASES.LIVE;
      state.phaseTime = ROUND_TIME;
    },
    endRound(winner, reason) {
      state.phase = PHASES.END;
      state.phaseTime = END_TIME;
      state.lastWin = winner;
      state.lastReason = reason;
      state.wins[winner] += 1;
      if (state.wins[winner] >= WIN_ROUNDS) state.matchWinner = winner;
    },
    // Returns 'live' when the buy phase ends, 'next' when the end banner ends,
    // 'match' when the match is decided, else null.
    step(dt) {
      state.phaseTime -= dt;
      if (state.phaseTime > 0) return null;
      if (state.phase === PHASES.BUY) {
        this.startLive();
        return 'live';
      }
      if (state.phase === PHASES.LIVE) {
        this.endRound('def', 'Time expired — the bomb never went off.');
        return 'timeout';
      }
      if (state.phase === PHASES.END) {
        if (state.matchWinner) {
          state.phase = PHASES.MATCH;
          return 'match';
        }
        state.round += 1;
        this.startBuy();
        return 'next';
      }
      return null;
    },
    resetMatch() {
      state.phase = PHASES.BUY;
      state.phaseTime = BUY_TIME;
      state.round = 1;
      state.wins.atk = 0;
      state.wins.def = 0;
      state.matchWinner = null;
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.grenades = 0;
      state.armor = 0;
      state.lastWin = null;
      state.lastReason = '';
    },
  };
}

export { BUY_TIME, ROUND_TIME, WIN_ROUNDS };
