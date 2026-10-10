/**
 * Modelo de dominio de La Primitiva.
 * Las combinaciones solo se construyen vía `toCombination`, así que cualquier
 * `Combination` que circule por el sistema es válida por construcción.
 */

export const LOTTERY = {
  min: 1,
  max: 49,
  pick: 6,
  /** Máximo de apuestas simples en un mismo boleto. */
  maxBetsPerTicket: 8,
  pricePerBet: 1,
} as const;

declare const BallBrand: unique symbol;
/** Número entero en [1, 49]. */
export type Ball = number & { readonly [BallBrand]: true };

declare const CombinationBrand: unique symbol;
/** 6 bolas distintas, ordenadas de menor a mayor e inmutables. */
export type Combination = readonly Ball[] & { readonly [CombinationBrand]: true };

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isBall = (n: number): n is Ball =>
  Number.isInteger(n) && n >= LOTTERY.min && n <= LOTTERY.max;

/** Todas las bolas del bombo, de 1 a 49. */
export const ALL_BALLS: readonly Ball[] = Object.freeze(
  Array.from({ length: LOTTERY.max - LOTTERY.min + 1 }, (_, i) => (i + LOTTERY.min) as Ball),
);

export function toCombination(nums: readonly number[]): Result<Combination, string> {
  if (nums.length !== LOTTERY.pick) {
    return err(`Se necesitan ${LOTTERY.pick} números y hay ${nums.length}`);
  }
  const invalid = nums.filter((n) => !isBall(n));
  if (invalid.length > 0) {
    return err(`Fuera del rango ${LOTTERY.min}-${LOTTERY.max}: ${invalid.join(', ')}`);
  }
  if (new Set(nums).size !== nums.length) {
    return err('Hay números repetidos');
  }
  const sorted = [...nums].sort((a, b) => a - b) as Ball[];
  return ok(Object.freeze(sorted) as unknown as Combination);
}

/** Clave canónica para comparar combinaciones ("4-17-23-36-41-48"). */
export const combinationKey = (c: Combination): string => c.join('-');

export const formatCombination = (c: Combination, separator = ' '): string =>
  c.join(separator);

/** Extrae enteros de un texto libre: "7, 13 y 21" → [7, 13, 21]. */
const extractIntegers = (input: string): number[] =>
  (input.match(/\d+/g) ?? []).map(Number);

/** Lista de números sueltos (para excluir). Rechaza los que no son bolas válidas. */
export function parseBallList(input: string): Result<Ball[], string> {
  const nums = extractIntegers(input);
  const invalid = nums.filter((n) => !isBall(n));
  if (invalid.length > 0) {
    return err(`Fuera del rango ${LOTTERY.min}-${LOTTERY.max}: ${invalid.join(', ')}`);
  }
  return ok([...new Set(nums)].sort((a, b) => a - b) as Ball[]);
}

/** Una combinación por línea (p. ej. combinaciones ganadoras anteriores). Ignora líneas vacías. */
export function parseCombinationList(input: string): Result<Combination[], string> {
  const combos: Combination[] = [];
  const lines = input.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const parsed = toCombination(extractIntegers(line));
    if (!parsed.ok) return err(`Línea ${i + 1}: ${parsed.error}`);
    combos.push(parsed.value);
  }
  return ok(combos);
}
