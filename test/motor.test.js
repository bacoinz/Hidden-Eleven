import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as motor from '../src/motor.js';
import { REGRAS } from '../src/regras.js';
import { chavesDe } from '../src/nomes.js';

const carregar = (id) => JSON.parse(readFileSync(new URL(`../data/jogos/${id}.json`, import.meta.url), 'utf8'));
const porto2004 = carregar('ucl-2004-final');

const T0 = 1_000_000;
const INICIO = T0 + REGRAS.fichaMs;

function rondaNova(opcoes = {}) {
  const prep = motor.prepararJogo(porto2004, { equipa: opcoes.equipa ?? null });
  const r = motor.criarRonda({ jogo: porto2004, equipa: opcoes.equipa ?? null, tipo: opcoes.tipo ?? 'multi', agora: T0 });
  return { prep, r };
}

describe('prepararJogo', () => {
  it('cria um lugar por jogador do onze, suplente utilizado e treinador', () => {
    const prep = motor.prepararJogo(porto2004);
    expect(prep.lugares).toHaveLength(2 * (11 + 3 + 1));
    expect(prep.bancoIds.size).toBe(8);
  });

  it('na Equipa Mítica só entra a equipa escolhida', () => {
    const prep = motor.prepararJogo(porto2004, { equipa: 'porto' });
    expect(prep.lugares).toHaveLength(15);
    expect(prep.incluidas).toEqual([1]);
  });
});

describe('tempo da ronda', () => {
  it('começa com 7 s de ficha e dura 4:00 (multi) ou 6:00 (solo)', () => {
    const { r } = rondaNova();
    expect(r.etapa).toBe('ficha');
    expect(r.fichaAte).toBe(INICIO);
    expect(r.fim - r.inicio).toBe(240_000);
    expect(rondaNova({ tipo: 'solo' }).r.fim - INICIO).toBe(360_000);
  });

  it('pistas quando o relógio desce a 80 %, 65 % e 50 % do tempo inicial', () => {
    const { r } = rondaNova();
    expect(motor.limiaresPistas(r)).toEqual([192_000, 156_000, 120_000]); // 3:12, 2:36, 2:00
    const solo = rondaNova({ tipo: 'solo' }).r;
    expect(motor.limiaresPistas(solo)).toEqual([288_000, 234_000, 180_000]); // 4:48, 3:54, 3:00
  });

  it('cada acerto atrasa as pistas (o relógio sobe 1 s)', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    motor.palpite(r, prep, 'a', 'Deco', INICIO + 1000);
    motor.palpite(r, prep, 'a', 'Maniche', INICIO + 2000);
    expect(motor.proximoPrazo(r)).toBe(INICIO + 48_000 + 2_000);
    expect(motor.avancar(r, INICIO + 49_000)).toEqual([]);
    expect(motor.avancar(r, INICIO + 50_000)).toEqual([{ tipo: 'pista', nivel: 1, pista: 'numero' }]);
  });

  it('uma pista revelada não volta a esconder-se quando o relógio sobe', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO + 48_000);
    expect(r.nivelPista).toBe(1);
    motor.palpite(r, prep, 'a', 'Deco', INICIO + 48_500);
    expect(motor.nivelPistaEm(r, INICIO + 48_600)).toBe(1);
    expect(motor.estadoPublico(r, prep).equipas[1].onze[0].numero).toBe(99);
  });

  it('avancar emite início, as 3 pistas e o fim, uma vez cada', () => {
    const { r } = rondaNova();
    expect(motor.avancar(r, INICIO - 1)).toEqual([]);
    expect(motor.avancar(r, INICIO)).toEqual([{ tipo: 'inicio' }]);
    expect(motor.proximoPrazo(r)).toBe(INICIO + 48_000);
    expect(motor.avancar(r, INICIO + 48_000)).toEqual([{ tipo: 'pista', nivel: 1, pista: 'numero' }]);
    expect(motor.avancar(r, INICIO + 48_500)).toEqual([]);
    expect(motor.avancar(r, INICIO + 125_000)).toEqual([
      { tipo: 'pista', nivel: 2, pista: 'pais' },
      { tipo: 'pista', nivel: 3, pista: 'inicial' },
    ]);
    expect(motor.proximoPrazo(r)).toBe(r.fim);
    expect(motor.avancar(r, r.fim)).toEqual([{ tipo: 'fim', motivo: 'tempo' }]);
    expect(r.etapa).toBe('terminada');
    expect(motor.proximoPrazo(r)).toBeNull();
  });
});

