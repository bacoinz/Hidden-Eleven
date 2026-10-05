// Lógica de uma sala (jogadores, anfitrião, configuração, rondas, palpites, feed).
// Pura: o Durable Object (sala.js) só trata de sockets, persistência e alarmes.
import { REGRAS, PALETA, CONTEUDOS } from './regras.js';
import { JOGOS, NOMES_CONHECIDOS, sortear, disponiveis, equipasMiticas } from './catalogo.js';
import * as motor from './motor.js';

const cache = new Map();
/** Jogo preparado (lugares + índice de nomes) da ronda, em cache por jogo/equipa. */
export function preparado(ronda) {
  const chave = `${ronda.jogoId}|${ronda.equipa ?? ''}`;
  if (!cache.has(chave)) {
    const jogo = JOGOS.get(ronda.jogoId);
    if (!jogo) throw new Error(`Jogo desconhecido: ${ronda.jogoId}`);
    cache.set(chave, motor.prepararJogo(jogo, { equipa: ronda.equipa, conhecidos: NOMES_CONHECIDOS }));
  }
  return cache.get(chave);
}

export function novaSala({ codigo, solo = false, anfitriaoToken = null, agora }) {
  return {
    codigo,
    solo,
    criadaEm: agora,
    fase: 'lobby', // lobby | jogo | final
    anfitriao: null,
    anfitriaoToken,
    config: { conteudo: 'finais', equipa: null, rondas: REGRAS.rondasPorOmissao },
    jogadores: [],
    usados: [],
    partida: null, // { numero, total, ronda, historico: [{ jogoId, resultado, pontos }] }
    feed: [],
    seq: 0,
    proximoId: 1,
    vaziaDesde: agora,
  };
}

const jogador = (sala, id) => sala.jogadores.find((j) => j.id === id);
const erro = (msg) => ({ erro: msg });

function noFeed(sala, evento) {
  sala.seq += 1;
  sala.feed.push({ seq: sala.seq, ...evento });
  if (sala.feed.length > REGRAS.feedMax) sala.feed.splice(0, sala.feed.length - REGRAS.feedMax);
}

export function limparNome(nome) {
  return String(nome ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, REGRAS.nomeMax)
    .trim();
}

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------

/** Entrada ou reconexão (mesmo token → mesmo jogador, com os mesmos pontos). */
export function entrar(sala, { token, nome }, agora) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 64) return erro('Identificação inválida.');
  const existente = sala.jogadores.find((j) => j.token === token);
  if (existente) {
    existente.ligado = true;
    existente.desligadoEm = null;
    sala.vaziaDesde = null;
    if (token === sala.anfitriaoToken) sala.anfitriao = existente.id;
    return { jogador: existente, novo: false };
  }
  const limpo = limparNome(nome);
  if (!limpo) return erro('Escolhe um nome.');
  if (sala.solo && sala.jogadores.length >= 1) return erro('Esta sala é para jogar sozinho.');
  if (sala.jogadores.length >= REGRAS.maxJogadores) return erro('A sala está cheia (máximo 10 jogadores).');

  const usados = new Set(sala.jogadores.map((j) => j.nome.toLowerCase()));
  let final = limpo;
  for (let n = 2; usados.has(final.toLowerCase()); n++) final = `${limpo.slice(0, REGRAS.nomeMax - 4)} (${n})`;
  const cores = new Set(sala.jogadores.map((j) => j.cor));
  const novo = {
    id: `j${sala.proximoId++}`,
    token,
    nome: final,
    cor: PALETA.find((c) => !cores.has(c)) ?? PALETA[0],
    total: 0,
    ligado: true,
    desligadoEm: null,
    bloqueadoAte: 0,
    ultimoPalpite: 0,
  };
  sala.jogadores.push(novo);
  sala.vaziaDesde = null;
  if (!sala.anfitriao || token === sala.anfitriaoToken) sala.anfitriao = novo.id;
  noFeed(sala, { tipo: 'entrou', jogador: novo.id });
  return { jogador: novo, novo: true };
}

export function desligar(sala, jogadorId, agora) {
  const j = jogador(sala, jogadorId);
  if (!j || !j.ligado) return false;
  j.ligado = false;
  j.desligadoEm = agora;
  if (!sala.jogadores.some((x) => x.ligado)) sala.vaziaDesde = agora;
  return true;
}

