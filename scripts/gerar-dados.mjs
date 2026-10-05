// Gera src/dados.gen.js: importa todos os data/jogos/*.json para dentro do bundle do Worker.
// Corre sozinho antes de `wrangler dev`/`wrangler deploy` (build.command) e antes dos testes.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ficheiros = readdirSync(join(raiz, 'data', 'jogos')).filter((f) => f.endsWith('.json')).sort();

const linhas = [
  '// GERADO por scripts/gerar-dados.mjs — não editar.',
  ...ficheiros.map((f, i) => `import j${i} from '../data/jogos/${f}' with { type: 'json' };`),
  "import equipas from '../data/equipas.json' with { type: 'json' };",
  '',
  `export const jogos = [${ficheiros.map((_, i) => `j${i}`).join(', ')}];`,
  'export { equipas };',
  '',
];
const destino = join(raiz, 'src', 'dados.gen.js');
const conteudo = linhas.join('\n');
// Só escreve se mudou, para não provocar recompilações em ciclo.
if (!existsSync(destino) || readFileSync(destino, 'utf8') !== conteudo) writeFileSync(destino, conteudo);
console.log(`dados.gen.js: ${ficheiros.length} jogos`);
