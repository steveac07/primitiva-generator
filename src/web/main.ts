/**
 * Capa de presentación. Toda la lógica vive en ../core; aquí solo hay estado de
 * UI, persistencia local opcional y pintado del DOM.
 */

import {
  ALL_BALLS,
  DEFAULT_RULE_SETTINGS,
  HIGH_THRESHOLD,
  LOTTERY,
  RULES,
  RULE_IDS,
  TOTAL_COMBINATIONS,
  formatCombination,
  generateTicket,
  isBall,
  parseCombinationList,
  probAnyBetAtLeast,
  sanitizeRuleSettings,
  type Ball,
  type Combination,
  type GenerationError,
  type Result,
  type RuleDefinition,
  type RuleId,
  type RuleSetting,
  type RuleSettings,
  type Ticket,
} from '../core/index.js';

// ── Estado ──────────────────────────────────────────────────────────────────

interface State {
  bets: number;
  shared: number;
  excluded: Set<Ball>;
  rules: RuleSettings;
  winnersText: string;
}

const STORAGE_KEY = 'primitiva-generator:v1';
const MAX_SHARED = LOTTERY.pick - 1;

const defaultState = (): State => ({
  bets: 5,
  shared: 0,
  excluded: new Set(),
  rules: DEFAULT_RULE_SETTINGS,
  winnersText: '',
});

const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

function loadState(): State {
  let stored: Record<string, unknown> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
    }
  } catch {
    // Sin almacenamiento disponible (ventana privada, vista previa): valores por defecto.
  }
  const fallback = defaultState();
  const excluded = Array.isArray(stored['excluded'])
    ? (stored['excluded'] as unknown[]).filter((n): n is Ball => typeof n === 'number' && isBall(n))
    : [];
  const rawRules = stored['rules'];
  return {
    bets: clampInt(stored['bets'], 1, LOTTERY.maxBetsPerTicket, fallback.bets),
    shared: clampInt(stored['shared'], 0, MAX_SHARED, fallback.shared),
    excluded: new Set(excluded),
    rules: typeof rawRules === 'object' && rawRules !== null
      ? sanitizeRuleSettings(rawRules as Partial<Record<string, Partial<RuleSetting>>>)
      : fallback.rules,
    winnersText: typeof stored['winnersText'] === 'string' ? stored['winnersText'] : '',
  };
}

function saveState(s: State): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      bets: s.bets,
      shared: s.shared,
      excluded: [...s.excluded],
      rules: s.rules,
      winnersText: s.winnersText,
    }));
  } catch {
    // Persistencia opcional.
  }
}

let state = loadState();
let lastTicket: Ticket | null = null;

// ── Utilidades DOM ──────────────────────────────────────────────────────────

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Falta #${id} en la plantilla`);
  return el as T;
}

interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class !== undefined) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

