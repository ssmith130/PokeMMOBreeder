// node test/catch.test.js
const assert = require('assert');
const Catch = require('../src/catch.js');
const data = require('../data/catch.json');
const near = (a, b, d = 1e-4) => assert.ok(Math.abs(a - b) < d, `${a} != ${b}`);

// Xanarchy's worked example (PokeMMO forums, Feb 2025): 336 = 3 x max HP 112, at 1 HP, rate 35, ×2.5, asleep: 68.22%
near(Catch.chance(35, (336 - 2) / 336, 2.5, 2), 0.682189, 1e-5);
// one ball = X / 255
near(Catch.chance(45, Catch.hpFactor(100, 100), 1, 1), 45 / 3 / 255);
assert.strictEqual(Catch.chance(255, 1, 1, 1), 1);
assert.strictEqual(Catch.chance(0, 1, 5, 2), 0);
assert.strictEqual(Catch.chance(3, 1 / 3, 255, 1), 1); // Master Ball
// MMOBreeder's examples: rate 45 Poké Ball full HP 5.9%, Ultra Ball 1 HP asleep ~70.6%
near(Catch.chance(45, 1 / 3, 1, 1), 0.0588, 1e-3);
near(Catch.chance(45, 1, 2, 2), 0.7059, 1e-3);

// rates from the wiki's PokeMMO data
const rate = (dex) => data.rate[dex - 1];
assert.strictEqual(rate(2), 30); assert.strictEqual(rate(3), 15); assert.strictEqual(rate(1), 45);
assert.deepStrictEqual([rate(374), rate(375), rate(376)], [25, 20, 15]);
assert.strictEqual(rate(243), 5); assert.strictEqual(rate(144), 5);
assert.ok(data.outside.includes(150) && !data.outside.includes(243));
assert.strictEqual(Catch.rateOf(data, { i: 248, n: 'Tyranitar' }, true), 3);
assert.strictEqual(Catch.rateOf(data, { i: 246, n: 'Larvitar' }, true), 10);
assert.strictEqual(Catch.rateOf(data, { i: 245, n: 'Suicune' }, true), 0);
assert.strictEqual(Catch.alphaKind(data, 'Garchomp'), 'swarm');
assert.strictEqual(Catch.alphaKind(data, 'Chandelure'), 'event');
assert.strictEqual(Catch.alphaKind(data, 'Charizard'), 'limited');
assert.strictEqual(Catch.alphaKind(data, 'Beldum'), '');

// balls
const ctx = { rate: 45, level: 30, types: ['Water'], speed: 80, weight: 3000, friend: false, moon: false, turn: 1,
  night: false, water: false, fishing: false, sameLevel: false, love: false, streak: 0, asleepTurns: 0 };
const m = (k, c = {}) => Catch.BALL[k].mult({ ...ctx, ...c })[0];
assert.strictEqual(m('quick'), 5); assert.strictEqual(m('quick', { turn: 2 }), 1);
near(m('timer', { turn: 2 }), 1.3); assert.strictEqual(m('timer', { turn: 11 }), 4); assert.strictEqual(m('timer', { turn: 30 }), 4);
assert.strictEqual(m('timer'), 1);
assert.strictEqual(m('nest', { level: 5 }), 4); assert.strictEqual(m('nest', { level: 16 }), 4); near(m('nest', { level: 21 }), 3); assert.strictEqual(m('nest', { level: 40 }), 1);
assert.strictEqual(m('net'), 3.5); assert.strictEqual(m('net', { types: ['Fire'] }), 1);
assert.strictEqual(m('dusk', { night: true }), 2.5);
assert.strictEqual(m('repeat', { streak: 15 }), 2.5); near(m('repeat', { streak: 5 }), 1.5);
assert.deepStrictEqual([0, 1, 2, 3, 9].map((t) => m('dream', { asleepTurns: t })), [1, 1.5, 2.5, 4, 4]);
assert.strictEqual(m('heavy'), 4); assert.strictEqual(m('heavy', { weight: 999 }), 1);
assert.strictEqual(m('fast', { speed: 100 }), 4);

// plan: turn 1 Quick Ball, later Timer Balls
const steps = Catch.plan({ ...ctx, rate: 10, types: ['Fire'], weight: 100 }, 1, 2);
assert.strictEqual(steps[0].ball.key, 'quick');
assert.strictEqual(steps[steps.length - 1].ball.key, 'timer');
assert.ok(steps[steps.length - 1].caught >= 0.99);
assert.strictEqual(Catch.ballsFor(0.5, 0.9), 4);
assert.strictEqual(Catch.maxHP(80, 50), 147); assert.strictEqual(Catch.maxHP(80, 50, 31), 155);
console.log('catch tests passed');
