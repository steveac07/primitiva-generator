import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBallList, parseCombinationList, toCombination } from '../src/core/index.js';

describe('toCombination', () => {
  it('ordena y congela una combinación válida', () => {
    const r = toCombination([48, 4, 23, 17, 41, 36]);
    assert.ok(r.ok);
    assert.deepEqual([...r.value], [4, 17, 23, 36, 41, 48]);
    assert.ok(Object.isFrozen(r.value));
  });

  it('rechaza longitud, rango y repetidos', () => {
    assert.equal(toCombination([1, 2, 3]).ok, false);
    assert.equal(toCombination([0, 2, 3, 4, 5, 6]).ok, false);
    assert.equal(toCombination([1, 2, 3, 4, 5, 50]).ok, false);
    assert.equal(toCombination([1, 1, 3, 4, 5, 6]).ok, false);
    assert.equal(toCombination([1.5, 2, 3, 4, 5, 6]).ok, false);
  });
});

describe('parsers', () => {
  it('parseBallList acepta texto libre y deduplica', () => {
    const r = parseBallList('7, 13 y 7; 21');
    assert.ok(r.ok);
    assert.deepEqual(r.value, [7, 13, 21]);
  });

  it('parseBallList rechaza números fuera de rango', () => {
    assert.equal(parseBallList('7, 50').ok, false);
  });

  it('parseCombinationList ignora vacías y comentarios, e informa la línea errónea', () => {
    const okList = parseCombinationList('# ganadoras\n5 8 23 28 40 44\n\n7-11-20-31-40-42\n');
    assert.ok(okList.ok);
    assert.equal(okList.value.length, 2);

    const bad = parseCombinationList('5 8 23 28 40 44\n1 2 3');
    assert.ok(!bad.ok);
    assert.match(bad.error, /Línea 2/);
  });
});
