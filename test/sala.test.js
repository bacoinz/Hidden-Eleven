import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as S from '../src/sala-logica.js';
import { REGRAS } from '../src/regras.js';
import { JOGOS } from '../src/catalogo.js';

const T0 = 5_000_000;
const tk = (n) => `token-jogador-${n}`;
const primeiro = () => 0; // aleatório determinístico: escolhe sempre o primeiro disponível

function salaCom(n, { solo = false } = {}) {
  const sala = S.novaSala({ codigo: 'ABCD', solo, anfitriaoToken: tk(1), agora: T0 });
  for (let i = 1; i <= n; i++) S.entrar(sala, { token: tk(i), nome: `Jogador${i}` }, T0);
  return sala;
}

describe('entrada de jogadores', () => {
  it('o criador é o anfitrião e cada jogador tem uma cor diferente', () => {
    const sala = salaCom(3);
    expect(sala.anfitriao).toBe(sala.jogadores[0].id);
    expect(new Set(sala.jogadores.map((j) => j.cor)).size).toBe(3);
  });

  it('nomes repetidos ganham sufixo e nomes vazios são recusados', () => {
    const sala = salaCom(0);
    S.entrar(sala, { token: tk(1), nome: 'Rui' }, T0);
    expect(S.entrar(sala, { token: tk(2), nome: 'rui' }, T0).jogador.nome).toBe('rui (2)');
    expect(S.entrar(sala, { token: tk(3), nome: '   ' }, T0).erro).toBeTruthy();
    expect(S.entrar(sala, { token: tk(4), nome: '<b>Ana</b>' }, T0).jogador.nome).toBe('bAna/b');
  });

  it('reconexão com o mesmo token mantém pontos e cor', () => {
    const sala = salaCom(2);
    const j = sala.jogadores[1];
    j.total = 42;
    S.desligar(sala, j.id, T0 + 10);
    const { jogador, novo } = S.entrar(sala, { token: tk(2), nome: 'outro nome' }, T0 + 20);
    expect(novo).toBe(false);
    expect(jogador).toMatchObject({ id: j.id, total: 42, cor: j.cor, nome: 'Jogador2', ligado: true });
  });

  it('com 10 jogadores ou numa sala solo, quem entra fica a ver', () => {
    const cheia = salaCom(10);
    expect(S.entrar(cheia, { token: tk(11), nome: 'X' }, T0).jogador.espectador).toBe(true);
    for (let i = 12; i <= 20; i++) S.entrar(cheia, { token: tk(i), nome: `X${i}` }, T0);
    expect(S.entrar(cheia, { token: tk(21), nome: 'Y' }, T0).erro).toMatch(/cheia/);
    const solo = salaCom(1, { solo: true });
    expect(S.entrar(solo, { token: tk(2), nome: 'X' }, T0).jogador.espectador).toBe(true);
  });
});

describe('anfitrião', () => {
  it('passa ao jogador seguinte se o anfitrião sair por mais de 20 s', () => {
    const sala = salaCom(3);
    const [a, b] = sala.jogadores;
    S.desligar(sala, a.id, T0 + 1000);
    expect(S.proximoPrazo(sala)).toBe(T0 + 1000 + REGRAS.anfitriaoAusenteMs);
    S.avancar(sala, T0 + 1000 + 19_000);
    expect(sala.anfitriao).toBe(a.id);
    S.avancar(sala, T0 + 1000 + 20_000);
    expect(sala.anfitriao).toBe(b.id);
    // Se o criador voltar, recupera o papel.
    S.entrar(sala, { token: tk(1), nome: 'x' }, T0 + 60_000);
    expect(sala.anfitriao).toBe(a.id);
  });

  it('só o anfitrião configura e começa', () => {
    const sala = salaCom(2);
    const convidado = sala.jogadores[1].id;
    expect(S.configurar(sala, convidado, { rondas: 3 }).erro).toBeTruthy();
    expect(S.comecar(sala, convidado, T0).erro).toBeTruthy();
  });
});