const fmtInt = (n: number): string => n.toLocaleString('es-ES');
const fmtPct = (p: number): string =>
  `${(p * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

/** Copia al portapapeles; si el entorno lo bloquea, selecciona el texto para Ctrl/Cmd+C. */
async function copyText(text: string, button: HTMLButtonElement, fallbackTarget: HTMLElement): Promise<void> {
  const original = button.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copiado';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(fallbackTarget);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    button.textContent = 'Seleccionado';
  }
  window.setTimeout(() => { button.textContent = original; }, 1600);
}

// ── Elementos ───────────────────────────────────────────────────────────────

const els = {
  bets: byId<HTMLOListElement>('bets'),
  error: byId<HTMLDivElement>('error'),
  stats: byId<HTMLDListElement>('stats'),
  copyText: byId<HTMLPreElement>('copy-text'),
  copyAll: byId<HTMLButtonElement>('copy-all'),
  generate: byId<HTMLButtonElement>('generate'),
  betsPicker: byId<HTMLDivElement>('bets-picker'),
  costHint: byId<HTMLSpanElement>('cost-hint'),
  sharedPicker: byId<HTMLDivElement>('shared-picker'),
  excludeGrid: byId<HTMLDivElement>('exclude-grid'),
  excludeHint: byId<HTMLParagraphElement>('exclude-hint'),
  clearExcluded: byId<HTMLButtonElement>('clear-excluded'),
  rules: byId<HTMLUListElement>('rules'),
  winners: byId<HTMLTextAreaElement>('winners'),
  winnersStatus: byId<HTMLParagraphElement>('winners-status'),
  winnersGroup: byId<HTMLDetailsElement>('winners-group'),
  reset: byId<HTMLButtonElement>('reset'),
};

// ── Generación y resultado ──────────────────────────────────────────────────

function parsedWinners(): Combination[] {
  const parsed = parseCombinationList(state.winnersText);
  return parsed.ok ? parsed.value : [];
}

function generate(animate: boolean): void {
  const result = generateTicket({
    bets: state.bets,
    maxSharedNumbers: state.shared,
    excludedNumbers: [...state.excluded],
    excludedCombinations: parsedWinners(),
    rules: state.rules,
    // Límites más bajos que en la CLI para no bloquear la interfaz si los filtros son imposibles.
    attemptsPerBet: 2_000,
    maxRestarts: 30,
  });
  renderResult(result, animate);
}

function betRow(c: Combination, index: number, animate: boolean): HTMLLIElement {
  const balls = h('div', { class: 'balls' }, c.map((n, j) => {
    const ball = h('span', { class: 'ball', text: String(n) });
    if (animate) ball.style.setProperty('--d', `${index * 45 + j * 30}ms`);
    return ball;
  }));

  const high = c.filter((n) => n > HIGH_THRESHOLD).length;
  const even = c.filter((n) => n % 2 === 0).length;
  const meta = h('p', {
    class: 'meta',
    text: `${high} por encima de ${HIGH_THRESHOLD} · ${even} pares, ${c.length - even} impares`,
  });

  const copy = h('button', {
    class: 'btn ghost small copy-one',
    text: 'Copiar',
    attrs: { type: 'button', 'aria-label': `Copiar apuesta ${index + 1}` },
  });
  copy.addEventListener('click', () => { void copyText(formatCombination(c), copy, balls); });

  return h('li', { class: 'bet', attrs: { 'aria-label': `Apuesta ${index + 1}: ${c.join(', ')}` } }, [
    h('p', { class: 'bet-label' }, [h('span', { text: 'Apuesta' }), h('b', { text: String(index + 1) })]),
    h('div', { class: 'bet-body' }, [balls, meta]),
    copy,
  ]);
}

function stat(term: string, value: string, note?: string): HTMLDivElement {
  const dd = h('dd', { text: value });
  if (note !== undefined) dd.append(h('small', { text: note }));
  return h('div', {}, [h('dt', { text: term }), dd]);
}

function renderResult(result: Result<Ticket, GenerationError>, animate: boolean): void {
  if (!result.ok) {
    lastTicket = null;
    els.error.textContent = result.error.message;
    els.error.hidden = false;
    els.bets.replaceChildren();
    els.stats.replaceChildren();
    els.copyText.textContent = '';
    els.copyAll.disabled = true;
    syncExcludeGrid();
    return;
  }

  const ticket = result.value;
  lastTicket = ticket;
  els.error.hidden = true;
  els.copyAll.disabled = false;

  els.bets.classList.remove('animate');
  els.bets.replaceChildren(...ticket.bets.map((c, i) => betRow(c, i, animate)));
  if (animate) {
    void els.bets.offsetWidth; // reinicia la animación
    els.bets.classList.add('animate');
  }

  const n = ticket.bets.length;
  const rejected = ticket.candidatesTried - n;
  els.stats.replaceChildren(
    stat('Coste', `${n * LOTTERY.pricePerBet} €`, `${n} ${n === 1 ? 'apuesta simple' : 'apuestas simples'}`),
    stat('6 aciertos', `${n} entre ${fmtInt(TOTAL_COMBINATIONS)}`, 'exacto'),
    stat('3 o más en alguna', `≈ ${fmtPct(probAnyBetAtLeast(3, n))}`, 'en este sorteo'),
    stat('Descartadas', fmtInt(rejected), `de ${fmtInt(ticket.candidatesTried)} candidatas`),
  );

  els.copyText.textContent = ticket.bets.map((c) => formatCombination(c)).join('\n');
  syncExcludeGrid();
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

function onSettingsChange(): void {
  saveState(state);
  syncSettings();
  generate(true);
}

function segmentedButtons(container: HTMLElement, values: readonly number[], onPick: (v: number) => void): void {
  container.replaceChildren(...values.map((v) => {
    const b = h('button', { text: String(v), attrs: { type: 'button', 'data-value': String(v), 'aria-pressed': 'false' } });
    b.addEventListener('click', () => onPick(v));
    return b;
  }));
}

function syncSegmented(container: HTMLElement, current: number): void {
  for (const b of container.querySelectorAll<HTMLButtonElement>('button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset['value']) === current));
  }
}

function syncExcludeGrid(): void {
  const inTicket = new Set<number>(lastTicket?.bets.flat() ?? []);
  for (const b of els.excludeGrid.querySelectorAll<HTMLButtonElement>('button')) {
    const n = Number(b.dataset['value']);
    const excluded = state.excluded.has(n as Ball);
    b.setAttribute('aria-pressed', String(excluded));
    b.classList.toggle('in-ticket', !excluded && inTicket.has(n));
    b.setAttribute('aria-label', excluded ? `${n}, excluido` : `${n}${inTicket.has(n) ? ', en tu boleto' : ''}`);
  }
  const k = state.excluded.size;
  els.excludeHint.textContent = k === 0
    ? 'Toca un número para no usarlo. En azul, los que lleva tu boleto.'
    : `${k} ${k === 1 ? 'excluido' : 'excluidos'} · quedan ${ALL_BALLS.length - k} números disponibles.`;
  els.clearExcluded.hidden = k === 0;
}

const ruleRefs = new Map<RuleId, {
  readonly row: HTMLLIElement;
  readonly checkbox: HTMLInputElement;
  readonly desc: HTMLParagraphElement;
  readonly output: HTMLOutputElement;
  readonly dec: HTMLButtonElement;
  readonly inc: HTMLButtonElement;
}>();

function setRule(id: RuleId, patch: Partial<RuleSetting>): void {
  state = { ...state, rules: { ...state.rules, [id]: { ...state.rules[id], ...patch } } };
  onSettingsChange();
}

function buildRules(): void {
  els.rules.replaceChildren(...RULE_IDS.map((id) => {
    const rule: RuleDefinition = RULES[id];
    const inputId = `rule-${id}`;
    const checkbox = h('input', { attrs: { type: 'checkbox', id: inputId, 'aria-describedby': `${inputId}-desc` } });
    const desc = h('p', { class: 'hint', attrs: { id: `${inputId}-desc` } });
    const output = h('output', { attrs: { 'aria-live': 'polite' } });
    const dec = h('button', { text: '−', attrs: { type: 'button', 'aria-label': `Reducir ${rule.label}` } });
    const inc = h('button', { text: '+', attrs: { type: 'button', 'aria-label': `Aumentar ${rule.label}` } });

    checkbox.addEventListener('change', () => setRule(id, { enabled: checkbox.checked }));
    dec.addEventListener('click', () => setRule(id, { value: Math.max(rule.range[0], state.rules[id].value - 1) }));
    inc.addEventListener('click', () => setRule(id, { value: Math.min(rule.range[1], state.rules[id].value + 1) }));

    const row = h('li', { class: 'rule' }, [
      checkbox,
      h('div', { class: 'rule-text' }, [h('label', { text: rule.label, attrs: { for: inputId } }), desc]),
      h('div', { class: 'stepper' }, [dec, output, inc]),
    ]);
    ruleRefs.set(id, { row, checkbox, desc, output, dec, inc });
    return row;
  }));
}

function syncRules(): void {
  for (const id of RULE_IDS) {
    const refs = ruleRefs.get(id);
    if (refs === undefined) continue;
    const rule: RuleDefinition = RULES[id];
    const { enabled, value } = state.rules[id];
    refs.checkbox.checked = enabled;
    refs.row.classList.toggle('off', !enabled);
    refs.desc.textContent = rule.describe(value);
    refs.output.textContent = String(value);
    refs.dec.disabled = !enabled || value <= rule.range[0];
    refs.inc.disabled = !enabled || value >= rule.range[1];
  }
}

function syncWinnersStatus(): void {
  const parsed = parseCombinationList(state.winnersText);
  if (!parsed.ok) {
    els.winners.setAttribute('aria-invalid', 'true');
    els.winnersStatus.textContent = `${parsed.error}. Mientras tanto no se aplica la lista.`;
    els.winnersStatus.classList.add('bad');
    return;
  }
  els.winners.removeAttribute('aria-invalid');
  els.winnersStatus.classList.remove('bad');
  const k = parsed.value.length;
  els.winnersStatus.textContent = k === 0 ? '' : `${k} ${k === 1 ? 'combinación evitada' : 'combinaciones evitadas'}.`;
}

function syncSettings(): void {
  syncSegmented(els.betsPicker, state.bets);
  syncSegmented(els.sharedPicker, state.shared);
  els.costHint.textContent = `${state.bets * LOTTERY.pricePerBet} €`;
  syncRules();
  syncWinnersStatus();
  syncExcludeGrid();
}

function init(): void {
  segmentedButtons(
    els.betsPicker,
    Array.from({ length: LOTTERY.maxBetsPerTicket }, (_, i) => i + 1),
    (v) => { state = { ...state, bets: v }; onSettingsChange(); },
  );
  segmentedButtons(
    els.sharedPicker,
    Array.from({ length: MAX_SHARED + 1 }, (_, i) => i),
    (v) => { state = { ...state, shared: v }; onSettingsChange(); },
  );

  els.excludeGrid.replaceChildren(...ALL_BALLS.map((n) => {
    const b = h('button', { text: String(n), attrs: { type: 'button', 'data-value': String(n), 'aria-pressed': 'false' } });
    b.addEventListener('click', () => {
      const excluded = new Set(state.excluded);
      if (excluded.has(n)) excluded.delete(n); else excluded.add(n);
      state = { ...state, excluded };
      onSettingsChange();
    });
    return b;
  }));

  els.clearExcluded.addEventListener('click', () => {
    state = { ...state, excluded: new Set() };
    onSettingsChange();
  });

  buildRules();

  els.winners.value = state.winnersText;
  if (state.winnersText.trim() !== '') els.winnersGroup.open = true;
  let winnersTimer = 0;
  els.winners.addEventListener('input', () => {
    state = { ...state, winnersText: els.winners.value };
    window.clearTimeout(winnersTimer);
    winnersTimer = window.setTimeout(onSettingsChange, 400);
  });

  els.reset.addEventListener('click', () => {
    state = defaultState();
    els.winners.value = '';
    onSettingsChange();
  });

  els.generate.addEventListener('click', () => generate(true));
  els.copyAll.addEventListener('click', () => {
    if (lastTicket === null) return;
    void copyText(els.copyText.textContent ?? '', els.copyAll, els.copyText);
  });

  syncSettings();
  generate(false);
}

init();
