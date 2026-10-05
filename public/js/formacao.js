// Disposição de um onze no relvado a partir da formação e das siglas de posição.
// Módulo puro, partilhado pelo browser, pelos testes e pelo validador de dados.
//
// Coordenadas "da equipa": x de 0 (flanco direito) a 1 (flanco esquerdo);
// y de 0 (linha de golo própria) a 1 (linha mais avançada).

export const SIGLAS = ['GR', 'DD', 'DC', 'DE', 'MDC', 'MC', 'MD', 'ME', 'MO', 'ED', 'EE', 'PL'];

/** Profundidade de cada sigla: ordena os jogadores de trás para a frente. */
export const PROFUNDIDADE = { GR: 0, DD: 1, DC: 1, DE: 1, MDC: 2, MD: 3, MC: 3, ME: 3, MO: 4, ED: 4.5, EE: 4.5, PL: 5 };
const LADO = { DD: 0, MD: 0, ED: 0, DE: 2, ME: 2, EE: 2 }; // restantes: 1 (centro)

const Y_GR = 0.05;
const Y_PRIMEIRA = 0.27;
const Y_ULTIMA = 0.9;

/** "4-2-3-1" → [4,2,3,1]; "4-4-2 losango" → [4,1,2,1,2]. */
export function linhasDaFormacao(formacao) {
  const texto = String(formacao ?? '');
  if (/losango|diamante|diamond/i.test(texto)) {
    const d = texto.match(/\d/g)?.map(Number) ?? [];
    if (d.join('-') === '4-4-2') return [4, 1, 2, 1, 2];
  }
  return texto.match(/\d/g)?.map(Number) ?? [];
}

const largura = (n) => (n <= 1 ? 0 : n === 2 ? 0.36 : n === 3 ? 0.6 : n === 4 ? 0.8 : 0.86);

/**
 * Coloca cada jogador do onze. Devolve [{ indice, linha, x, y }] na ordem do array original.
 * Se a formação não bater certo com o número de jogadores, agrupa pelas profundidades das siglas.
 */
export function disporOnze(onze, formacao) {
  const resultado = new Array(onze.length);
  const campo = onze.map((p, i) => ({ p, i })).filter(({ p }) => p.pos !== 'GR');
  onze.forEach((p, i) => {
    if (p.pos === 'GR') resultado[i] = { indice: i, linha: 0, x: 0.5, y: Y_GR };
  });
  campo.sort((a, b) => PROFUNDIDADE[a.p.pos] - PROFUNDIDADE[b.p.pos] || a.i - b.i);

  let linhas = linhasDaFormacao(formacao);
  if (linhas.reduce((s, n) => s + n, 0) !== campo.length) linhas = linhasPorProfundidade(campo);

  const total = linhas.length;
  let k = 0;
  linhas.forEach((n, li) => {
    const grupo = ordenarLateralmente(campo.slice(k, k + n));
    k += n;
    const yLinha = total === 1 ? (Y_PRIMEIRA + Y_ULTIMA) / 2 : Y_PRIMEIRA + ((Y_ULTIMA - Y_PRIMEIRA) * li) / (total - 1);
    const espaco = total > 1 ? (Y_ULTIMA - Y_PRIMEIRA) / (total - 1) : 0.2;
    const misto = new Set(grupo.map((g) => g.p.pos)).size > 1;
    const w = largura(n);
    grupo.forEach((g, j) => {
      const x = n === 1 ? 0.5 : 0.5 - w / 2 + (w * j) / (n - 1);
      let y = yLinha;
      // Pequenos ajustes dentro de linhas mistas: o trinco mais recuado, o 10 mais avançado.
      if (misto && g.p.pos === 'MDC') y -= espaco * 0.3;
      if (misto && g.p.pos === 'MO') y += espaco * 0.3;
      if (misto && (g.p.pos === 'ED' || g.p.pos === 'EE') && grupo.some((o) => o.p.pos === 'PL')) y -= espaco * 0.15;
      resultado[g.i] = { indice: g.i, linha: li + 1, x, y };
    });
  });
  return resultado;
}

/**
 * Direita → centro → esquerda; no centro mantém a ordem do array (direita para a esquerda),
 * mas um trinco ou um 10 isolado entre médios fica no meio (4-3-3: MC, MDC, MC).
 */
function ordenarLateralmente(grupo) {
  const lado = (g) => LADO[g.p.pos] ?? 1;
  const porOrdem = (a, b) => a.i - b.i;
  const direita = grupo.filter((g) => lado(g) === 0).sort(porOrdem);
  const esquerda = grupo.filter((g) => lado(g) === 2).sort(porOrdem);
  let centro = grupo.filter((g) => lado(g) === 1).sort(porOrdem);
  for (const pivo of ['MDC', 'MO']) {
    const pivos = centro.filter((g) => g.p.pos === pivo);
    if (pivos.length === 1 && centro.length >= 3) {
      const outros = centro.filter((g) => g !== pivos[0]);
      const meio = Math.floor(outros.length / 2);
      centro = [...outros.slice(0, meio), pivos[0], ...outros.slice(meio)];
      break;
    }
  }
  return [...direita, ...centro, ...esquerda];
}

function linhasPorProfundidade(campo) {
  const contagem = new Map();
  for (const { p } of campo) {
    const nivel = Math.floor(PROFUNDIDADE[p.pos] ?? 3);
    contagem.set(nivel, (contagem.get(nivel) ?? 0) + 1);
  }
  return [...contagem.keys()].sort((a, b) => a - b).map((nivel) => contagem.get(nivel));
}

/**
 * Verifica se a formação é coerente com as siglas (usado pelo validador):
 * 10 jogadores de campo, 1 guarda-redes, a primeira linha só com defesas e a última sem defesas nem médios defensivos.
 */
export function problemasDaFormacao(onze, formacao) {
  const problemas = [];
  const grs = onze.filter((p) => p.pos === 'GR').length;
  if (grs !== 1) problemas.push(`${grs} guarda-redes`);
  const invalidas = onze.filter((p) => !SIGLAS.includes(p.pos)).map((p) => p.pos);
  if (invalidas.length) problemas.push(`siglas inválidas: ${invalidas.join(', ')}`);
  const linhas = linhasDaFormacao(formacao);
  const soma = linhas.reduce((s, n) => s + n, 0);
  if (soma !== 10) {
    problemas.push(`formação "${formacao}" soma ${soma} jogadores de campo`);
    return problemas;
  }
  if (invalidas.length) return problemas;
  const campo = onze.filter((p) => p.pos !== 'GR').sort((a, b) => PROFUNDIDADE[a.pos] - PROFUNDIDADE[b.pos]);
  const defesas = campo.filter((p) => PROFUNDIDADE[p.pos] === 1).length;
  if (defesas !== linhas[0]) problemas.push(`formação pede ${linhas[0]} defesas mas há ${defesas}`);
  const ultima = campo.slice(soma - linhas[linhas.length - 1]);
  if (ultima.some((p) => PROFUNDIDADE[p.pos] <= 2)) problemas.push('a linha mais avançada tem defesas ou trincos');
  // Jogadores com a mesma sigla de profundidade não podem ficar partidos entre duas linhas.
  let k = 0;
  for (let li = 0; li < linhas.length - 1; li++) {
    k += linhas[li];
    const antes = PROFUNDIDADE[campo[k - 1].pos];
    const depois = PROFUNDIDADE[campo[k].pos];
    if (antes === depois) problemas.push(`${campo[k - 1].pos} e ${campo[k].pos} ficam em linhas diferentes (linha ${li + 1}/${li + 2})`);
  }
  return problemas;
}