describe('partida', () => {
  let sala, anf, outro;
  beforeEach(() => {
    sala = salaCom(2);
    [anf, outro] = sala.jogadores.map((j) => j.id);
  });

  it('começa com a ficha e não repete jogos entre rondas', () => {
    S.configurar(sala, anf, { conteudo: 'finais', rondas: 3 });
    expect(S.comecar(sala, anf, T0, primeiro)).toEqual({ ok: true });
    expect(S.faseVisivel(sala)).toBe('ficha');
    const primeiroJogo = sala.partida.ronda.jogoId;
    S.avancar(sala, sala.partida.ronda.inicio + 10_000);
    expect(S.faseVisivel(sala)).toBe('ronda');
    S.avancar(sala, sala.partida.ronda.fim);
    expect(S.faseVisivel(sala)).toBe('fim');
    expect(sala.partida.historico).toHaveLength(1);
    S.proxima(sala, anf, sala.partida.ronda.fim + 1, primeiro);
    expect(sala.partida.ronda.jogoId).not.toBe(primeiroJogo);
    expect(sala.usados).toHaveLength(2);
  });

  it('solo usa rondas de 5 minutos', () => {
    const solo = salaCom(1, { solo: true });
    S.comecar(solo, solo.jogadores[0].id, T0, primeiro);
    const r = solo.partida.ronda;
    expect(r.fim - r.inicio).toBe(300_000);
  });

  it('palpites: errado bloqueia 1 s, "já é de", pontos e feed', () => {
    S.comecar(sala, anf, T0, primeiro);
    const r = sala.partida.ronda;
    const jogo = JOGOS.get(r.jogoId);
    const nome = jogo.equipas[0].onze[3].nome;
    const t = r.inicio + 1000;

    expect(S.palpite(sala, outro, 'Ninguém Conhecido', t).resposta).toMatchObject({ r: 'errado', ate: t + 1000 });
    expect(S.palpite(sala, outro, nome, t + 500).resposta).toMatchObject({ r: 'bloqueado' });
    const certo = S.palpite(sala, outro, nome, t + 1000);
    expect(certo.resposta).toMatchObject({ r: 'certo', pontos: 5 });
    expect(certo.mudou).toBe(true);
    expect(sala.jogadores[1].total).toBe(5);
    expect(sala.feed.at(-1)).toMatchObject({ tipo: 'descoberta', jogador: outro, pontos: 5 });

    expect(S.palpite(sala, anf, nome, t + 2000).resposta).toMatchObject({ r: 'ja', porNome: 'Jogador2' });
    expect(S.palpite(sala, outro, nome, t + 3000).resposta).toMatchObject({ r: 'ja', porNome: null });
    // Demasiado rápido: pede para repetir.
    expect(S.palpite(sala, outro, nome, t + 3050).resposta).toEqual({ r: 'devagar' });
  });

  it('acaba a partida e volta ao lobby sem perder os jogos usados', () => {
    S.configurar(sala, anf, { rondas: 1 });
    S.comecar(sala, anf, T0, primeiro);
    S.avancar(sala, sala.partida.ronda.fim + 60_000);
    S.avancar(sala, sala.partida.ronda.fim);
    expect(S.proxima(sala, anf, T0 + 999_999, primeiro)).toEqual({ ok: true });
    expect(S.faseVisivel(sala)).toBe('final');
    expect(S.novoJogo(sala, anf)).toEqual({ ok: true });
    expect(S.faseVisivel(sala)).toBe('lobby');
    expect(sala.usados).toHaveLength(1);
    S.comecar(sala, anf, T0 + 2_000_000, primeiro);
    expect(sala.partida.ronda.jogoId).not.toBe(sala.usados[0]);
  });

  it('o número de rondas fica limitado aos jogos disponíveis', () => {
    S.configurar(sala, anf, { conteudo: 'finais', rondas: 10 });
    S.comecar(sala, anf, T0, primeiro);
    expect(sala.partida.total).toBe(Math.min(10, [...JOGOS.values()].filter((j) => j.modos.includes('final')).length));
  });
});