describe('palpites', () => {
  let prep, r;
  beforeEach(() => {
    ({ prep, r } = rondaNova());
    motor.avancar(r, INICIO);
  });

  it('não aceita palpites durante a ficha', () => {
    const outra = rondaNova();
    expect(motor.palpite(outra.r, outra.prep, 'a', 'Deco', T0 + 1000)).toEqual({ r: 'fora' });
  });

  it('acerto sem pistas vale 5 e acrescenta 1 s', () => {
    const fimAntes = r.fim;
    const res = motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    expect(res).toMatchObject({ r: 'certo', pontos: 5, bonus: 0, terminou: false, nome: 'Deco' });
    expect(r.fim).toBe(fimAntes + 1_000);
  });

  it('"Já é de…" quando alguém já descobriu, sem mexer no tempo', () => {
    motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    const fim = r.fim;
    expect(motor.palpite(r, prep, 'ana', 'deco', INICIO + 2000)).toMatchObject({ r: 'ja', por: 'rui' });
    expect(r.fim).toBe(fim);
  });

  it('suplente não utilizado, nome errado e apelido ambíguo', () => {
    expect(motor.palpite(r, prep, 'ana', 'Nuno', INICIO + 1000)).toEqual({ r: 'banco' });
    expect(motor.palpite(r, prep, 'ana', 'Figo', INICIO + 1000)).toEqual({ r: 'errado' });
    expect(motor.palpite(r, prep, 'ana', 'Costa', INICIO + 1000)).toEqual({ r: 'ambiguo' });
    expect(motor.palpite(r, prep, 'ana', 'x', INICIO + 1000)).toEqual({ r: 'invalido' });
  });

  it('pontos do onze descem com as pistas: 5, 4, 3, 2', () => {
    // r.fim é lido em cada chamada porque cada acerto o empurra 5 s.
    const [l1, l2, l3] = motor.limiaresPistas(r);
    expect(motor.palpite(r, prep, 'a', 'Vítor Baía', r.fim - l1 - 1).pontos).toBe(5);
    expect(motor.palpite(r, prep, 'a', 'Costinha', r.fim - l1).pontos).toBe(4);
    expect(motor.palpite(r, prep, 'a', 'Maniche', r.fim - l2).pontos).toBe(3);
    expect(motor.palpite(r, prep, 'a', 'Derlei', r.fim - l3).pontos).toBe(2);
  });

  it('jogos entre seleções saltam a pista da bandeira (5, 4, 2)', () => {
    const euro = carregar('euro-2016-final');
    expect(euro.selecoes).toBe(true);
    const p = motor.prepararJogo(euro);
    const ronda = motor.criarRonda({ jogo: euro, agora: T0 });
    expect(ronda.pistas.map((x) => x.tipo)).toEqual(['numero', 'inicial']);
    expect(motor.limiaresPistas(ronda)).toEqual([192_000, 120_000]);
    motor.avancar(ronda, INICIO);
    expect(motor.avancar(ronda, INICIO + 63_000)).toEqual([{ tipo: 'pista', nivel: 1, pista: 'numero' }]);
    const [, l2] = motor.limiaresPistas(ronda);
    expect(motor.palpite(ronda, p, 'a', 'Pepe', ronda.fim - l2 - 1).pontos).toBe(4);
    motor.avancar(ronda, ronda.fim - l2);
    expect(motor.palpite(ronda, p, 'a', 'Nani', ronda.fim - l2).pontos).toBe(2);
    const gr = motor.estadoPublico(ronda, p).equipas[0].onze[0];
    expect(gr).toEqual({ id: '0o0', tipo: 'onze', pos: 'GR', numero: 1, inicial: 'P' });
  });

  it('suplentes e treinadores valem 3, mesmo sem pistas', () => {
    expect(motor.palpite(r, prep, 'a', 'Alenichev', INICIO + 1000).pontos).toBe(3);
    expect(motor.palpite(r, prep, 'a', 'Mourinho', INICIO + 1000).pontos).toBe(3);
  });

  it('quem fecha a última posição ganha +2 e a ronda termina', () => {
    const lugares = prep.lugares;
    lugares.slice(0, -1).forEach((l, i) => {
      expect(motor.palpite(r, prep, 'rui', l.pessoa.nome, INICIO + 1000 + i).r).toBe('certo');
    });
    const ultimo = lugares[lugares.length - 1];
    const res = motor.palpite(r, prep, 'ana', ultimo.pessoa.nome, INICIO + 5000);
    expect(res).toMatchObject({ r: 'certo', bonus: 2, terminou: true });
    expect(r.etapa).toBe('terminada');
    expect(motor.pontosDaRonda(r).ana).toBe(res.pontos + 2);
  });
});

