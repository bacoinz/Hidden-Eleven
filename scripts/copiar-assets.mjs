// Copia bandeiras (flag-icons, MIT) e fontes (Anton e Inter, OFL) de node_modules para public/.
// Corre uma vez depois de `npm install` (npm run assets); o resultado fica no repositório.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(raiz, 'node_modules');

const destinoBandeiras = join(raiz, 'public', 'bandeiras');
mkdirSync(destinoBandeiras, { recursive: true });
const origemBandeiras = join(nm, 'flag-icons', 'flags', '4x3');
let n = 0;
for (const f of readdirSync(origemBandeiras)) {
  if (!f.endsWith('.svg')) continue;
  copyFileSync(join(origemBandeiras, f), join(destinoBandeiras, f));
  n++;
}

const destinoFontes = join(raiz, 'public', 'fontes');
mkdirSync(destinoFontes, { recursive: true });
const fontes = [
  ['@fontsource/anton/files/anton-latin-400-normal.woff2', 'anton-latin.woff2'],
  ['@fontsource/anton/files/anton-latin-ext-400-normal.woff2', 'anton-latin-ext.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin.woff2'],
  ['@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2', 'inter-latin-ext.woff2'],
];
for (const [origem, destino] of fontes) copyFileSync(join(nm, origem), join(destinoFontes, destino));

const licencas = [
  '# Licenças de terceiros incluídas no Hidden Eleven',
  '',
  '## Bandeiras — flag-icons (https://github.com/lipis/flag-icons), licença MIT',
  readFileSync(join(nm, 'flag-icons', 'LICENSE'), 'utf8').trim(),
  '',
  '## Fontes — Anton (Vernon Adams) e Inter (Rasmus Andersson), SIL Open Font License 1.1',
  'Distribuídas através do Fontsource (https://fontsource.org).',
  '',
].join('\n');
writeFileSync(join(raiz, 'public', 'LICENCAS.txt'), licencas);

console.log(`Copiadas ${n} bandeiras e ${fontes.length} fontes para public/.`);