describe('terminar a ronda com o onze completo', () => {
  function descobrirOnze(sala, jogadorId) {
    const r = sala.partida.ronda;
    const jogo = JOGOS.get(r.jogoId);
    let t = r.inicio + 1000;
    for (const e of jogo.equipas) {
      for (const p of e.onze) {
        expect(S.palpite(sala, jogadorId, p.nome, t).resposta.r).toBe('certo');
        t += 200;
      }
    }
    return t;
  }

  it('só se pode pedir depois de o onze estar todo descoberto', () => {
    const sala = salaCom(2);
    const anf = sala.jogadores[0].id;
    S.comecar(sala, anf, T0, primeiro);
    S.avancar(sala, sala.partida.ronda.inicio);
    expect(S.votarTerminar(sala, anf, sala.partida.ronda.inicio + 500).erro).toMatch(/onze/);
  });

  it('a solo termina logo, sem bónus de fecho', () => {
    const sala = salaCom(1, { solo: true });
    const eu = sala.jogadores[0].id;
    S.comecar(sala, eu, T0, primeiro);
    S.avancar(sala, sala.partida.ronda.inicio);
    const t = descobrirOnze(sala, eu);
    expect(S.estadoPublico(sala, t).ronda.onzeCompleto).toBe(true);
    expect(S.votarTerminar(sala, eu, t)).toEqual({ ok: true });
    expect(S.faseVisivel(sala)).toBe('fim');
    expect(sala.feed.at(-1)).toMatchObject({ tipo: 'fim', motivo: 'votacao' });
    expect(Object.values(sala.partida.ronda.descobertas).some((d) => d.bonus)).toBe(false);
  });

  it('em multijogador todos os ligados têm de confirmar; quem sai deixa de contar', () => {
    const sala = salaCom(3);
    const [a, b, c] = sala.jogadores.map((j) => j.id);
    S.comecar(sala, a, T0, primeiro);
    S.avancar(sala, sala.partida.ronda.inicio);
    const t = descobrirOnze(sala, a);
    S.votarTerminar(sala, a, t);
    S.votarTerminar(sala, b, t);
    expect(S.faseVisivel(sala)).toBe('ronda');
    expect(S.estadoPublico(sala, t).ronda.votosTerminar).toEqual([a, b]);
    // Carregar outra vez cancela.
    S.votarTerminar(sala, b, t);
    expect(S.estadoPublico(sala, t).ronda.votosTerminar).toEqual([a]);
    S.votarTerminar(sala, b, t);
    // O terceiro sai: já não é preciso o voto dele.
    S.desligar(sala, c, t + 100);
    expect(S.faseVisivel(sala)).toBe('fim');
  });
});

describe('espectadores', () => {
  it('quem entra a meio fica a ver e joga a partir da ronda seguinte', () => {
    const sala = salaCom(2);
    const anf = sala.jogadores[0].id;
    S.configurar(sala, anf, { conteudo: 'finais', rondas: 3 });
    S.comecar(sala, anf, T0, primeiro);
    const { jogador: ana } = S.entrar(sala, { token: tk(9), nome: 'Ana' }, T0 + 100);
    expect(ana.espectador).toBe(true);
    const r = sala.partida.ronda;
    S.avancar(sala, r.inicio);
    const nome = JOGOS.get(r.jogoId).equipas[0].onze[0].nome;
    expect(S.palpite(sala, ana.id, nome, r.inicio + 500).resposta).toEqual({ r: 'espectador' });
    expect(S.estadoPublico(sala, r.inicio).jogadores.find((j) => j.id === ana.id).espectador).toBe(true);
    S.avancar(sala, r.fim);
    S.proxima(sala, anf, r.fim + 1, primeiro);
    expect(ana.espectador).toBe(false);
    expect(sala.feed.some((ev) => ev.tipo === 'promovido' && ev.jogador === ana.id)).toBe(true);
  });

  it('os espectadores não contam para terminar a ronda', () => {
    const sala = salaCom(1);
    const anf = sala.jogadores[0].id;
    S.comecar(sala, anf, T0, primeiro);
    S.entrar(sala, { token: tk(9), nome: 'Ana' }, T0 + 100);
    const r = sala.partida.ronda;
    S.avancar(sala, r.inicio);
    let t = r.inicio + 1000;
    for (const e of JOGOS.get(r.jogoId).equipas) for (const p of e.onze) {
      S.palpite(sala, anf, p.nome, t);
      t += 200;
    }
    S.votarTerminar(sala, anf, t);
    expect(S.faseVisivel(sala)).toBe('fim');
  });
});

