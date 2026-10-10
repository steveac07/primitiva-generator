/**
 * Empaqueta la web en un único HTML autocontenido (CSS y JS inline):
 *   dist/index.html            → documento completo para Netlify
 *   artifact/index.html        → fragmento sin <html>/<head>/<body> para publicar como artifact
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'src/web');

const HEAD_END = '<!-- @head-end -->';

async function main(): Promise<void> {
  const bundle = await build({
    entryPoints: [path.join(webDir, 'main.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
    legalComments: 'none',
  });
  const js = bundle.outputFiles[0]?.text;
  if (js === undefined) throw new Error('esbuild no generó salida');

  const [css, template] = await Promise.all([
    readFile(path.join(webDir, 'styles.css'), 'utf8'),
    readFile(path.join(webDir, 'index.html'), 'utf8'),
  ]);

  // Replacers en función para que `$` en el código no se interprete como patrón.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const fragment = template
    .replace('/* @styles */', () => css)
    .replace('<!-- @app -->', () => `<script>${safeJs}</script>`);

  const splitAt = fragment.indexOf(HEAD_END);
  if (splitAt === -1) throw new Error(`Falta el marcador ${HEAD_END} en la plantilla`);
  const head = fragment.slice(0, splitAt);
  const body = fragment.slice(splitAt + HEAD_END.length);

  const document = [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="description" content="Generador de combinaciones para La Primitiva con filtros anti-patrón.">',
    head.trim(),
    '</head>',
    '<body>',
    body.trim(),
    '</body>',
    '</html>',
    '',
  ].join('\n');

  await Promise.all([
    mkdir(path.join(root, 'dist'), { recursive: true }),
    mkdir(path.join(root, 'artifact'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, 'dist/index.html'), document),
    writeFile(path.join(root, 'artifact/index.html'), `${head.trim()}\n${body.trim()}\n`),
  ]);

  const kb = (s: string): string => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
  process.stdout.write(`dist/index.html ${kb(document)} · JS ${kb(js)} · CSS ${kb(css)}\n`);
}

await main();
