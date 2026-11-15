// Money between rounds: what the buy menu spends and what a round pays. The
// numbers are Counter-Strike-shaped on purpose — a pistol round first, a rifle
// after a won round, a loss still pays enough to keep playing.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapon.js';

export const REWARD = { kill: 300, plant: 300, win: 3000, loss: 1400 };
export const START_MONEY = 800;

export function createEconomy(state) {
  return {
    get money() {
      return state.money;
    },
    canAfford(price) {
      return state.money >= price;
    },
    buyWeapon(id) {
      const def = WEAPONS[id];
      if (!def || state.money < def.price) return false;
      state.money -= def.price;
      return true;
    },
    buyGrenade() {
      if (state.money < GRENADE_PRICE || state.grenades >= 2) return false;
      state.money -= GRENADE_PRICE;
      state.grenades += 1;
      return true;
    },
    buyArmor() {
      if (state.money < ARMOR_PRICE || state.armor >= 50) return false;
      state.money -= ARMOR_PRICE;
      state.armor = 50;
      return true;
    },
    rewardKill() {
      state.money += REWARD.kill;
    },
    rewardPlant() {
      state.money += REWARD.plant;
    },
    rewardRound(won) {
      state.money += won ? REWARD.win : REWARD.loss;
    },
  };
}
