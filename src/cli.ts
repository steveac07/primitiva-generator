#!/usr/bin/env -S npx tsx
/**
 * CLI del generador.
 *
 *   npm run gen                              → 5 apuestas, todas con números distintos
 *   npm run gen -- --bets 8 --shared 1       → 8 apuestas, máx. 1 número en común
 *   npm run gen -- --exclude 7,13            → nunca usar 7 ni 13
 *   npm run gen -- --winners ganadoras.txt   → no repetir combinaciones ya premiadas
 *   npm run gen -- --rule minHighNumbers=3 --off minEachParity
 *   npm run gen -- --json                    → salida para automatizar
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  DEFAULT_RULE_SETTINGS,
  LOTTERY,
  RULES,
  RULE_IDS,
  TOTAL_COMBINATIONS,
  cryptoRandom,
  formatCombination,
  generateTicket,
  parseBallList,
  parseCombinationList,
  probAnyBetAtLeast,
  seededRandom,
  type Ball,
  type Combination,
  type RuleDefinition,
  type RuleId,
  type RuleSetting,
} from './core/index.js';

const HELP = `Generador de La Primitiva

Uso: npm run gen -- [opciones]

  --bets <n>        Apuestas (1-${LOTTERY.maxBetsPerTicket}). Por defecto 5
  --shared <n>      Máx. números en común entre apuestas (0-5). Por defecto 0
  --exclude <lista> Números a no usar, p. ej. "7,13,21"
  --winners <file>  Fichero con combinaciones a evitar (una por línea)
  --rule <id=v>     Ajusta una regla (repetible)
  --off <id>        Desactiva una regla (repetible)
  --seed <n>        Semilla fija (reproducible, no criptográfica)
  --json            Salida JSON
  -h, --help        Esta ayuda

Reglas:
${RULE_IDS.map((id) => {
  const r: RuleDefinition = RULES[id];
  return `  ${id.padEnd(26)} ${r.describe(r.defaultValue)}`;
}).join('\n')}
`;

const isRuleId = (s: string): s is RuleId => (RULE_IDS as string[]).includes(s);

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function parseIntArg(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) fail(`--${name} debe ser un entero`);
  return n;
}

function buildRules(overrides: string[], disabled: string[]): Record<RuleId, RuleSetting> {
  const rules: Record<RuleId, RuleSetting> = { ...DEFAULT_RULE_SETTINGS };
  for (const entry of overrides) {
    const [id, raw] = entry.split('=');
    if (id === undefined || !isRuleId(id)) fail(`Regla desconocida: ${id}`);
    const value = Number(raw);
    const [min, max] = (RULES[id] as RuleDefinition).range;
    if (!Number.isInteger(value) || value < min || value > max) fail(`${id} admite ${min}-${max}`);
    rules[id] = { enabled: true, value };
  }
  for (const id of disabled) {
    if (!isRuleId(id)) fail(`Regla desconocida: ${id}`);
    rules[id] = { ...rules[id], enabled: false };
  }
  return rules;
}

const percent = (p: number): string =>
  `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;

function main(): void {
  const { values } = parseArgs({
    options: {
      bets: { type: 'string' },
      shared: { type: 'string' },
      exclude: { type: 'string' },
      winners: { type: 'string' },
      rule: { type: 'string', multiple: true },
      off: { type: 'string', multiple: true },
      seed: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const bets = parseIntArg('bets', values.bets, 5);
  const maxSharedNumbers = parseIntArg('shared', values.shared, 0);

  let excludedNumbers: Ball[] = [];
  if (values.exclude !== undefined) {
    const parsed = parseBallList(values.exclude);
    if (!parsed.ok) fail(parsed.error);
    excludedNumbers = parsed.value;
  }

  let excludedCombinations: Combination[] = [];
  if (values.winners !== undefined) {
    const parsed = parseCombinationList(readFileSync(values.winners, 'utf8'));
    if (!parsed.ok) fail(`${values.winners}: ${parsed.error}`);
    excludedCombinations = parsed.value;
  }

  const rng = values.seed !== undefined ? seededRandom(parseIntArg('seed', values.seed, 0)) : cryptoRandom;

  const result = generateTicket({
    bets,
    maxSharedNumbers,
    excludedNumbers,
    excludedCombinations,
    rules: buildRules(values.rule ?? [], values.off ?? []),
    rng,
  });

  if (!result.ok) fail(result.error.message);
  const ticket = result.value;

  if (values.json) {
    process.stdout.write(`${JSON.stringify({
      bets: ticket.bets,
      cost: bets * LOTTERY.pricePerBet,
      candidatesTried: ticket.candidatesTried,
      odds: { jackpot: `${bets}/${TOTAL_COMBINATIONS}`, atLeast3: probAnyBetAtLeast(3, bets) },
    }, null, 2)}\n`);
    return;
  }

  const distinct = new Set(ticket.bets.flat()).size;
  const lines = ticket.bets.map((b, i) =>
    ` #${i + 1}  ${b.map((n) => String(n).padStart(2, ' ')).join('  ')}`);

  process.stdout.write([
    `La Primitiva · ${bets} apuestas · ${distinct} números distintos`,
    '',
    ...lines,
    '',
    `Coste: ${bets * LOTTERY.pricePerBet} €`,
    `P(6 aciertos) = ${bets} / ${TOTAL_COMBINATIONS.toLocaleString('es-ES')}`,
    `P(≥3 aciertos en alguna apuesta) ≈ ${percent(probAnyBetAtLeast(3, bets))}`,
    '',
    'Para copiar:',
    ...ticket.bets.map((b) => formatCombination(b)),
    '',
  ].join('\n'));
}

main();
