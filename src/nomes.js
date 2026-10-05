// Validação de nomes: decide a que pessoa de um jogo corresponde o que o jogador escreveu.
// Módulo puro (sem estado de jogo): o motor decide o que fazer com o resultado.

const ESPECIAIS = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i' };
const PARTICULAS = new Set([
  'van', 'von', 'der', 'den', 'de', 'di', 'da', 'das', 'do', 'dos', 'del', 'della', 'la', 'le', 'ten', 'ter', 'el', 'al', 'du', 'dal', 'mac',
]);

/** Índice do termo onde começa o apelido, contando com as partículas ("Edwin van der Sar" → 1). */
export function inicioDoApelido(termos) {
  let inicio = termos.length - 1;
  while (inicio > 1 && PARTICULAS.has(normalizar(termos[inicio - 1]))) inicio--;
  return Math.max(inicio, 0);
}

export const PRIORIDADE = { COMPLETO: 3, ACEITE: 2, APELIDO: 1 };

/** Minúsculas, sem acentos, sem pontuação, espaços simplificados. */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øłđðþßæœı]/g, (c) => ESPECIAIS[c])
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const letras = (chave) => chave.replace(/ /g, '').length;

/** Gralhas toleradas: 1 para nomes até 6 letras, 2 para nomes maiores. */
export function tolerancia(chave) {
  return letras(chave) <= 6 ? 1 : 2;
}

/**
 * Distância de Damerau-Levenshtein restrita (troca de letras vizinhas conta 1).
 * Devolve max + 1 assim que for impossível ficar dentro de `max`.
 */
export function distancia(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let antes = null;
  let anterior = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
      if (antes && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, antes[j - 2] + 1);
      }
      atual[j] = v;
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
    antes = anterior;
    anterior = atual;
  }
  return anterior[m];
}

/** Apelido automático: último termo, com e sem as partículas que o antecedem ("van der sar", "sar"). */
function apelidos(termos) {
  if (termos.length < 2) return [];
  const ultimo = termos[termos.length - 1];
  const inicio = inicioDoApelido(termos);
  const resultado = [];
  if (inicio < termos.length - 1) resultado.push(termos.slice(inicio).join(' '));
  resultado.push(ultimo);
  return resultado.filter((c) => letras(c) >= 3);
}

/** Chaves de uma pessoa com a respetiva prioridade (a maior quando a mesma chave aparece várias vezes). */
export function chavesDe(pessoa) {
  const mapa = new Map();
  const juntar = (chave, prioridade) => {
    if (!chave) return;
    if ((mapa.get(chave) ?? 0) < prioridade) mapa.set(chave, prioridade);
  };
  const completo = normalizar(pessoa.nome);
  juntar(completo, PRIORIDADE.COMPLETO);
  for (const a of pessoa.aceites ?? []) juntar(normalizar(a), PRIORIDADE.ACEITE);
  for (const a of apelidos(completo.split(' '))) juntar(a, PRIORIDADE.APELIDO);
  return [...mapa].map(([chave, prioridade]) => ({ chave, prioridade }));
}

/**
 * Índice de um jogo. `pessoas`: [{ id, nome, aceites? }].
 * `conhecidos`: chaves normalizadas de todas as pessoas da base (para não corrigir um nome real para outro).
 */
export function criarIndice(pessoas, { conhecidos = new Set() } = {}) {
  const porChave = new Map(); // chave -> Map(id -> prioridade)
  for (const pessoa of pessoas) {
    for (const { chave, prioridade } of chavesDe(pessoa)) {
      if (!porChave.has(chave)) porChave.set(chave, new Map());
      const ids = porChave.get(chave);
      if ((ids.get(pessoa.id) ?? 0) < prioridade) ids.set(pessoa.id, prioridade);
    }
  }
  // Para cada chave fica só quem a tem com a prioridade mais alta.
  const chaves = [];
  for (const [chave, ids] of porChave) {
    const topo = Math.max(...ids.values());
    const donos = [...ids].filter(([, pr]) => pr === topo).map(([id]) => id);
    chaves.push({ chave, prioridade: topo, ids: donos, tol: tolerancia(chave) });
  }
  return { chaves, porChave: new Map(chaves.map((c) => [c.chave, c])), conhecidos };
}

function resolver(candidatos) {
  // candidatos: [{ ids, prioridade }] — todos à mesma distância.
  const melhor = new Map();
  for (const c of candidatos) {
    for (const id of c.ids) melhor.set(id, Math.max(melhor.get(id) ?? 0, c.prioridade));
  }
  if (melhor.size === 1) return { tipo: 'unico', id: [...melhor.keys()][0] };
  const topo = Math.max(...melhor.values());
  const ganhadores = [...melhor].filter(([, pr]) => pr === topo).map(([id]) => id);
  if (ganhadores.length === 1) return { tipo: 'unico', id: ganhadores[0] };
  return { tipo: 'ambiguo', ids: ganhadores };
}

/** Procura o texto escrito no índice: { tipo: 'unico', id } | { tipo: 'ambiguo', ids } | { tipo: 'nenhum' }. */
export function procurar(indice, texto) {
  const alvo = normalizar(texto);
  if (!alvo) return { tipo: 'nenhum' };

  const exato = indice.porChave.get(alvo);
  if (exato) {
    return exato.ids.length === 1
      ? { tipo: 'unico', id: exato.ids[0], distancia: 0 }
      : { tipo: 'ambiguo', ids: exato.ids };
  }
  // Um nome real de outro jogo não é uma gralha.
  if (indice.conhecidos.has(alvo)) return { tipo: 'nenhum' };
  if (letras(alvo) < 3) return { tipo: 'nenhum' };

  let menor = Infinity;
  let candidatos = [];
  for (const c of indice.chaves) {
    const d = distancia(alvo, c.chave, c.tol);
    if (d > c.tol || d > menor) continue;
    if (d < menor) {
      menor = d;
      candidatos = [];
    }
    candidatos.push(c);
  }
  if (!candidatos.length) return { tipo: 'nenhum' };
  const r = resolver(candidatos);
  return r.tipo === 'unico' ? { ...r, distancia: menor } : r;
}
