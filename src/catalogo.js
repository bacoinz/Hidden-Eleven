// Catálogo de jogos: filtra por conteúdo, sorteia sem repetir e lista as equipas da Equipa Mítica.
import { jogos, equipas } from './dados.gen.js';
import { chavesDe } from './nomes.js';
import { REGRAS } from './regras.js';

export const JOGOS = new Map(jogos.map((j) => [j.id, j]));
export const EQUIPAS = equipas;

/** Todas as chaves de nomes da base (o matcher não "corrige" um nome real para outra pessoa). */
export const NOMES_CONHECIDOS = new Set(
  jogos.flatMap((j) =>
    j.equipas.flatMap((e) =>
      [e.treinador, ...e.onze, ...(e.suplentes ?? []), ...(e.nao_utilizados ?? []).map((n) => (typeof n === 'string' ? { nome: n } : n))]
        .flatMap((p) => chavesDe(p).map((c) => c.chave)),
    ),
  ),
);

/** Jogos de um conteúdo: 'finais' | 'classicos' | 'equipa' (com config.equipa) | 'aleatorio'. */
export function jogosDoConteudo({ conteudo, equipa } = {}, lista = jogos) {
  switch (conteudo) {
    case 'finais':
      return lista.filter((j) => j.modos.includes('final'));
    case 'classicos':
      return lista.filter((j) => j.modos.includes('classico'));
    case 'equipa':
      return lista.filter((j) => equipa && j.modos.includes(`equipa:${equipa}`));
    default:
      return lista;
  }
}

export function disponiveis(config, usados = [], lista = jogos) {
  const ja = new Set(usados);
  return jogosDoConteudo(config, lista).filter((j) => !ja.has(j.id));
}

export function sortear(config, usados = [], aleatorio = Math.random, lista = jogos) {
  const opcoes = disponiveis(config, usados, lista);
  if (!opcoes.length) return null;
  return opcoes[Math.floor(aleatorio() * opcoes.length)];
}

/** Equipas com jogos suficientes para a Equipa Mítica: destaques primeiro (pela ordem do ficheiro), depois por nome. */
export function equipasMiticas(lista = jogos, catalogoEquipas = equipas) {
  const ordem = Object.keys(catalogoEquipas);
  return ordem
    .map((slug) => ({
      slug,
      nome: catalogoEquipas[slug].nome,
      destaque: Boolean(catalogoEquipas[slug].destaque),
      jogos: lista.filter((j) => j.modos.includes(`equipa:${slug}`)).length,
    }))
    .filter((e) => e.jogos >= REGRAS.minimoJogosEquipa)
    .sort((a, b) => Number(b.destaque) - Number(a.destaque) || (a.destaque ? ordem.indexOf(a.slug) - ordem.indexOf(b.slug) : a.nome.localeCompare(b.nome, 'pt')));
}

export function contagens(lista = jogos) {
  return {
    finais: jogosDoConteudo({ conteudo: 'finais' }, lista).length,
    classicos: jogosDoConteudo({ conteudo: 'classicos' }, lista).length,
    aleatorio: lista.length,
  };
}