describe('duelo', () => {
  function duelo() {
    const sala = salaCom(2);
    const [a, b] = sala.jogadores.map((j) => j.id);
    S.configurar(sala, a, { conteudo: 'finais', rondas: 3, modo: 'duelo' });
    S.comecar(sala, a, T0, primeiro);
    const r = sala.partida.ronda;
    S.avancar(sala, r.inicio);
    return { sala, a, b, r, jogo: JOGOS.get(r.jogoId) };
  }

  it('cada jogador fica com uma equipa e nomes da outra não contam', () => {
    const { sala, a, b, r, jogo } = duelo();
    expect(new Set([r.lados[a], r.lados[b]])).toEqual(new Set([0, 1]));
    const daOutra = jogo.equipas[1 - r.lados[a]].onze[0].nome;
    expect(S.palpite(sala, a, daOutra, r.inicio + 500).resposta).toEqual({ r: 'outra' });
    const daMinha = jogo.equipas[r.lados[a]].onze[0].nome;
    expect(S.palpite(sala, a, daMinha, r.inicio + 800).resposta.r).toBe('certo');
  });

  it('quem fecha primeiro o onze ganha a ronda e o bónus', () => {
    const { sala, a, b, r, jogo } = duelo();
    let t = r.inicio + 1000;
    for (const p of jogo.equipas[r.lados[b]].onze) {
      S.palpite(sala, b, p.nome, t);
      t += 200;
    }
    expect(S.faseVisivel(sala)).toBe('fim');
    expect(r.vencedor).toBe(r.lados[b]);
    const pb = sala.jogadores.find((j) => j.id === b);
    expect(pb.total).toBe(11 * 5 + REGRAS.bonusDuelo);
    expect(sala.feed.at(-1)).toMatchObject({ tipo: 'duelo', vencedores: [b] });
    // E o lado troca na ronda seguinte.
    const ladoAntes = r.lados[a];
    S.proxima(sala, a, t + 1, primeiro);
    expect(sala.partida.ronda.lados[a]).toBe(1 - ladoAntes);
  });

  it('se o tempo acabar ganha quem descobriu mais do seu onze', () => {
    const { sala, a, r, jogo } = duelo();
    S.palpite(sala, a, jogo.equipas[r.lados[a]].onze[0].nome, r.inicio + 500);
    S.avancar(sala, r.fim + 10_000);
    expect(r.vencedor).toBe(r.lados[a]);
    expect(sala.jogadores.find((j) => j.id === a).total).toBe(5 + REGRAS.bonusDuelo);
  });

  it('não há duelo na Equipa Mítica nem com um só jogador', () => {
    const sala = salaCom(1);
    const a = sala.jogadores[0].id;
    expect(S.configurar(sala, a, { conteudo: 'equipa', modo: 'duelo' }).erro).toMatch(/Equipa Mítica/);
    S.configurar(sala, a, { conteudo: 'finais', modo: 'duelo' });
    expect(S.comecar(sala, a, T0, primeiro).erro).toMatch(/2 jogadores/);
  });
});

describe('estatísticas', () => {
  it('conta acertos, erros e o tempo até ao primeiro acerto, por ronda e no total', () => {
    const sala = salaCom(2);
    const [a] = sala.jogadores.map((j) => j.id);
    S.comecar(sala, a, T0, primeiro);
    const r = sala.partida.ronda;
    S.avancar(sala, r.inicio);
    const nome = JOGOS.get(r.jogoId).equipas[0].onze[0].nome;
    S.palpite(sala, a, 'Ninguém Conhecido', r.inicio + 1000);
    S.palpite(sala, a, nome, r.inicio + 3000);
    expect(r.stats[a]).toEqual({ certos: 1, errados: 1, outros: 0, primeiroMs: 3000 });
    S.avancar(sala, r.fim + 60_000);
    expect(sala.jogadores[0].stats).toEqual({ certos: 1, errados: 1 });
    expect(S.estadoPublico(sala, r.fim).ronda.stats[a].certos).toBe(1);
  });
});

describe('Equipa Mítica', () => {
  const original = REGRAS.minimoJogosEquipa;
  beforeEach(() => {
    REGRAS.minimoJogosEquipa = 1;
  });
  afterEach(() => {
    REGRAS.minimoJogosEquipa = original;
  });

  it('só a equipa escolhida entra em jogo', () => {
    const sala = salaCom(1);
    const anf = sala.jogadores[0].id;
    S.configurar(sala, anf, { conteudo: 'equipa', equipa: 'porto', rondas: 3 });
    expect(sala.config).toEqual({ conteudo: 'equipa', equipa: 'porto', rondas: 3, modo: 'normal' });
    S.comecar(sala, anf, T0, primeiro);
    const jogosPorto = [...JOGOS.values()].filter((j) => j.modos.includes('equipa:porto')).length;
    expect(sala.partida.total).toBe(Math.min(3, jogosPorto));
    const e = S.estadoPublico(sala, T0);
    expect(e.ronda.equipas).toHaveLength(1);
    expect(e.ronda.equipas[0].nome).toBe('FC Porto');
  });
});

describe('estado público e limpeza', () => {
  it('não expõe tokens', () => {
    const sala = salaCom(2);
    const json = JSON.stringify(S.estadoPublico(sala, T0));
    expect(json).not.toContain('token-jogador');
  });

  it('sala vazia há 2 horas é para limpar', () => {
    const sala = salaCom(1);
    S.desligar(sala, sala.jogadores[0].id, T0);
    expect(S.deveLimpar(sala, T0 + REGRAS.limpezaSalaVaziaMs - 1)).toBe(false);
    expect(S.deveLimpar(sala, T0 + REGRAS.limpezaSalaVaziaMs)).toBe(true);
  });
});
