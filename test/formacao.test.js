import { describe, it, expect } from 'vitest';
import { linhasDaFormacao, disporOnze, problemasDaFormacao } from '../public/js/formacao.js';

const onze = (...siglas) => siglas.map((pos, i) => ({ nome: `J${i}`, pos }));

const FORMACOES = {
  '4-4-2': onze('GR', 'DD', 'DC', 'DC', 'DE', 'MD', 'MC', 'MC', 'ME', 'PL', 'PL'),
  '4-4-2 losango': onze('GR', 'DD', 'DC', 'DC', 'DE', 'MDC', 'MC', 'MC', 'MO', 'PL', 'PL'),
  '4-3-3': onze('GR', 'DD', 'DC', 'DC', 'DE', 'MDC', 'MC', 'MC', 'ED', 'PL', 'EE'),
  '4-2-3-1': onze('GR', 'DD', 'DC', 'DC', 'DE', 'MDC', 'MDC', 'ED', 'MO', 'EE', 'PL'),
  '3-5-2': onze('GR', 'DC', 'DC', 'DC', 'MD', 'MC', 'MDC', 'MC', 'ME', 'PL', 'PL'),
  '3-4-3': onze('GR', 'DC', 'DC', 'DC', 'MD', 'MC', 'MC', 'ME', 'ED', 'PL', 'EE'),
  '5-3-2': onze('GR', 'DD', 'DC', 'DC', 'DC', 'DE', 'MC', 'MC', 'MC', 'PL', 'PL'),
  '3-4-3 losango': onze('GR', 'DC', 'DC', 'DC', 'MDC', 'MD', 'ME', 'MO', 'ED', 'PL', 'EE'),
};

describe('linhasDaFormacao', () => {
  it('lê os números e trata o losango', () => {
    expect(linhasDaFormacao('4-2-3-1')).toEqual([4, 2, 3, 1]);
    expect(linhasDaFormacao('4-4-2 losango')).toEqual([4, 1, 2, 1, 2]);
    expect(linhasDaFormacao('3-4-3 losango')).toEqual([3, 1, 2, 1, 3]);
    expect(linhasDaFormacao('3-5-2')).toEqual([3, 5, 2]);
  });
});

describe('disporOnze', () => {
  for (const [formacao, jogadores] of Object.entries(FORMACOES)) {
    it(`${formacao}: linhas certas, coordenadas válidas e sem sobreposições`, () => {
      const pos = disporOnze(jogadores, formacao);
      expect(pos).toHaveLength(11);
      const linhas = linhasDaFormacao(formacao);
      // Quantos jogadores ficam em cada linha.
      const porLinha = linhas.map((_, li) => pos.filter((p) => p.linha === li + 1).length);
      expect(porLinha).toEqual(linhas);
      for (const p of pos) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
      // Distância mínima em metros numa metade de campo (52,5 m × 68 m).
      for (let a = 0; a < pos.length; a++) {
        for (let b = a + 1; b < pos.length; b++) {
          const d = Math.hypot((pos[a].x - pos[b].x) * 68, (pos[a].y - pos[b].y) * 52.5);
          expect(d, `${jogadores[a].pos} e ${jogadores[b].pos}`).toBeGreaterThan(6.5);
        }
      }
    });
  }

  it('lateral direito à direita, lateral esquerdo à esquerda, guarda-redes atrás', () => {
    const pos = disporOnze(FORMACOES['4-4-2'], '4-4-2');
    const [gr, dd, dc1, dc2, de] = pos;
    expect(dd.x).toBeLessThan(dc1.x);
    expect(dc1.x).toBeLessThan(dc2.x);
    expect(dc2.x).toBeLessThan(de.x);
    expect(gr.y).toBeLessThan(dd.y);
    expect(gr.x).toBe(0.5);
  });

  it('no 4-3-3 o trinco fica ao meio e mais recuado que os médios', () => {
    const pos = disporOnze(FORMACOES['4-3-3'], '4-3-3');
    const [mdc, mc1, mc2] = [pos[5], pos[6], pos[7]];
    expect(mdc.x).toBeCloseTo(0.5);
    expect(mc1.x).toBeLessThan(0.5);
    expect(mc2.x).toBeGreaterThan(0.5);
    expect(mdc.y).toBeLessThan(mc1.y);
  });

  it('no losango o 10 fica à frente do trinco e atrás dos avançados', () => {
    const pos = disporOnze(FORMACOES['4-4-2 losango'], '4-4-2 losango');
    const mdc = pos[5];
    const mo = pos[8];
    const pl = pos[9];
    expect(mdc.y).toBeLessThan(mo.y);
    expect(mo.y).toBeLessThan(pl.y);
    expect(mo.x).toBeCloseTo(0.5);
  });

  it('formação que não bate certo agrupa pelas siglas', () => {
    const pos = disporOnze(FORMACOES['4-4-2'], '4-3-3');
    expect(pos.filter((p) => p.linha === 1)).toHaveLength(4);
  });
});

describe('problemasDaFormacao', () => {
  it('aceita as formações coerentes', () => {
    for (const [formacao, jogadores] of Object.entries(FORMACOES)) {
      expect(problemasDaFormacao(jogadores, formacao), formacao).toEqual([]);
    }
  });

  it('deteta formações incoerentes', () => {
    expect(problemasDaFormacao(FORMACOES['4-4-2'], '3-5-2')).toContain('formação pede 3 defesas mas há 4');
    expect(problemasDaFormacao(FORMACOES['4-4-2'], '4-4-3')[0]).toMatch(/soma 11/);
    expect(problemasDaFormacao(onze('DC', ...FORMACOES['4-4-2'].slice(1).map((p) => p.pos)), '4-4-2')[0]).toMatch(/0 guarda-redes/);
  });

  it('deteta extremos partidos entre linhas (losango com ED/EE em vez de médios)', () => {
    const errado = onze('GR', 'DD', 'DC', 'DC', 'DE', 'MDC', 'ED', 'MO', 'EE', 'PL', 'PL');
    expect(problemasDaFormacao(errado, '4-4-2 losango').join()).toMatch(/linhas diferentes/);
  });
});
