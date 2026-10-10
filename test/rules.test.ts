import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULE_SETTINGS,
  evaluate,
  longestArithmeticProgression,
  longestConsecutiveRun,
  sanitizeRuleSettings,
  toCombination,
  type Combination,
  type RuleId,
} from '../src/core/index.js';

const c = (...nums: number[]): Combination => {
  const r = toCombination(nums);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const failedRules = (combo: Combination): RuleId[] => evaluate(combo).map((v) => v.rule);

describe('helpers', () => {
  it('detecta rachas consecutivas', () => {
    assert.equal(longestConsecutiveRun(c(1, 2, 3, 10, 20, 30)), 3);
    assert.equal(longestConsecutiveRun(c(4, 17, 23, 36, 41, 48)), 1);
  });

  it('detecta progresiones aritméticas no contiguas', () => {
    assert.equal(longestArithmeticProgression(c(5, 10, 15, 20, 33, 47)), 4);
    assert.equal(longestArithmeticProgression(c(3, 14, 25, 36, 40, 44)), 4); // salto 11 (diagonal)
    assert.equal(longestArithmeticProgression(c(4, 17, 23, 36, 41, 48)), 2);
  });
});

describe('reglas por defecto', () => {
  it('acepta una combinación sin patrones', () => {
    assert.deepEqual(failedRules(c(4, 17, 23, 36, 41, 48)), []);
  });

  it('rechaza combinaciones tipo fecha', () => {
    assert.ok(failedRules(c(3, 8, 12, 19, 24, 31)).includes('minHighNumbers'));
  });

  it('rechaza secuencias', () => {
    const rules = failedRules(c(1, 2, 3, 4, 5, 6));
    assert.ok(rules.includes('maxConsecutiveRun'));
    assert.ok(rules.includes('maxArithmeticProgression'));
  });

  it('rechaza misma decena y misma terminación', () => {
    assert.ok(failedRules(c(40, 41, 43, 45, 47, 2)).includes('maxSameDecade'));
    assert.ok(failedRules(c(7, 17, 27, 37, 40, 49)).includes('maxSameEnding'));
  });

  it('rechaza todo pares', () => {
    assert.ok(failedRules(c(2, 14, 26, 34, 40, 48)).includes('minEachParity'));
  });

  it('una regla desactivada no se evalúa', () => {
    const settings = { ...DEFAULT_RULE_SETTINGS, minHighNumbers: { enabled: false, value: 2 } };
    assert.deepEqual(evaluate(c(3, 8, 12, 19, 24, 31), settings), []);
  });
});

describe('sanitizeRuleSettings', () => {
  it('rellena valores por defecto y recorta al rango', () => {
    const s = sanitizeRuleSettings({ minHighNumbers: { value: 99 }, minEachParity: { enabled: false } });
    assert.equal(s.minHighNumbers.value, 6);
    assert.equal(s.minEachParity.enabled, false);
    assert.equal(s.maxSameEnding.value, DEFAULT_RULE_SETTINGS.maxSameEnding.value);
  });
});
