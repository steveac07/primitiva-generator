/**
 * Fuentes de aleatoriedad inyectables.
 * Producción usa Web Crypto (Node 22+ y navegador); los tests usan una semilla fija.
 */

export interface RandomSource {
  /** Entero uniforme en [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 0x1_0000_0000;

function assertBound(maxExclusive: number): void {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new RangeError(`maxExclusive inválido: ${maxExclusive}`);
  }
}

/**
 * CSPRNG con muestreo por rechazo: descarta la cola del rango uint32 que
 * introduciría sesgo de módulo, así cada número tiene exactamente la misma probabilidad.
 */
export const cryptoRandom: RandomSource = {
  nextInt(maxExclusive) {
    assertBound(maxExclusive);
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const buffer = new Uint32Array(1);
    for (;;) {
      globalThis.crypto.getRandomValues(buffer);
      const x = buffer[0] ?? 0;
      if (x < limit) return x % maxExclusive;
    }
  },
};

/** PRNG determinista (mulberry32). Solo para tests y reproducibilidad, no criptográfico. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
  return {
    nextInt(maxExclusive) {
      assertBound(maxExclusive);
      return Math.floor(next() * maxExclusive);
    },
  };
}

/** Muestra k elementos distintos sin reemplazo (Fisher-Yates parcial). */
export function sample<T>(pool: readonly T[], k: number, rng: RandomSource): T[] {
  if (k > pool.length) throw new RangeError(`No se pueden sacar ${k} de ${pool.length}`);
  const items = [...pool];
  for (let i = 0; i < k; i++) {
    const j = i + rng.nextInt(items.length - i);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items.slice(0, k);
}
