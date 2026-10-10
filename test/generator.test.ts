import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_BALLS,
  evaluate,
  generateTicket,
  sample,
  seededRandom,
  sharedCount,
  toCombination,
  type Ball,
  type Combination,
} from '../src/core/index.js';

const pairs = <T>(items: readonly T[]): [T, T][] =>
  items.flatMap((a, i) => items.slice(i + 1).map((b): [T, T] => [a, b]));

describe('generateTicket', () => {
  it('genera 5 apuestas válidas, distintas y sin números compartidos', () => {
    const r = generateTicket({ bets: 5, maxSharedNumbers: 0, rng: seededRandom(42) });
    assert.ok(r.ok);
    const { bets } = r.value;
    assert.equal(bets.length, 5);
    for (const b of bets) assert.deepEqual(evaluate(b), []);
    for (const [a, b] of pairs(bets)) assert.equal(sharedCount(a, b), 0);
    assert.equal(new Set(bets.flat()).size, 30);
  });

  it('es reproducible con la misma semilla', () => {
    const a = generateTicket({ bets: 3, maxSharedNumbers: 1, rng: seededRandom(7) });
    const b = generateTicket({ bets: 3, maxSharedNumbers: 1, rng: seededRandom(7) });
    assert.deepEqual(a, b);
  });

  it('respeta números excluidos', () => {
    const excluded = [7, 13, 21, 33, 44] as Ball[];
    const r = generateTicket({ bets: 8, maxSharedNumbers: 2, excludedNumbers: excluded, rng: seededRandom(1) });
    assert.ok(r.ok);
    for (const n of r.value.bets.flat()) assert.ok(!excluded.includes(n));
  });

  it('nunca devuelve una combinación excluida', () => {
    const rng = seededRandom(3);
    // Excluye 5.000 combinaciones aleatorias y comprueba que ninguna sale.
    const excludedCombinations: Combination[] = Array.from({ length: 5_000 }, () => {
      const r = toCombination(sample(ALL_BALLS, 6, rng));
      if (!r.ok) throw new Error(r.error);
      return r.value;
    });
    const keys = new Set(excludedCombinations.map((x) => x.join('-')));
    const r = generateTicket({ bets: 8, maxSharedNumbers: 3, excludedCombinations, rng: seededRandom(4) });
    assert.ok(r.ok);
    for (const b of r.value.bets) assert.ok(!keys.has(b.join('-')));
  });

  it('respeta el máximo de números compartidos', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = generateTicket({ bets: 8, maxSharedNumbers: 1, rng: seededRandom(seed) });
      assert.ok(r.ok);
      for (const [a, b] of pairs(r.value.bets)) assert.ok(sharedCount(a, b) <= 1);
    }
  });

  it('valida opciones imposibles antes de buscar', () => {
    const tooMany = generateTicket({ bets: 9, maxSharedNumbers: 0 });
    assert.ok(!tooMany.ok && tooMany.error.kind === 'invalid-options');

    const noRoom = generateTicket({ bets: 8, maxSharedNumbers: 0, excludedNumbers: [1, 2] as Ball[] });
    assert.ok(!noRoom.ok && noRoom.error.kind === 'invalid-options');
  });

  it('informa si los filtros hacen imposible el boleto', () => {
    // 6 números > 31 obligatorios y máx. 1 por decena: solo hay 2 decenas altas → imposible.
    const r = generateTicket({
      bets: 1,
      maxSharedNumbers: 0,
      rng: seededRandom(9),
      attemptsPerBet: 200,
      maxRestarts: 2,
      rules: {
        minHighNumbers: { enabled: true, value: 6 },
        maxConsecutiveRun: { enabled: true, value: 2 },
        maxArithmeticProgression: { enabled: true, value: 3 },
        maxSameDecade: { enabled: true, value: 1 },
        maxSameEnding: { enabled: true, value: 2 },
        minEachParity: { enabled: true, value: 1 },
      },
    });
    assert.ok(!r.ok && r.error.kind === 'exhausted');
  });
});

describe('aleatoriedad', () => {
  it('reparte las bolas de forma aproximadamente uniforme (chi-cuadrado)', () => {
    const rng = seededRandom(2026);
    const counts = new Array<number>(50).fill(0);
    const draws = 60_000;
    for (let i = 0; i < draws; i++) for (const n of sample(ALL_BALLS, 6, rng)) counts[n] = (counts[n] ?? 0) + 1;
    const expected = (draws * 6) / 49;
    const chi2 = counts.slice(1).reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
    // 48 grados de libertad: p = 0,001 → 84,0
    assert.ok(chi2 < 84, `chi² = ${chi2.toFixed(1)}`);
  });
});
