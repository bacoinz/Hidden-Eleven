// Lógica de uma sala (jogadores, anfitrião, configuração, rondas, palpites, feed).
// Pura: o Durable Object (sala.js) só trata de sockets, persistência e alarmes.
import { REGRAS, PALETA, CONTEUDOS, MODOS } from './regras.js';
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
    config: { conteudo: 'finais', equipa: null, rondas: REGRAS.rondasPorOmissao, modo: 'normal' },
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
/** Quem joga (os espectadores só veem). */
const aJogar = (sala) => sala.jogadores.filter((j) => !j.espectador);
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
  if (sala.jogadores.length >= REGRAS.maxJogadores + REGRAS.maxEspectadores) return erro('A sala está cheia.');
  // Fica a ver quem entra numa sala solo, com a sala cheia ou com uma partida a decorrer (joga a partir da ronda seguinte).
  const espectador =
    (sala.solo && sala.jogadores.length >= 1) || aJogar(sala).length >= REGRAS.maxJogadores || sala.fase === 'jogo';

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
    espectador,
    stats: { certos: 0, errados: 0 },
  };
  sala.jogadores.push(novo);
  sala.vaziaDesde = null;
  if (!sala.anfitriao || token === sala.anfitriaoToken) sala.anfitriao = novo.id;
  noFeed(sala, { tipo: 'entrou', jogador: novo.id, espectador });
  return { jogador: novo, novo: true };
}

export function desligar(sala, jogadorId, agora) {
  const j = jogador(sala, jogadorId);
  if (!j || !j.ligado) return false;
  j.ligado = false;
  j.desligadoEm = agora;
  if (!sala.jogadores.some((x) => x.ligado)) sala.vaziaDesde = agora;
  // Quem sai deixa de contar para a votação de terminar a ronda.
  verificarVotos(sala, agora);
  return true;
}

