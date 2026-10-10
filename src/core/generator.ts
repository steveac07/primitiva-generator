/**
 * Generador de boletos: N apuestas aleatorias que pasan los filtros anti-patrón,
 * no repiten combinaciones excluidas y comparten como mucho `maxSharedNumbers`
 * números entre cualquier par de apuestas.
 */

import {
  ALL_BALLS,
  LOTTERY,
  combinationKey,
  err,
  ok,
  toCombination,
  type Ball,
  type Combination,
  type Result,
} from './domain.js';
import { cryptoRandom, sample, type RandomSource } from './rng.js';
import { DEFAULT_RULE_SETTINGS, evaluate, type RuleSettings } from './rules.js';

export interface GeneratorOptions {
  /** Número de apuestas (1-8, lo que cabe en un boleto). */
  readonly bets: number;
  /** Máximo de números en común entre dos apuestas cualesquiera (0 = todas distintas). */
  readonly maxSharedNumbers: number;
  readonly excludedNumbers?: readonly Ball[];
  /** Combinaciones que no se deben generar (p. ej. ganadoras anteriores). */
  readonly excludedCombinations?: readonly Combination[];
  readonly rules?: RuleSettings;
  readonly rng?: RandomSource;
  /** Intentos por apuesta antes de reiniciar el boleto. */
  readonly attemptsPerBet?: number;
  /** Reinicios completos antes de rendirse. */
  readonly maxRestarts?: number;
}

export type GenerationError =
  | { readonly kind: 'invalid-options'; readonly message: string }
  | { readonly kind: 'exhausted'; readonly message: string; readonly candidatesTried: number };

export interface Ticket {
  readonly bets: readonly Combination[];
  /** Candidatas evaluadas en total (útil para ver cuánto filtran las reglas). */
  readonly candidatesTried: number;
}

export const sharedCount = (a: Combination, b: Combination): number => {
  const set = new Set<number>(a);
  return b.filter((n) => set.has(n)).length;
};

function validate(o: GeneratorOptions, poolSize: number): string | null {
  if (!Number.isInteger(o.bets) || o.bets < 1 || o.bets > LOTTERY.maxBetsPerTicket) {
    return `Apuestas debe estar entre 1 y ${LOTTERY.maxBetsPerTicket}`;
  }
  if (!Number.isInteger(o.maxSharedNumbers) || o.maxSharedNumbers < 0 || o.maxSharedNumbers > LOTTERY.pick - 1) {
    return `Números compartidos debe estar entre 0 y ${LOTTERY.pick - 1}`;
  }
  if (poolSize < LOTTERY.pick) {
    return `Quedan ${poolSize} números disponibles tras excluir; hacen falta al menos ${LOTTERY.pick}`;
  }
  if (o.maxSharedNumbers === 0 && o.bets * LOTTERY.pick > poolSize) {
    return `${o.bets} apuestas sin números repetidos necesitan ${o.bets * LOTTERY.pick} números y solo hay ${poolSize}. Permite compartir al menos 1.`;
  }
  return null;
}

export function generateTicket(options: GeneratorOptions): Result<Ticket, GenerationError> {
  const {
    rules = DEFAULT_RULE_SETTINGS,
    rng = cryptoRandom,
    attemptsPerBet = 5_000,
    maxRestarts = 200,
  } = options;

  const excluded = new Set<number>(options.excludedNumbers ?? []);
  const pool = ALL_BALLS.filter((n) => !excluded.has(n));

  const invalid = validate(options, pool.length);
  if (invalid !== null) return err({ kind: 'invalid-options', message: invalid });

  const forbidden = new Set((options.excludedCombinations ?? []).map(combinationKey));
  let candidatesTried = 0;

  for (let restart = 0; restart <= maxRestarts; restart++) {
    const bets: Combination[] = [];

    while (bets.length < options.bets) {
      let accepted: Combination | null = null;

      for (let attempt = 0; attempt < attemptsPerBet && accepted === null; attempt++) {
        candidatesTried++;
        const parsed = toCombination(sample(pool, LOTTERY.pick, rng));
        if (!parsed.ok) continue; // imposible con un pool válido; defensivo
        const candidate = parsed.value;

        if (forbidden.has(combinationKey(candidate))) continue;
        if (bets.some((b) => sharedCount(b, candidate) > options.maxSharedNumbers)) continue;
        if (evaluate(candidate, rules).length > 0) continue;

        accepted = candidate;
      }

      if (accepted === null) break; // este boleto se ha atascado: reiniciar
      bets.push(accepted);
    }

    if (bets.length === options.bets) return ok({ bets, candidatesTried });
  }

  return err({
    kind: 'exhausted',
    message: 'No se encontraron combinaciones que cumplan todos los filtros. Relaja alguna regla, permite compartir más números o excluye menos.',
    candidatesTried,
  });
}
