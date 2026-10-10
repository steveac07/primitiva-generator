# Generador Primitiva

Genera combinaciones aleatorias para La Primitiva descartando los patrones que juega mucha gente (fechas, secuencias, escaleras, columnas, terminaciones repetidas).

**Qué hace y qué no.** Cada combinación tiene la misma probabilidad: 1 entre 13.983.816. Ningún filtro ni análisis de sorteos pasados cambia eso. Lo que sí cambia es el reparto: las categorías altas se dividen entre acertantes, así que evitar combinaciones populares reduce con cuánta gente compartirías un premio si toca.

## Uso

```bash
npm install
npm run gen                                  # 5 apuestas, 30 números distintos
npm run gen -- --bets 8 --shared 1           # 8 apuestas, máx. 1 número en común entre ellas
npm run gen -- --exclude 7,13                # no usar el 7 ni el 13
npm run gen -- --winners ganadoras.txt       # no repetir combinaciones ya premiadas (una por línea)
npm run gen -- --rule minHighNumbers=3 --off minEachParity
npm run gen -- --json                        # salida para scripts y automatizaciones
npm run gen -- --help
```

Web: `npm run build` genera `dist/index.html`, un único fichero autocontenido (CSS y JS inline). Los ajustes se guardan en el navegador.

## Filtros por defecto

| Regla | Por defecto | Combinaciones aleatorias que descarta |
|---|---|---|
| `minHighNumbers` | ≥ 2 números > 31 | ~27 % |
| `maxSameEnding` | ≤ 2 con la misma terminación | ~9 % |
| `maxSameDecade` | ≤ 3 de la misma decena | ~5,5 % |
| `maxConsecutiveRun` | ≤ 2 seguidos | ~4,7 % |
| `maxArithmeticProgression` | ≤ 3 en progresión | ~2,6 % |
| `minEachParity` | ≥ 1 par y ≥ 1 impar | ~2,2 % |

En conjunto aceptan ~59 % de las combinaciones posibles (medido sobre 200.000 muestras).

## Arquitectura

```
src/core/        Dominio puro, sin DOM ni Node. Compartido por CLI y web.
  domain.ts      Tipos de marca (Ball, Combination), Result<T, E>, parsers
  rng.ts         RandomSource inyectable: Web Crypto con muestreo por rechazo (sin sesgo de módulo) o semilla fija para tests
  rules.ts       Reglas declarativas (`satisfies Record<string, RuleDefinition>`), RuleId derivado de las claves
  generator.ts   generateTicket(): validación previa, control de solapamiento entre apuestas, reinicios acotados
  odds.ts        Probabilidades exactas (hipergeométrica 6/49)
src/cli.ts       CLI con node:util parseArgs
src/web/         Plantilla, estilos y capa de presentación
scripts/         Build con esbuild → HTML de un solo fichero
test/            node:test (25 tests, incluido chi-cuadrado de uniformidad)
```

TypeScript en modo estricto con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run gen` | CLI |
| `npm test` | Tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `dist/index.html` |
| `npm run check` | Typecheck + tests + build (lo que ejecuta CI) |

## Despliegue en Netlify

Conecta el repo en Netlify: `netlify.toml` ya define el build (`npm run build`, publica `dist`, Node 22) y cabeceras de seguridad (CSP restrictiva, `nosniff`, `no-referrer`). GitHub Actions ejecuta `npm run check` en cada push y PR.
