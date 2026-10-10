import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOTAL_COMBINATIONS, probAtLeast, probExactly } from '../src/core/index.js';

describe('odds', () => {
  it('13.983.816 combinaciones', () => {
    assert.equal(TOTAL_COMBINATIONS, 13_983_816);
  });

  it('las probabilidades de 0..6 aciertos suman 1', () => {
    const total = [0, 1, 2, 3, 4, 5, 6].reduce((acc, k) => acc + probExactly(k), 0);
    assert.ok(Math.abs(total - 1) < 1e-12);
  });

  it('valores de referencia', () => {
    assert.equal(probExactly(6), 1 / 13_983_816);
    assert.ok(Math.abs(probExactly(0) - 0.4360) < 1e-4);
    assert.ok(Math.abs(probAtLeast(3) - 0.01864) < 1e-4);
  });
});
