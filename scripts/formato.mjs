// JSON legível para os ficheiros de jogos: objetos e listas curtos numa só linha (um jogador por linha).
const LARGURA = 150;

function compacto(valor) {
  if (Array.isArray(valor)) return `[${valor.map(compacto).join(', ')}]`;
  if (valor && typeof valor === 'object') {
    const pares = Object.entries(valor).map(([k, v]) => `${JSON.stringify(k)}: ${compacto(v)}`);
    return pares.length ? `{ ${pares.join(', ')} }` : '{}';
  }
  return JSON.stringify(valor);
}

export function formatarJson(valor, nivel = 0) {
  const recuo = '  '.repeat(nivel);
  const dentro = '  '.repeat(nivel + 1);
  const linha = compacto(valor);
  if (typeof valor !== 'object' || valor === null || recuo.length + linha.length <= LARGURA) return linha;
  if (Array.isArray(valor)) {
    return `[\n${valor.map((v) => dentro + formatarJson(v, nivel + 1)).join(',\n')}\n${recuo}]`;
  }
  const pares = Object.entries(valor).map(([k, v]) => `${dentro}${JSON.stringify(k)}: ${formatarJson(v, nivel + 1)}`);
  return `{\n${pares.join(',\n')}\n${recuo}}`;
}

export const formatarJogo = (jogo) => formatarJson(jogo) + '\n';