/** Se o anfitrião está fora há mais de 20 s, passa o papel ao jogador ligado mais antigo. */
function verificarAnfitriao(sala, agora) {
  const atual = jogador(sala, sala.anfitriao);
  if (atual?.ligado) return false;
  if (atual && agora - (atual.desligadoEm ?? 0) < REGRAS.anfitriaoAusenteMs) return false;
  const novo = sala.jogadores.find((j) => j.ligado);
  if (!novo || novo.id === sala.anfitriao) return false;
  sala.anfitriao = novo.id;
  noFeed(sala, { tipo: 'anfitriao', jogador: novo.id });
  return true;
}

// ---------------------------------------------------------------------------
// Configuração e rondas
// ---------------------------------------------------------------------------

const soAnfitriao = (sala, id) => (id === sala.anfitriao ? null : erro('Só o anfitrião pode fazer isso.'));

export function configurar(sala, jogadorId, config) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('O jogo já começou.');
  const conteudo = CONTEUDOS.includes(config?.conteudo) ? config.conteudo : sala.config.conteudo;
  let equipa = null;
  if (conteudo === 'equipa') {
    const slugs = equipasMiticas().map((e) => e.slug);
    equipa = slugs.includes(config?.equipa) ? config.equipa : slugs.includes(sala.config.equipa) ? sala.config.equipa : slugs[0] ?? null;
  }
  const rondas = Number.isInteger(config?.rondas) && config.rondas >= 1 && config.rondas <= 20 ? config.rondas : sala.config.rondas;
  sala.config = { conteudo, equipa, rondas };
  return { ok: true };
}

function iniciarRonda(sala, agora, aleatorio) {
  const jogo = sortear(sala.config, sala.usados, aleatorio);
  if (!jogo) {
    sala.fase = 'final';
    return;
  }
  sala.usados.push(jogo.id);
  sala.partida.numero += 1;
  sala.partida.ronda = motor.criarRonda({
    jogo,
    equipa: sala.config.conteudo === 'equipa' ? sala.config.equipa : null,
    tipo: sala.solo ? 'solo' : 'multi',
    agora,
  });
  for (const j of sala.jogadores) j.bloqueadoAte = 0;
  noFeed(sala, { tipo: 'ronda', numero: sala.partida.numero });
}

export function comecar(sala, jogadorId, agora, aleatorio = Math.random) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('O jogo já começou.');
  if (sala.config.conteudo === 'equipa' && !sala.config.equipa) return erro('Escolhe uma equipa.');
  const n = disponiveis(sala.config, sala.usados).length;
  if (!n) return erro('Já jogaram todos os jogos deste conteúdo nesta sala.');
  for (const j of sala.jogadores) j.total = 0;
  sala.partida = { numero: 0, total: Math.min(sala.config.rondas, n), ronda: null, historico: [] };
  sala.fase = 'jogo';
  iniciarRonda(sala, agora, aleatorio);
  return { ok: true };
}

/** Regista a ronda no histórico quando termina (uma só vez). */
function fecharRonda(sala) {
  const p = sala.partida;
  const r = p?.ronda;
  if (!r || r.etapa !== 'terminada' || p.historico.length >= p.numero) return;
  p.historico.push({ jogoId: r.jogoId, resultado: JOGOS.get(r.jogoId)?.resultado ?? '', pontos: motor.pontosDaRonda(r) });
}

export function proxima(sala, jogadorId, agora, aleatorio = Math.random) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'jogo' || sala.partida?.ronda?.etapa !== 'terminada') return erro('A ronda ainda não acabou.');
  if (sala.partida.numero >= sala.partida.total) {
    sala.fase = 'final';
    noFeed(sala, { tipo: 'final' });
    return { ok: true };
  }
  iniciarRonda(sala, agora, aleatorio);
  return { ok: true };
}

export function novoJogo(sala, jogadorId) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'final') return erro('O jogo ainda não acabou.');
  sala.fase = 'lobby';
  sala.partida = null;
  return { ok: true };
}

