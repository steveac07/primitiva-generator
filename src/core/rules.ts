/**
 * Filtros anti-patrón.
 *
 * Importante: NINGÚN filtro cambia la probabilidad de acertar (todas las
 * combinaciones valen 1 / 13.983.816). Lo que hacen es descartar las
 * combinaciones que juega mucha gente, para que, si toca un premio de
 * categoría alta (repartido entre acertantes), haya que compartirlo menos.
 */

import type { Combination } from './domain.js';

export interface RuleDefinition {
  readonly label: string;
  readonly describe: (value: number) => string;
  readonly defaultValue: number;
  readonly range: readonly [min: number, max: number];
  /** `null` si la combinación cumple; si no, el motivo del descarte. */
  readonly check: (c: Combination, value: number) => string | null;
}

const countBy = (c: Combination, key: (n: number) => number): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const n of c) counts.set(key(n), (counts.get(key(n)) ?? 0) + 1);
  return counts;
};

const maxCount = (counts: Map<number, number>): number => Math.max(0, ...counts.values());

/** Racha más larga de números consecutivos (combinación ya ordenada). */
export function longestConsecutiveRun(c: Combination): number {
  let best = c.length > 0 ? 1 : 0;
  let run = best;
  for (let i = 1; i < c.length; i++) {
    run = (c[i] ?? 0) - (c[i - 1] ?? 0) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Mayor número de elementos que forman una progresión aritmética (escaleras, saltos fijos, diagonales). */
export function longestArithmeticProgression(c: Combination): number {
  const present = new Set<number>(c);
  let best = Math.min(c.length, 2);
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const start = c[i] ?? 0;
      const step = (c[j] ?? 0) - start;
      let length = 2;
      while (present.has(start + step * length)) length++;
      best = Math.max(best, length);
    }
  }
  return best;
}

export const HIGH_THRESHOLD = 31;

export const RULES = {
  minHighNumbers: {
    label: 'Anti-fechas',
    describe: (v) => `Al menos ${v} números mayores de ${HIGH_THRESHOLD} (cumpleaños y fechas solo llegan al 31)`,
    defaultValue: 2,
    range: [0, 6],
    check: (c, v) => {
      const high = c.filter((n) => n > HIGH_THRESHOLD).length;
      return high >= v ? null : `Solo ${high} números > ${HIGH_THRESHOLD}`;
    },
  },
  maxConsecutiveRun: {
    label: 'Sin rachas',
    describe: (v) => `Máximo ${v} números seguidos (evita 12-13-14…)`,
    defaultValue: 2,
    range: [1, 6],
    check: (c, v) => {
      const run = longestConsecutiveRun(c);
      return run <= v ? null : `Racha de ${run} consecutivos`;
    },
  },
  maxArithmeticProgression: {
    label: 'Sin escaleras',
    describe: (v) => `Máximo ${v} números en progresión (5-10-15-20, diagonales…)`,
    defaultValue: 3,
    range: [2, 6],
    check: (c, v) => {
      const ap = longestArithmeticProgression(c);
      return ap <= v ? null : `${ap} números en progresión aritmética`;
    },
  },
  maxSameDecade: {
    label: 'Repartir decenas',
    describe: (v) => `Máximo ${v} números de la misma decena (misma columna)`,
    defaultValue: 3,
    range: [1, 6],
    check: (c, v) => {
      const worst = maxCount(countBy(c, (n) => Math.floor(n / 10)));
      return worst <= v ? null : `${worst} números en la misma decena`;
    },
  },
  maxSameEnding: {
    label: 'Repartir terminaciones',
    describe: (v) => `Máximo ${v} números con la misma terminación (7-17-27…)`,
    defaultValue: 2,
    range: [1, 6],
    check: (c, v) => {
      const worst = maxCount(countBy(c, (n) => n % 10));
      return worst <= v ? null : `${worst} números con la misma terminación`;
    },
  },
  minEachParity: {
    label: 'Mezclar pares e impares',
    describe: (v) => (v === 0 ? 'Sin mínimo de pares o impares' : v === 1 ? 'Al menos 1 par y 1 impar' : `Al menos ${v} pares y ${v} impares`),
    defaultValue: 1,
    range: [0, 3],
    check: (c, v) => {
      const even = c.filter((n) => n % 2 === 0).length;
      const minority = Math.min(even, c.length - even);
      return minority >= v ? null : `${even} pares / ${c.length - even} impares`;
    },
  },
} as const satisfies Record<string, RuleDefinition>;

export type RuleId = keyof typeof RULES;

export const RULE_IDS = Object.keys(RULES) as RuleId[];

export interface RuleSetting {
  readonly enabled: boolean;
  readonly value: number;
}

export type RuleSettings = { readonly [K in RuleId]: RuleSetting };

export const DEFAULT_RULE_SETTINGS: RuleSettings = Object.freeze(
  Object.fromEntries(
    RULE_IDS.map((id) => [id, { enabled: true, value: RULES[id].defaultValue }]),
  ) as Record<RuleId, RuleSetting>,
);

export interface Violation {
  readonly rule: RuleId;
  readonly message: string;
}

export function evaluate(c: Combination, settings: RuleSettings = DEFAULT_RULE_SETTINGS): Violation[] {
  const violations: Violation[] = [];
  for (const id of RULE_IDS) {
    const { enabled, value } = settings[id];
    if (!enabled) continue;
    const rule: RuleDefinition = RULES[id];
    const message = rule.check(c, value);
    if (message !== null) violations.push({ rule: id, message });
  }
  return violations;
}

/** Normaliza ajustes que vengan de fuera (UI, CLI, localStorage) al rango válido de cada regla. */
export function sanitizeRuleSettings(input: Partial<Record<string, Partial<RuleSetting>>>): RuleSettings {
  return Object.fromEntries(
    RULE_IDS.map((id) => {
      const rule: RuleDefinition = RULES[id];
      const raw = input[id] ?? {};
      const [min, max] = rule.range;
      const value = typeof raw.value === 'number' && Number.isFinite(raw.value)
        ? Math.min(max, Math.max(min, Math.round(raw.value)))
        : rule.defaultValue;
      const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
      return [id, { enabled, value }];
    }),
  ) as Record<RuleId, RuleSetting>;
}
