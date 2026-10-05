// Resumo compacto de cada jogo (para rever formações, posições e nomes). Uso: node scripts/resumo-jogos.mjs [filtro]
import { carregarJogos } from './validar-dados.mjs';

const filtro = process.argv[2] ?? '';
for (const { jogo } of carregarJogos()) {
  if (filtro && !jogo.id.includes(filtro)) continue;
  console.log(`=== ${jogo.id} | ${jogo.data} | ${jogo.resultado} | ${jogo.estadio}${jogo.titulo ? ` | «${jogo.titulo}»` : ''} | ${jogo.modos.join(',')}`);
  for (const e of jogo.equipas) {
    const al = (p) => (p.aceites?.length ? `{${p.aceites.join('/')}}` : '');
    const gol = (p) => (p.golos ? `⚽${p.golos.map((g) => `${g.minuto}${g.penalti ? 'p' : ''}${g.autogolo ? 'ag' : ''}`).join(',')}` : '');
    console.log(`  ${e.nome} ${e.cor ?? ''} ${e.formacao} | T: ${e.treinador.nome}${al(e.treinador)}`);
    console.log(`    ${e.onze.map((p) => `${p.pos}:${p.nome}#${p.numero}${p.pais === e.onze[0].pais ? '' : `(${p.pais})`}${al(p)}${gol(p)}`).join(' | ')}`);
    console.log(`    S: ${e.suplentes.map((p) => `${p.nome} ${p.minuto}'${al(p)}${gol(p)}`).join(' | ')}`);
    console.log(`    N: ${e.nao_utilizados.map((n) => (typeof n === 'string' ? n : n.nome)).join(', ')}`);
  }
}
