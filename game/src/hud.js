// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, team score,
// bomb status, kill feed, buy menu and banners. It never touches the simulation;
// main.js pushes numbers in and reads the play and buy callbacks out.
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE, ARMOR_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Foundry Yard. Five attackers, five defenders, one bomb. Plant it at A (Furnace) or B (Depot) — or wipe the other team out. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: '',
    copy: '',
    action: 'Click to continue',
  },
  match: {
    title: '',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEl = $('teamscore');
  const bombEl = $('bombstatus');
  const feedEl = $('killfeed');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const damageEl = $('damage');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const buyEl = $('buy');
  const buyRows = $('buy-rows');
  const buyMoney = $('buy-money');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Build the buy menu once; rows update their owned/afforded state on open.
  const rowEls = {};
  for (const id of WEAPON_ORDER) {
    const def = WEAPONS[id];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-name"></span><span class="buy-stat"></span><span class="buy-price"></span>`;
    row.querySelector('.buy-name').textContent = def.name;
    row.querySelector('.buy-stat').textContent = `${def.damage} dmg · ${def.mag} mag`;
    row.querySelector('.buy-price').textContent = def.price === 0 ? 'OWNED' : `$${def.price}`;
    row.addEventListener('click', () => buyHandler && buyHandler(`weapon:${id}`));
    buyRows.appendChild(row);
    rowEls[id] = row;
  }
  for (const [key, label, price, stat] of [
    ['grenade', 'HE Grenade', GRENADE_PRICE, 'throw with G'],
    ['armor', 'Kevlar Armour', ARMOR_PRICE, '+50 armour'],
  ]) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-name"></span><span class="buy-stat"></span><span class="buy-price"></span>`;
    row.querySelector('.buy-name').textContent = label;
    row.querySelector('.buy-stat').textContent = stat;
    row.querySelector('.buy-price').textContent = `$${price}`;
    row.addEventListener('click', () => buyHandler && buyHandler(key));
    buyRows.appendChild(row);
    rowEls[key] = row;
  }

  return {
    setHealth(hp, armor) {
      healthFill.style.width = `${Math.max(0, hp)}%`;
      setText(healthNum, 'hp', String(Math.ceil(hp)));
      setText(armorNum, 'armor', armor > 0 ? `+${armor}` : '');
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, weapon, grenades) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', weapon);
      setText(grenadeCount, 'nades', grenades > 0 ? `◉ ${grenades}` : '');
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setMoney(n) {
      setText(moneyEl, 'money', `$${n}`);
    },
    setTimer(text, urgent) {
      setText(timerEl, 'timer', text);
      timerEl.classList.toggle('urgent', !!urgent);
    },
    setScore(atk, def, round) {
      setText(scoreEl, 'score', `ATK ${atk} — ${def} DEF · ROUND ${round}`);
    },
    setBomb(text, urgent) {
      setText(bombEl, 'bomb', text);
      bombEl.classList.toggle('urgent', !!urgent);
      bombEl.classList.toggle('hidden', !text);
    },
    setCrosshair(spread) {
      crosshair.style.setProperty('--gap', `${4 + Math.min(26, spread * 900)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', !!killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageEl.classList.remove('show');
      void damageEl.offsetWidth;
      damageEl.classList.add('show');
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, holdMs = 3200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      bannerEl.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), holdMs);
    },
    hideBanner() {
      bannerEl.classList.add('hidden');
    },
    showBuy(money, owned) {
      buyEl.classList.remove('hidden');
      setText(buyMoney, 'buymoney', `You have $${money}`);
      for (const id of WEAPON_ORDER) {
        const row = rowEls[id];
        row.classList.toggle('owned', !!owned[id]);
        row.classList.toggle('cant', !owned[id] && WEAPONS[id].price > money);
        row.querySelector('.buy-price').textContent = owned[id] ? 'OWNED' : `$${WEAPONS[id].price}`;
      }
      rowEls.grenade.classList.toggle('cant', money < GRENADE_PRICE);
      rowEls.armor.classList.toggle('cant', money < ARMOR_PRICE || owned.armor);
    },
    hideBuy() {
      buyEl.classList.add('hidden');
    },
    buyVisible() {
      return !buyEl.classList.contains('hidden');
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode, data) {
      const text = COPY[mode];
      title.textContent = mode === 'round' ? data.title : text.title;
      copy.textContent = mode === 'round' ? data.copy : mode === 'match' ? data.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