describe('estado público', () => {
  const escondidos = (prep, r) => prep.lugares.filter((l) => !r.descobertas[l.id]).map((l) => l.pessoa);

  it('nunca inclui nomes nem alcunhas de quem está escondido', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    motor.avancar(r, INICIO + 125_000); // as 3 pistas
    const json = JSON.stringify(motor.estadoPublico(r, prep));
    expect(json).toContain('Deco');
    for (const p of escondidos(prep, r)) {
      expect(json).not.toContain(p.nome);
      for (const { chave } of chavesDe(p)) {
        if (chave.length >= 5) expect(json.toLowerCase(), `${p.nome} → ${chave}`).not.toContain(`"${chave}"`);
      }
    }
    // Os não utilizados nunca aparecem.
    expect(json).not.toContain('Jankauskas');
  });

  it('mostra as pistas reveladas no onze e nos suplentes escondidos; ao treinador só a inicial', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    const antes = motor.estadoPublico(r, prep);
    expect(antes.equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR' });
    motor.avancar(r, INICIO + 48_000);
    expect(motor.estadoPublico(r, prep).equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR', numero: 99 });
    motor.avancar(r, INICIO + 120_000);
    const depois = motor.estadoPublico(r, prep);
    expect(depois.equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR', numero: 99, pais: 'PT', inicial: 'B' });
    expect(antes.equipas[1].suplentes[0]).toEqual({ id: '1s0', tipo: 'suplente', pos: 'DC', minuto: 85 });
    expect(antes.equipas[1].treinador).toEqual({ id: '1t', tipo: 'treinador' });
    expect(depois.equipas[1].suplentes[0]).toEqual({ id: '1s0', tipo: 'suplente', pos: 'DC', minuto: 85, numero: 3, pais: 'PT', inicial: 'E' });
    expect(depois.equipas[1].treinador).toEqual({ id: '1t', tipo: 'treinador', inicial: 'M' });
  });

  it('os golos só aparecem depois de a posição ser descoberta', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    const deco = () => motor.estadoPublico(r, prep).equipas[1].onze.find((l) => l.pos === 'MO');
    expect(deco().golos).toBeUndefined();
    motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    expect(deco().golos).toEqual([{ minuto: 71 }]);
  });

  it('no fim revela tudo e marca o que ficou por descobrir', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    motor.avancar(r, r.fim);
    const e = motor.estadoPublico(r, prep);
    const deco = e.equipas[1].onze.find((l) => l.nome === 'Deco');
    expect(deco).toMatchObject({ por: 'rui', pontos: 5, curto: 'Deco', numero: 10, pais: 'PT' });
    expect(e.equipas[1].treinador).toMatchObject({ nome: 'José Mourinho', revelado: true });
  });
});

describe('rótulos', () => {
  it('nome curto', () => {
    expect(motor.curto({ nome: 'Cristiano Ronaldo' })).toBe('C. Ronaldo');
    expect(motor.curto({ nome: 'Ricardo Carvalho' })).toBe('R. Carvalho');
    expect(motor.curto({ nome: 'Edwin van der Sar' })).toBe('E. van der Sar');
    expect(motor.curto({ nome: 'Giovanni van Bronckhorst' })).toBe('van Bronckhorst');
    expect(motor.curto({ nome: 'Xabi Alonso' })).toBe('Xabi Alonso');
    expect(motor.curto({ nome: 'Jakub Błaszczykowski', curto: 'Kuba' })).toBe('Kuba');
  });

  it('inicial do apelido', () => {
    expect(motor.inicial({ nome: 'Edwin van der Sar' })).toBe('V');
    expect(motor.inicial({ nome: 'Deco' })).toBe('D');
    expect(motor.inicial({ nome: "N'Golo Kanté" })).toBe('K');
    expect(motor.inicial({ nome: 'Mesut Özil' })).toBe('Ö');
    expect(motor.inicial({ nome: 'Lee Kang-in', inicial: 'L' })).toBe('L');
  });
});
