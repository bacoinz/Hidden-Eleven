// Motor de uma ronda: lugares, palpites, pontos, pistas, fim e estado público.
// Puro: não faz I/O e recebe sempre a hora (`agora`), para ser testável.
import { REGRAS } from './regras.js';
import { criarIndice, procurar, normalizar, inicioDoApelido } from './nomes.js';

// ---------------------------------------------------------------------------
// Preparação de um jogo (determinística; pode ficar em cache)
// ---------------------------------------------------------------------------

/**
 * Lugares escondidos (onze, suplentes utilizados, treinador) das equipas em jogo
 * e índice de nomes (inclui os não utilizados). `equipa`: slug da Equipa Mítica ou null.
 */
export function prepararJogo(jogo, { equipa = null, conhecidos } = {}) {
  const incluidas = jogo.equipas.map((e, i) => ({ e, i })).filter(({ e }) => !equipa || e.slug === equipa);
  if (!incluidas.length) throw new Error(`A equipa "${equipa}" não joga em ${jogo.id}`);
  const lugares = [];
  const banco = [];
  for (const { e, i } of incluidas) {
    e.onze.forEach((p, k) => lugares.push({ id: `${i}o${k}`, equipa: i, tipo: 'onze', pessoa: p }));
    (e.suplentes ?? []).forEach((p, k) => lugares.push({ id: `${i}s${k}`, equipa: i, tipo: 'suplente', pessoa: p }));
    lugares.push({ id: `${i}t`, equipa: i, tipo: 'treinador', pessoa: e.treinador });
    (e.nao_utilizados ?? []).forEach((n, k) => banco.push({ id: `${i}n${k}`, pessoa: typeof n === 'string' ? { nome: n } : n }));
  }
  const pessoas = [...lugares, ...banco].map((l) => ({ id: l.id, nome: l.pessoa.nome, aceites: l.pessoa.aceites }));
  return {
    jogo,
    equipa,
    incluidas: incluidas.map(({ i }) => i),
    lugares,
    porId: new Map(lugares.map((l) => [l.id, l])),
    bancoIds: new Set(banco.map((b) => b.id)),
    indice: criarIndice(pessoas, { conhecidos }),
  };
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

/** Nome curto para a camisola: "C. Ronaldo", "R. Carvalho"; `curto` nos dados tem prioridade. */
export function curto(p) {
  if (p.curto) return p.curto;
  const nome = p.nome.trim();
  if (nome.length <= 12) return nome;
  const termos = nome.split(/\s+/);
  if (termos.length === 1) return nome;
  const apelido = termos.slice(inicioDoApelido(termos)).join(' ');
  const comInicial = `${termos[0][0]}. ${apelido}`;
  return comInicial.length <= 14 ? comInicial : apelido;
}

/** Inicial do apelido (3.ª pista); `inicial` nos dados tem prioridade. */
export function inicial(p) {
  if (p.inicial) return p.inicial;
  const termos = p.nome.trim().split(/\s+/);
  return termos[inicioDoApelido(termos)][0].toLocaleUpperCase('pt-PT');
}

// ---------------------------------------------------------------------------
// Ronda
// ---------------------------------------------------------------------------

/**
 * Nova ronda: ficha de 7 s e depois a corrida. `tipo`: 'multi' | 'solo'.
 * `lados` (duelo): { jogadorId: índice da equipa } — cada jogador só descobre a sua equipa.
 */
export function criarRonda({ jogo, equipa = null, tipo = 'multi', lados = null, agora }) {
  const duracaoBase = REGRAS.duracaoMs[tipo] ?? REGRAS.duracaoMs.multi;
  const fichaAte = agora + REGRAS.fichaMs;
  return {
    jogoId: jogo.id,
    equipa,
    tipo,
    duracaoBase,
    fichaAte,
    inicio: fichaAte,
    fim: fichaAte + duracaoBase,
    etapa: 'ficha',
    pistas: pistasDoJogo(jogo),
    nivelPista: 0,
    descobertas: {},
    terminadaEm: null,
    lados,
    stats: {},
  };
}

// ---------------------------------------------------------------------------
// Pistas
// ---------------------------------------------------------------------------
// Cada pista sai quando o relógio desce até uma meta do tempo inicial (3:00 → 2:24, 1:57, 1:30).
// Como cada acerto acrescenta 5 s ao relógio, enquanto se for acertando as pistas não aparecem.
// Depois de reveladas, ficam. Nos jogos entre seleções não há pista da bandeira.

export const TIPOS_PISTA = ['numero', 'pais', 'inicial'];

export function pistasDoJogo(jogo) {
  const todas = TIPOS_PISTA.map((tipo, i) => ({ tipo, fracao: REGRAS.pistas[i] }));
  return jogo.selecoes ? todas.filter((p) => p.tipo !== 'pais') : todas;
}

const pistasDe = (r) => r.pistas ?? TIPOS_PISTA.map((tipo, i) => ({ tipo, fracao: REGRAS.pistas[i] }));

/** Tempo que falta (ms) quando sai cada pista. */
export const limiaresPistas = (r) => pistasDe(r).map((p) => Math.round(r.duracaoBase * (1 - p.fracao)));

/** Nível de pistas a `agora` (nunca desce: uma pista revelada fica revelada). */
export function nivelPistaEm(r, agora) {
  const limiares = limiaresPistas(r);
  let nivel = r.nivelPista;
  while (nivel < limiares.length && r.fim - agora <= limiares[nivel]) nivel++;
  return nivel;
}

/** Pontos de um jogador do onze consoante a última pista revelada (5, 4, 3, 2). */
export function pontosOnze(r, nivel) {
  if (nivel <= 0) return REGRAS.pontosOnze[0];
  return REGRAS.pontosOnze[TIPOS_PISTA.indexOf(pistasDe(r)[nivel - 1].tipo) + 1];
}

/** Próximo instante em que a ronda muda sozinha (para o alarme), ou null. */
export function proximoPrazo(r) {
  if (r.etapa === 'ficha') return r.fichaAte;
  if (r.etapa !== 'corrida') return null;
  const limiar = limiaresPistas(r)[r.nivelPista];
  return limiar !== undefined ? r.fim - limiar : r.fim;
}

export function terminar(r, agora) {
  if (r.etapa === 'terminada') return false;
  r.etapa = 'terminada';
  r.terminadaEm = agora;
  return true;
}

/** Avança a ronda até `agora`. Devolve os eventos: inicio, pista (nivel), fim. */
export function avancar(r, agora) {
  const eventos = [];
  if (r.etapa === 'ficha' && agora >= r.fichaAte) {
    r.etapa = 'corrida';
    eventos.push({ tipo: 'inicio' });
  }
  if (r.etapa === 'corrida') {
    const nivel = nivelPistaEm(r, Math.min(agora, r.fim));
    while (r.nivelPista < nivel) {
      r.nivelPista++;
      eventos.push({ tipo: 'pista', nivel: r.nivelPista, pista: pistasDe(r)[r.nivelPista - 1].tipo });
    }
    if (agora >= r.fim && terminar(r, agora)) eventos.push({ tipo: 'fim', motivo: 'tempo' });
  }
  return eventos;
}

export const restantes = (r, prep) => prep.lugares.filter((l) => !r.descobertas[l.id]).length;

/** O onze (jogadores de campo) está todo descoberto: já se pode terminar a ronda sem os suplentes e treinadores. */
export const onzeCompleto = (r, prep) => prep.lugares.every((l) => l.tipo !== 'onze' || r.descobertas[l.id]);

/**
 * Processa um palpite. Respostas:
 * certo (lugar, pontos, bonus, terminou) · errado · ja (por) · banco · ambiguo · invalido · fora
 */
export function palpite(r, prep, jogadorId, texto, agora) {
  if (r.etapa !== 'corrida') return { r: 'fora' };
  const t = String(texto ?? '').trim();
  if (t.length < REGRAS.textoMin || t.length > REGRAS.textoMax || !normalizar(t)) return { r: 'invalido' };

  const achado = procurar(prep.indice, t);
  if (achado.tipo === 'nenhum') return { r: 'errado' };
  if (achado.tipo === 'ambiguo') return { r: 'ambiguo' };
  if (prep.bancoIds.has(achado.id)) return { r: 'banco' };

  const lugar = prep.porId.get(achado.id);
  const meuLado = r.lados?.[jogadorId];
  if (meuLado !== undefined && lugar.equipa !== meuLado) return { r: 'outra' };
  const ja = r.descobertas[lugar.id];
  if (ja) return { r: 'ja', por: ja.por, lugar: lugar.id };

  const pontos =
    lugar.tipo === 'onze'
      ? pontosOnze(r, nivelPistaEm(r, agora))
      : lugar.tipo === 'suplente'
        ? REGRAS.pontosSuplente
        : REGRAS.pontosTreinador;
  const descoberta = { por: jogadorId, pontos, em: agora };
  r.descobertas[lugar.id] = descoberta;
  r.fim += REGRAS.extraPorAcertoMs;

  const fechou = restantes(r, prep) === 0;
  if (fechou) {
    descoberta.bonus = REGRAS.bonusFecho;
    terminar(r, agora);
  }
  // Duelo: quem fecha primeiro o onze da sua equipa ganha a ronda.
  const ganhouDuelo = meuLado !== undefined && !fechou && onzeDaEquipaCompleto(r, prep, meuLado);
  if (ganhouDuelo) {
    r.vencedor = meuLado;
    terminar(r, agora);
  }
  return {
    r: 'certo',
    lugar: lugar.id,
    nome: curto(lugar.pessoa),
    pontos,
    bonus: descoberta.bonus ?? 0,
    terminou: fechou || ganhouDuelo,
    ...(ganhouDuelo ? { duelo: meuLado } : {}),
  };
}

const onzeDaEquipaCompleto = (r, prep, equipa) =>
  prep.lugares.every((l) => l.tipo !== 'onze' || l.equipa !== equipa || r.descobertas[l.id]);

/** Jogadores do onze descobertos por equipa (índice → quantos). */
export function onzeDescobertosPorEquipa(r, prep) {
  const conta = {};
  for (const l of prep.lugares) if (l.tipo === 'onze' && r.descobertas[l.id]) conta[l.equipa] = (conta[l.equipa] ?? 0) + 1;
  return conta;
}

/**
 * Fecha o duelo no fim da ronda: se ninguém fechou o onze, ganha a equipa com mais jogadores do onze descobertos
 * (empate: ninguém). Cada jogador do lado vencedor recebe o bónus. Só faz algo uma vez.
 */
export function resolverDuelo(r, prep) {
  if (!r.lados || r.bonusDuelo) return r.bonusDuelo ?? null;
  if (r.vencedor === undefined) {
    const conta = onzeDescobertosPorEquipa(r, prep);
    const [a, b] = prep.incluidas.map((i) => conta[i] ?? 0);
    r.vencedor = a === b ? null : a > b ? prep.incluidas[0] : prep.incluidas[1];
  }
  r.bonusDuelo = {};
  if (r.vencedor != null) {
    for (const [id, lado] of Object.entries(r.lados)) if (lado === r.vencedor) r.bonusDuelo[id] = REGRAS.bonusDuelo;
  }
  return r.bonusDuelo;
}

/** Conta o palpite nas estatísticas da ronda de quem o fez. */
export function registarEstatistica(r, jogadorId, resposta, agora) {
  const s = (r.stats[jogadorId] ??= { certos: 0, errados: 0, outros: 0, primeiroMs: null });
  if (resposta === 'certo') {
    s.certos += 1;
    if (s.primeiroMs == null) s.primeiroMs = Math.max(0, agora - r.inicio);
  } else if (resposta === 'errado') s.errados += 1;
  else if (['ja', 'banco', 'ambiguo', 'outra'].includes(resposta)) s.outros += 1;
}

/** Pontos de cada jogador nesta ronda (inclui o bónus de fecho). */
export function pontosDaRonda(r) {
  const pontos = {};
  for (const d of Object.values(r.descobertas)) pontos[d.por] = (pontos[d.por] ?? 0) + d.pontos + (d.bonus ?? 0);
  for (const [id, b] of Object.entries(r.bonusDuelo ?? {})) pontos[id] = (pontos[id] ?? 0) + b;
  return pontos;
}

// ---------------------------------------------------------------------------
// Estado público (nunca inclui nomes escondidos)
// ---------------------------------------------------------------------------

export function estadoPublico(r, prep) {
  const { jogo } = prep;
  const acabou = r.etapa === 'terminada';
  const nivel = r.etapa === 'ficha' ? 0 : r.nivelPista;
  const reveladas = new Set(pistasDe(r).slice(0, nivel).map((p) => p.tipo));

  const publico = (l) => {
    const p = l.pessoa;
    const lugar = { id: l.id, tipo: l.tipo };
    if (l.tipo === 'onze') lugar.pos = p.pos;
    if (l.tipo === 'suplente') lugar.minuto = p.minuto;
    const d = r.descobertas[l.id];
    if (d || acabou) {
      lugar.nome = p.nome;
      lugar.curto = curto(p);
      if (p.numero != null) lugar.numero = p.numero;
      if (p.pais) lugar.pais = p.pais;
      // Os golos só se mostram depois de descoberto (seriam uma pista grátis).
      if (p.golos?.length) lugar.golos = p.golos.map((g) => ({ ...g }));
      if (d) {
        lugar.por = d.por;
        lugar.pontos = d.pontos + (d.bonus ?? 0);
      } else lugar.revelado = true;
      return lugar;
    }
    if (l.tipo === 'onze') {
      if (reveladas.has('numero')) lugar.numero = p.numero;
      if (reveladas.has('pais')) lugar.pais = p.pais;
      if (reveladas.has('inicial')) lugar.inicial = inicial(p);
    }
    return lugar;
  };

  return {
    jogo: {
      id: jogo.id,
      competicao: jogo.competicao,
      fase: jogo.fase ?? null,
      titulo: jogo.titulo ?? null,
      data: jogo.data,
      estadio: jogo.estadio,
      resultado: jogo.resultado,
    },
    equipaMitica: r.equipa,
    equipas: prep.incluidas.map((i) => {
      const e = jogo.equipas[i];
      const meus = prep.lugares.filter((l) => l.equipa === i);
      return {
        indice: i,
        nome: e.nome,
        formacao: e.formacao,
        cor: e.cor ?? null,
        onze: meus.filter((l) => l.tipo === 'onze').map(publico),
        suplentes: meus.filter((l) => l.tipo === 'suplente').map(publico),
        treinador: publico(meus.find((l) => l.tipo === 'treinador')),
      };
    }),
    etapa: r.etapa,
    fichaAte: r.fichaAte,
    inicio: r.inicio,
    fim: r.fim,
    duracaoBase: r.duracaoBase,
    // Metas das pistas: fração do tempo inicial já consumida (o relógio desce até duracaoBase × (1 − fracao)).
    pistas: pistasDe(r).map((p) => ({ tipo: p.tipo, fracao: p.fracao })),
    nivelPista: nivel,
    total: prep.lugares.length,
    descobertos: Object.keys(r.descobertas).length,
    onzeCompleto: onzeCompleto(r, prep),
    votosTerminar: r.votosTerminar ?? [],
    lados: r.lados ?? null,
    vencedor: r.vencedor ?? null,
    onzePorEquipa: onzeDescobertosPorEquipa(r, prep),
    stats: r.stats ?? {},
  };
}
