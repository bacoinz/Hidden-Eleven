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

  it('máximo de 10 jogadores; sala solo só aceita um', () => {
    const cheia = salaCom(10);
    expect(S.entrar(cheia, { token: tk(11), nome: 'X' }, T0).erro).toMatch(/cheia/);
    const solo = salaCom(1, { solo: true });
    expect(S.entrar(solo, { token: tk(2), nome: 'X' }, T0).erro).toMatch(/sozinho/);
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
    expect(sala.config).toEqual({ conteudo: 'equipa', equipa: 'porto', rondas: 3 });
    S.comecar(sala, anf, T0, primeiro);
    expect(sala.partida.total).toBe(1);
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