/** Volta a permitir os jogos já usados nesta sala (quando o conteúdo se esgota). */
export function reporJogos(sala, jogadorId) {
  const recusa = soAnfitriao(sala, jogadorId);
  if (recusa) return recusa;
  if (sala.fase !== 'lobby') return erro('Só no lobby.');
  sala.usados = [];
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tempo e palpites
// ---------------------------------------------------------------------------

/** Avança a sala até `agora` (ficha → corrida, pistas, fim, anfitrião). Devolve true se algo mudou. */
export function avancar(sala, agora) {
  let mudou = verificarAnfitriao(sala, agora);
  const r = sala.fase === 'jogo' ? sala.partida?.ronda : null;
  if (r) {
    for (const ev of motor.avancar(r, agora)) {
      mudou = true;
      if (ev.tipo === 'pista') noFeed(sala, { tipo: 'pista', nivel: ev.nivel });
      if (ev.tipo === 'fim') noFeed(sala, { tipo: 'fim', motivo: ev.motivo });
    }
    fecharRonda(sala);
  }
  return mudou;
}

/** Próximo instante em que a sala precisa de acordar (ronda, troca de anfitrião, limpeza). */
export function proximoPrazo(sala) {
  const prazos = [];
  const r = sala.fase === 'jogo' ? sala.partida?.ronda : null;
  if (r) prazos.push(motor.proximoPrazo(r));
  const anf = jogador(sala, sala.anfitriao);
  if (anf && !anf.ligado && sala.jogadores.some((j) => j.ligado)) prazos.push((anf.desligadoEm ?? 0) + REGRAS.anfitriaoAusenteMs);
  if (sala.vaziaDesde != null) prazos.push(sala.vaziaDesde + REGRAS.limpezaSalaVaziaMs);
  const validos = prazos.filter((t) => typeof t === 'number');
  return validos.length ? Math.min(...validos) : null;
}

export const deveLimpar = (sala, agora) => sala.vaziaDesde != null && agora >= sala.vaziaDesde + REGRAS.limpezaSalaVaziaMs;

/**
 * Palpite de um jogador. Devolve { resposta, mudou }: `resposta` vai só para quem escreveu
 * (null = ignorado em silêncio); `mudou` diz se o estado público mudou.
 */
export function palpite(sala, jogadorId, texto, agora) {
  const j = jogador(sala, jogadorId);
  if (!j || sala.fase !== 'jogo') return { resposta: { r: 'fora' }, mudou: false };
  let mudou = avancar(sala, agora);
  const r = sala.partida.ronda;
  if (r.etapa !== 'corrida') return { resposta: { r: 'fora' }, mudou };
  if (agora < j.bloqueadoAte) return { resposta: { r: 'bloqueado', ate: j.bloqueadoAte }, mudou };
  if (agora - j.ultimoPalpite < REGRAS.intervaloMinimoMs) return { resposta: null, mudou };
  j.ultimoPalpite = agora;

  const res = motor.palpite(r, preparado(r), jogadorId, texto, agora);
  if (res.r === 'errado') {
    j.bloqueadoAte = agora + REGRAS.bloqueioMs;
    res.ate = j.bloqueadoAte;
  }
  if (res.r === 'ja') res.porNome = res.por === jogadorId ? null : jogador(sala, res.por)?.nome ?? '?';
  if (res.r === 'certo') {
    j.total += res.pontos + res.bonus;
    noFeed(sala, { tipo: 'descoberta', jogador: j.id, lugar: res.lugar, nome: res.nome, pontos: res.pontos, bonus: res.bonus });
    if (res.terminou) {
      noFeed(sala, { tipo: 'fim', motivo: 'completo' });
      fecharRonda(sala);
    }
    mudou = true;
  }
  return { resposta: res, mudou };
}

// ---------------------------------------------------------------------------
// Estado público (sem tokens nem nomes escondidos)
// ---------------------------------------------------------------------------

export function faseVisivel(sala) {
  if (sala.fase !== 'jogo') return sala.fase;
  const etapa = sala.partida?.ronda?.etapa;
  return etapa === 'ficha' ? 'ficha' : etapa === 'corrida' ? 'ronda' : 'fim';
}

export function estadoPublico(sala, agora) {
  const r = sala.fase === 'jogo' || sala.fase === 'final' ? sala.partida?.ronda : null;
  const pontosRonda = r ? motor.pontosDaRonda(r) : {};
  return {
    codigo: sala.codigo,
    solo: sala.solo,
    fase: faseVisivel(sala),
    anfitriao: sala.anfitriao,
    config: sala.config,
    jogadores: sala.jogadores.map((j) => ({
      id: j.id,
      nome: j.nome,
      cor: j.cor,
      total: j.total,
      ronda: pontosRonda[j.id] ?? 0,
      ligado: j.ligado,
    })),
    partida: sala.partida
      ? { numero: sala.partida.numero, total: sala.partida.total, historico: sala.partida.historico }
      : null,
    ronda: r && sala.fase === 'jogo' ? motor.estadoPublico(r, preparado(r)) : null,
    disponiveis: disponiveis(sala.config, sala.usados).length,
    feed: sala.feed,
    agora,
  };
}
