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
  it('começa com 7 s de ficha e dura 3:00 (multi) ou 5:00 (solo)', () => {
    const { r } = rondaNova();
    expect(r.etapa).toBe('ficha');
    expect(r.fichaAte).toBe(INICIO);
    expect(r.fim - r.inicio).toBe(180_000);
    expect(rondaNova({ tipo: 'solo' }).r.fim - INICIO).toBe(300_000);
  });

  it('pistas aos 20 %, 35 % e 50 % da duração base', () => {
    const { r } = rondaNova();
    expect(motor.momentosPistas(r)).toEqual([INICIO + 36_000, INICIO + 63_000, INICIO + 90_000]);
    const solo = rondaNova({ tipo: 'solo' }).r;
    expect(motor.momentosPistas(solo)).toEqual([INICIO + 60_000, INICIO + 105_000, INICIO + 150_000]);
  });

  it('avancar emite início, as 3 pistas e o fim, uma vez cada', () => {
    const { r } = rondaNova();
    expect(motor.avancar(r, INICIO - 1)).toEqual([]);
    expect(motor.avancar(r, INICIO)).toEqual([{ tipo: 'inicio' }]);
    expect(motor.proximoPrazo(r)).toBe(INICIO + 36_000);
    expect(motor.avancar(r, INICIO + 36_000)).toEqual([{ tipo: 'pista', nivel: 1 }]);
    expect(motor.avancar(r, INICIO + 36_500)).toEqual([]);
    expect(motor.avancar(r, INICIO + 95_000)).toEqual([{ tipo: 'pista', nivel: 2 }, { tipo: 'pista', nivel: 3 }]);
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

  it('acerto sem pistas vale 5 e acrescenta 5 s', () => {
    const fimAntes = r.fim;
    const res = motor.palpite(r, prep, 'rui', 'Deco', INICIO + 1000);
    expect(res).toMatchObject({ r: 'certo', pontos: 5, bonus: 0, terminou: false, nome: 'Deco' });
    expect(r.fim).toBe(fimAntes + 5_000);
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
    expect(motor.palpite(r, prep, 'a', 'Vítor Baía', INICIO + 35_999).pontos).toBe(5);
    expect(motor.palpite(r, prep, 'a', 'Costinha', INICIO + 36_000).pontos).toBe(4);
    expect(motor.palpite(r, prep, 'a', 'Maniche', INICIO + 63_000).pontos).toBe(3);
    expect(motor.palpite(r, prep, 'a', 'Derlei', INICIO + 90_000).pontos).toBe(2);
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
    motor.avancar(r, INICIO + 95_000); // as 3 pistas
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

  it('mostra as pistas reveladas só no onze escondido', () => {
    const { prep, r } = rondaNova();
    motor.avancar(r, INICIO);
    const antes = motor.estadoPublico(r, prep);
    expect(antes.equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR' });
    motor.avancar(r, INICIO + 36_000);
    expect(motor.estadoPublico(r, prep).equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR', numero: 99 });
    motor.avancar(r, INICIO + 90_000);
    const depois = motor.estadoPublico(r, prep);
    expect(depois.equipas[1].onze[0]).toEqual({ id: '1o0', tipo: 'onze', pos: 'GR', numero: 99, pais: 'PT', inicial: 'B' });
    expect(depois.equipas[1].suplentes[0]).toEqual({ id: '1s0', tipo: 'suplente', minuto: 85 });
    expect(depois.equipas[1].treinador).toEqual({ id: '1t', tipo: 'treinador' });
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