/** Se o anfitrião está fora há mais de 20 s, passa o papel ao jogador ligado mais antigo. */
function verificarAnfitriao(sala, agora) {
  const atual = jogador(sala, sala.anfitriao);
  if (atual?.ligado) return false;
  if (atual && agora - (atual.desligadoEm ?? 0) < REGRAS.anfitriaoAusenteMs) return false;
  const novo = sala.jogadores.find((j) => j.ligado && !j.espectador) ?? sala.jogadores.find((j) => j.ligado);
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
  // O duelo precisa das duas equipas em campo: não há duelo na Equipa Mítica nem a solo.
  let modo = MODOS.includes(config?.modo) ? config.modo : sala.config.modo ?? 'normal';
  if (sala.solo) modo = 'normal';
  if (modo === 'duelo' && conteudo === 'equipa') {
    if (config?.modo === 'duelo') return erro('O duelo não dá com a Equipa Mítica: escolhe outro conteúdo.');
    modo = 'normal';
  }
  sala.config = { conteudo, equipa, rondas, modo };
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
  // Quem estava a ver passa a jogar (exceto a solo ou com a sala cheia).
  for (const j of sala.jogadores) {
    if (!j.espectador || sala.solo || aJogar(sala).length >= REGRAS.maxJogadores) continue;
    j.espectador = false;
    noFeed(sala, { tipo: 'promovido', jogador: j.id });
  }
  // Duelo: os jogadores dividem-se pelas duas equipas e trocam de lado em cada ronda.
  let lados = null;
  if (sala.config.modo === 'duelo') {
    lados = {};
    aJogar(sala).forEach((j, i) => (lados[j.id] = (i + sala.partida.numero) % 2));
  }
  sala.partida.ronda = motor.criarRonda({
    jogo,
    equipa: sala.config.conteudo === 'equipa' ? sala.config.equipa : null,
    tipo: sala.solo ? 'solo' : 'multi',
    lados,
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
  if (sala.config.modo === 'duelo' && aJogar(sala).filter((j) => j.ligado).length < 2) return erro('O duelo precisa de pelo menos 2 jogadores.');
  for (const j of sala.jogadores) {
    j.total = 0;
    j.stats = { certos: 0, errados: 0 };
  }
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
  const bonus = motor.resolverDuelo(r, preparado(r));
  // Ao passar a ronda não há vencedor do duelo (nem linha no feed).
  if (bonus && !r.passada) {
    for (const [id, b] of Object.entries(bonus)) {
      const j = jogador(sala, id);
      if (j) j.total += b;
    }
    const nomeVencedor = r.vencedor == null ? null : preparado(r).jogo.equipas[r.vencedor].nome;
    noFeed(sala, { tipo: 'duelo', equipa: nomeVencedor, vencedores: Object.keys(bonus), bonus: REGRAS.bonusDuelo });
  }
  for (const [id, st] of Object.entries(r.stats ?? {})) {
    const j = jogador(sala, id);
    if (!j) continue;
    j.stats ??= { certos: 0, errados: 0 };
    j.stats.certos += st.certos;
    j.stats.errados += st.errados;
  }
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
// Terminar a ronda com o onze completo
// ---------------------------------------------------------------------------

const rondaACorrer = (sala) => {
  const r = sala.fase === 'jogo' ? sala.partida?.ronda : null;
  return r?.etapa === 'corrida' ? r : null;
};

/**
 * Com o onze todo descoberto, cada jogador pode pedir para terminar a ronda (voltar a carregar cancela).
 * Termina quando todos os jogadores ligados confirmarem (a solo, logo à primeira).
 */
export function votarTerminar(sala, jogadorId, agora) {
  const r = rondaACorrer(sala);
  if (!r || !jogador(sala, jogadorId)) return erro('A ronda não está a decorrer.');
  if (jogador(sala, jogadorId).espectador) return erro('Estás a ver esta ronda.');
  if (!motor.onzeCompleto(r, preparado(r))) return erro('Só se pode terminar a ronda com o onze todo descoberto.');
  const votos = new Set(r.votosTerminar ?? []);
  if (votos.has(jogadorId)) votos.delete(jogadorId);
  else votos.add(jogadorId);
  r.votosTerminar = [...votos];
  verificarVotos(sala, agora);
  return { ok: true };
}

/**
 * Passar a ronda (ninguém sabe mais): todos os jogadores ligados têm de confirmar (a solo, logo à primeira).
 * Ao passar, cada um fica só com metade dos pontos que fez nesta ronda.
 */
export function votarPassar(sala, jogadorId, agora) {
  const r = rondaACorrer(sala);
  if (!r || !jogador(sala, jogadorId)) return erro('A ronda não está a decorrer.');
  if (jogador(sala, jogadorId).espectador) return erro('Estás a ver esta ronda.');
  const votos = new Set(r.votosPassar ?? []);
  if (votos.has(jogadorId)) votos.delete(jogadorId);
  else votos.add(jogadorId);
  r.votosPassar = [...votos];
  verificarVotos(sala, agora);
  return { ok: true };
}

const todosVotaram = (sala, votos) => {
  if (!votos?.length) return false;
  const ligados = aJogar(sala).filter((j) => j.ligado).map((j) => j.id);
  return ligados.length > 0 && ligados.every((id) => votos.includes(id));
};

function verificarVotos(sala, agora) {
  const r = rondaACorrer(sala);
  if (!r) return false;
  if (todosVotaram(sala, r.votosTerminar)) {
    motor.terminar(r, agora);
    noFeed(sala, { tipo: 'fim', motivo: 'votacao' });
  } else if (todosVotaram(sala, r.votosPassar)) {
    const cortes = motor.passar(r, agora);
    noFeed(sala, { tipo: 'fim', motivo: 'passou' });
    for (const [id, corte] of Object.entries(cortes)) {
      const j = jogador(sala, id);
      if (j) j.total += corte;
      noFeed(sala, { tipo: 'corte', jogador: id, pontos: corte });
    }
  } else return false;
  fecharRonda(sala);
  return true;
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
      if (ev.tipo === 'pista') noFeed(sala, { tipo: 'pista', nivel: ev.nivel, pista: ev.pista });
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
 * ('devagar' se chegar antes do intervalo mínimo); `mudou` diz se o estado público mudou.
 */
export function palpite(sala, jogadorId, texto, agora) {
  const j = jogador(sala, jogadorId);
  if (!j || sala.fase !== 'jogo') return { resposta: { r: 'fora' }, mudou: false };
  if (j.espectador) return { resposta: { r: 'espectador' }, mudou: false };
  let mudou = avancar(sala, agora);
  const r = sala.partida.ronda;
  if (r.etapa !== 'corrida') return { resposta: { r: 'fora' }, mudou };
  if (agora < j.bloqueadoAte) return { resposta: { r: 'bloqueado', ate: j.bloqueadoAte }, mudou };
  if (agora - j.ultimoPalpite < REGRAS.intervaloMinimoMs) return { resposta: { r: 'devagar' }, mudou };
  j.ultimoPalpite = agora;

  const res = motor.palpite(r, preparado(r), jogadorId, texto, agora);
  motor.registarEstatistica(r, jogadorId, res.r, agora);
  if (res.r === 'errado') {
    j.bloqueadoAte = agora + REGRAS.bloqueioMs;
    res.ate = j.bloqueadoAte;
  }
  if (res.r === 'ja') res.porNome = res.por === jogadorId ? null : jogador(sala, res.por)?.nome ?? '?';
  if (res.r === 'certo') {
    j.total += res.pontos + res.bonus;
    noFeed(sala, { tipo: 'descoberta', jogador: j.id, lugar: res.lugar, nome: res.nome, pontos: res.pontos, bonus: res.bonus });
    if (res.terminou) {
      noFeed(sala, { tipo: 'fim', motivo: res.duelo !== undefined ? 'duelo' : 'completo' });
      fecharRonda(sala);
    }
    mudou = true;
  }
  // As estatísticas da ronda também mudam com os erros.
  if (res.r === 'errado') mudou = true;
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
      espectador: Boolean(j.espectador),
      stats: j.stats ?? { certos: 0, errados: 0 },
    })),
    partida: sala.partida
      ? { numero: sala.partida.numero, total: sala.partida.total, historico: sala.partida.historico }
      : null,
    // No pódio final mantém-se o último onze (já todo revelado) para quem o quiser rever.
    ronda: r ? motor.estadoPublico(r, preparado(r)) : null,
    disponiveis: disponiveis(sala.config, sala.usados).length,
    feed: sala.feed,
    agora,
  };
}
