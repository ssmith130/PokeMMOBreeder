// Catch rate: the odds that one ball catches a wild Pokémon in PokeMMO, and which ball is best.
// PokeMMO uses the Gen 3/4 formula without critical captures and without the main games' rounding
// (Xanarchy, PokeMMO forums, Feb 2025):
//   X = (3·maxHP − 2·HP) / (3·maxHP) × catch rate × ball × status
//   Y = 1048560 / √√(16711680 / X), and the ball holds if four shake checks of 0..65535 all land under Y,
//   so one ball catches with (Y / 65535)^4, which works out to exactly X / 255 (and always when X ≥ 255).
// The catch rates come from the PokeMMO wiki's Module:CatchRateData (data/catch.json), which has PokeMMO's own
// changes: starter middle stages 30 and final stages 15, the Beldum line 25/20/15, the roaming birds and beasts 5,
// and every alpha 10 except the level 100 Tyranitar (3). Ball multipliers are PokeMMO's (wiki Poké Ball page),
// several weaker than the main games'. Each ball says how sure its number is (sure: 'wiki' | 'player' | 'guess').
(function (root) {
  'use strict';
  const STATUS = { none: 1, sleep: 2, freeze: 2, paralysis: 1.5, burn: 1.5, poison: 1.5 };
  const STATUS_LABEL = { none: 'None', sleep: 'Sleep', freeze: 'Freeze', paralysis: 'Paralysis', burn: 'Burn', poison: 'Poison' };

  // ctx: { rate, level, types[], speed (base), weight (hectograms), friend, moon, turn (1 = first turn),
  //        night, water, fishing, sameLevel, love, streak (Repeat Ball catches in a row), asleepTurns, safari }
  // Each ball: key, name, price (PokeMMO wiki's shop price, 0 = not sold), mult(ctx) -> [multiplier, why], sure.
  const fixed = (m, why) => () => [m, why];
  const BALLS = [
    { key: 'poke', rule: '×1', name: 'Poké Ball', price: 200, sure: 'wiki', mult: fixed(1, 'Always ×1') },
    { key: 'great', rule: '×1.5', name: 'Great Ball', price: 600, sure: 'wiki', mult: fixed(1.5, 'Always ×1.5') },
    { key: 'ultra', rule: '×2', name: 'Ultra Ball', price: 1200, sure: 'wiki', mult: fixed(2, 'Always ×2') },
    { key: 'quick', rule: '×5 on turn 1, else ×1', name: 'Quick Ball', price: 1200, sure: 'wiki',
      mult: (c) => (c.turn <= 1 ? [5, '×5 on the first turn'] : [1, '×1 after the first turn']) },
    { key: 'timer', rule: '×1 + 0.3 a turn, ×4 from turn 11', name: 'Timer Ball', price: 1200, sure: 'wiki',
      mult: (c) => { const m = Math.min(4, 1 + 0.3 * (Math.max(1, c.turn) - 1)); return [m, m >= 4 ? '×4 from turn 11' : `×${fmt(m)} on turn ${c.turn} (+0.3 a turn, ×4 from turn 11)`]; } },
    { key: 'dusk', rule: '×2.5 at night or in caves (main games: ×3.5)', name: 'Dusk Ball', price: 1350, sure: 'wiki',
      mult: (c) => (c.night ? [2.5, '×2.5 at night or in a cave'] : [1, '×1 by day outside (×2.5 at night or in a cave)']) },
    { key: 'net', rule: '×3.5 on Water and Bug (main games: ×3)', name: 'Net Ball', price: 1350, sure: 'wiki',
      mult: (c) => (c.types.some((t) => t === 'Water' || t === 'Bug') ? [3.5, '×3.5 on Water and Bug types'] : [1, '×1 (×3.5 on Water and Bug types; Soak makes anything Water)']) },
    { key: 'dive', rule: '×3.5 surfing, fishing or underwater', name: 'Dive Ball', price: 1200, sure: 'wiki',
      mult: (c) => (c.water ? [3.5, '×3.5 when surfing, fishing or underwater'] : [1, '×1 on land (×3.5 when surfing, fishing or underwater)']) },
    { key: 'nest', rule: '7 − 0.2 × (level − 1), between ×1 and ×4', name: 'Nest Ball', price: 1200, sure: 'wiki',
      mult: (c) => { const m = Math.max(1, Math.min(4, 7 - 0.2 * (c.level - 1))); return [m, m >= 4 ? '×4 up to level 16' : m <= 1 ? '×1 from level 31 (×4 up to level 16)' : `×${fmt(m)} at level ${c.level} (×4 up to 16, ×1 from 31)`]; } },
    { key: 'repeat', rule: '+0.1 a catch in a row, up to ×2.5 at 15 (wiki: "up to ×2.5")', name: 'Repeat Ball', price: 1250, sure: 'player',
      mult: (c) => { const m = Math.min(2.5, 1 + Math.max(0, c.streak) / 10); return [m, m >= 2.5 ? '×2.5 after 15 catches of this species in a row' : `×${fmt(m)} after ${c.streak} catch${c.streak === 1 ? '' : 'es'} of this species in a row (×2.5 at 15)`]; } },
    { key: 'dream', rule: '×1.5, ×2.5, ×4 by the 3rd turn asleep (wiki: "up to ×4")', name: 'Dream Ball', price: 1200, sure: 'player',
      mult: (c) => { const t = c.asleepTurns; const m = t >= 3 ? 4 : t === 2 ? 2.5 : t === 1 ? 1.5 : 1;
        return [m, t >= 1 ? `×${fmt(m)} after ${t >= 3 ? '3 or more turns' : t === 1 ? '1 turn' : '2 turns'} asleep (1.5, 2.5, then ×4)` : '×1 unless it has been asleep (1.5, 2.5, then ×4 by the 3rd turn)']; } },
    { key: 'heal', rule: '×1.25', name: 'Heal Ball', price: 400, sure: 'wiki', mult: fixed(1.25, 'Always ×1.25, and heals what it catches') },
    { key: 'luxury', rule: '×1', name: 'Luxury Ball', price: 1000, sure: 'wiki', mult: fixed(1, 'Always ×1 (more friendship)') },
    { key: 'lure', rule: '×4 hooked with a rod', name: 'Lure Ball', price: 1000, sure: 'wiki',
      mult: (c) => (c.fishing ? [4, '×4 on a Pokémon hooked with a rod'] : [1, '×1 (×4 on a Pokémon hooked with a rod)']) },
    { key: 'level', rule: '×4 at the same level (wiki); main games compare levels', name: 'Level Ball', price: 1250, sure: 'guess',
      mult: (c) => (c.sameLevel ? [4, '×4 when your Pokémon is the same level'] : [1, '×1 (×4 when your Pokémon is the same level)']) },
    { key: 'love', rule: '×8 same line, other gender', name: 'Love Ball', price: 1250, sure: 'wiki',
      mult: (c) => (c.love ? [8, '×8 against your Pokémon\'s line, opposite gender'] : [1, '×1 (×8 against your Pokémon\'s line, opposite gender)']) },
    { key: 'moon', rule: '×4 Moon Stone evolvers', name: 'Moon Ball', price: 500, sure: 'wiki',
      mult: (c) => (c.moon ? [4, '×4 on Pokémon that evolve with a Moon Stone'] : [1, '×1 (×4 on Pokémon that evolve with a Moon Stone)']) },
    { key: 'friend', rule: '×2.5 friendship evolvers (a PokeMMO change)', name: 'Friend Ball', price: 500, sure: 'wiki',
      mult: (c) => (c.friend ? [2.5, '×2.5 on Pokémon that evolve by friendship'] : [1, '×1 (×2.5 on Pokémon that evolve by friendship)']) },
    { key: 'fast', rule: '×4 from base Speed 100 (wiki: "better if faster, up to ×4")', name: 'Fast Ball', price: 500, sure: 'guess',
      mult: (c) => (c.speed >= 100 ? [4, `×4 on base Speed 100 or more (${c.speed})`] : [1, `×1 (×4 on base Speed 100 or more; this one is ${c.speed})`]) },
    { key: 'heavy', rule: '×2/×3/×4 from 100/200/300 kg (wiki: "better if heavier, up to ×4")', name: 'Heavy Ball', price: 500, sure: 'guess',
      mult: (c) => { const kg = c.weight / 10; const m = kg >= 300 ? 4 : kg >= 200 ? 3 : kg >= 100 ? 2 : 1;
        return [m, `×${m} at ${fmt(kg)} kg (×2 from 100 kg, ×3 from 200, ×4 from 300)`]; } },
    // Not sold in shops: shown apart.
    { key: 'premier', rule: '×1.5', name: 'Premier Ball', price: 0, sure: 'wiki', other: true, mult: fixed(1.5, 'Always ×1.5') },
    { key: 'cherish', rule: '×2', name: 'Cherish Ball', price: 0, sure: 'wiki', other: true, mult: fixed(2, 'Always ×2 (10 for 200 RP)') },
    { key: 'safari', rule: '×1.5', name: 'Safari Ball', price: 0, sure: 'wiki', other: true, mult: fixed(1.5, '×1.5, Safari Zone only') },
    { key: 'master', rule: 'Always catches', name: 'Master Ball', price: 0, sure: 'wiki', other: true, master: true, mult: fixed(255, 'Always catches') },
  ];
  const BALL = Object.fromEntries(BALLS.map((b) => [b.key, b]));

  function fmt(n) { return String(Math.round(n * 100) / 100); }

  // Max HP at a level, with the IV and EVs given (the calculator assumes an average IV of 15 and no EVs).
  function maxHP(baseHP, level, iv = 15, ev = 0) {
    if (baseHP === 1) return 1; // Shedinja
    return Math.floor(((2 * baseHP + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  // The HP part of the formula, from 1/3 (full HP) up to almost 1 (1 HP).
  function hpFactor(max, hp) { max = Math.max(1, max); hp = Math.max(1, Math.min(max, hp)); return (3 * max - 2 * hp) / (3 * max); }

  // One ball's chance (0..1).
  function chance(rate, hpPart, ballMult, statusMult) {
    if (!(rate > 0)) return 0;
    if (ballMult >= 255) return 1;
    const x = hpPart * rate * ballMult * statusMult;
    if (x >= 255) return 1;
    const y = 1048560 / Math.sqrt(Math.sqrt(16711680 / x));
    return Math.min(1, Math.pow(y / 65535, 4));
  }
  // How many balls until the odds of having caught it reach `goal` (0.9 = 90%).
  function ballsFor(p, goal) {
    if (p >= 1) return 1;
    if (p <= 0) return Infinity;
    return Math.max(1, Math.ceil(Math.log(1 - goal) / Math.log(1 - p)));
  }
  // Every ball with its multiplier, why, and chance, for one throw.
  function rankBalls(ctx, hpPart, statusMult) {
    return BALLS.map((b) => {
      const [m, why] = b.mult(ctx);
      return { ball: b, mult: m, why, p: chance(ctx.rate, hpPart, m, statusMult) };
    });
  }
  // The best ball each turn from ctx.turn on (Quick first, then Timer once it pays), and the odds of having caught
  // it by each throw. One ball a turn; the status stays (sleep is kept up); with ctx.sleeping the Dream Ball counts
  // the turns asleep on.
  // Only balls you can buy (and Safari Balls in the Safari Zone) are used, and with ctx.useGuess === false not the
  // balls whose rule is a guess. Stops at 99% or after `max` throws.
  function plan(ctx, hpPart, statusMult, max = 40, cost = false) {
    const steps = []; let miss = 1;
    for (let k = 0; k < max && miss > 0.01; k++) {
      const c = { ...ctx, turn: ctx.turn + k, asleepTurns: ctx.sleeping ? ctx.asleepTurns + k : 0 };
      const all = rankBalls(c, hpPart, statusMult).filter((r) => (ctx.safari ? r.ball.key === 'safari' : !r.ball.other) && (ctx.useGuess !== false || r.ball.sure !== 'guess'));
      // best chance, or with cost: the cheapest per catch
      const best = all.reduce((a, r) => (cost ? (r.p > 0 && (!a || r.ball.price / r.p < a.ball.price / a.p) ? r : a)
        : (!a || r.p > a.p + 1e-12 || Math.abs(r.p - a.p) <= 1e-12 && r.ball.price < a.ball.price ? r : a)), null);
      if (!best || best.p <= 0) break;
      miss *= 1 - best.p;
      steps.push({ turn: c.turn, ball: best.ball, mult: best.mult, p: best.p, caught: 1 - miss });
    }
    return steps;
  }
  // The catch rate to use for a species (by dex number) and whether it is an alpha; null = not in the data.
  function rateOf(data, species, alpha) {
    if (!species || !species.i) return null;
    if (alpha) {
      const a = data.alphaRate;
      return Object.prototype.hasOwnProperty.call(a, species.n) ? a[species.n] : a.default;
    }
    return data.rate[species.i - 1];
  }
  // Which alpha list a species is on: 'swarm' (the 4 daily alpha swarms), 'event', 'limited' or ''.
  function alphaKind(data, name) {
    for (const k of ['swarm', 'event', 'limited']) if (data.alphas[k].some((line) => line.includes(name))) return k;
    return '';
  }

  const api = { STATUS, STATUS_LABEL, BALLS, BALL, maxHP, hpFactor, chance, ballsFor, rankBalls, plan, rateOf, alphaKind };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Catch = api;
})(typeof window !== 'undefined' ? window : globalThis);
