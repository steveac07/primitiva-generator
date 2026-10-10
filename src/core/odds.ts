/** Probabilidades exactas de La Primitiva (distribución hipergeométrica 6 de 49). */

import { LOTTERY } from './domain.js';

export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) {
    result = (result * (n - i + 1)) / i;
  }
  return Math.round(result);
}

/** 13.983.816 combinaciones posibles. */
export const TOTAL_COMBINATIONS = binomial(LOTTERY.max, LOTTERY.pick);

/** P(acertar exactamente k números) con una apuesta. */
export function probExactly(k: number): number {
  const { max, pick } = LOTTERY;
  return (binomial(pick, k) * binomial(max - pick, pick - k)) / TOTAL_COMBINATIONS;
}

/** P(acertar k o más números) con una apuesta. */
export function probAtLeast(k: number): number {
  let p = 0;
  for (let i = k; i <= LOTTERY.pick; i++) p += probExactly(i);
  return p;
}

/**
 * P(que al menos una de `bets` apuestas acierte k o más).
 * Aproximación por independencia: con apuestas distintas el error es despreciable.
 */
export function probAnyBetAtLeast(k: number, bets: number): number {
  return 1 - (1 - probAtLeast(k)) ** bets;
}

/** Aciertos esperados por apuesta: 6 · 6 / 49 ≈ 0,73. */
export const EXPECTED_HITS_PER_BET = (LOTTERY.pick * LOTTERY.pick) / LOTTERY.max;
