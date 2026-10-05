import { describe, it, expect } from 'vitest';
import { validarTudo, validarJogo, carregarEquipas } from '../scripts/validar-dados.mjs';

describe('dados dos jogos', () => {
  const { jogos, erros } = validarTudo();

  it('há jogos', () => {
    expect(jogos.length).toBeGreaterThan(0);
  });

  it('todos os ficheiros passam no validador', () => {
    expect(erros).toEqual([]);
  });

  it('o validador apanha erros comuns', () => {
    const equipas = carregarEquipas();
    const base = structuredClone(jogos[0].jogo);
    base.equipas[0].onze[1].pos = 'XX';
    base.equipas[0].onze[2].pais = 'ZZ';
    base.equipas[1].suplentes.push({ nome: base.equipas[0].onze[3].nome, minuto: 70, pais: 'PT' });
    const e = validarJogo(base, { equipas });
    expect(e.join('\n')).toMatch(/posição "XX" inválida/);
    expect(e.join('\n')).toMatch(/país "ZZ" sem bandeira/);
    expect(e.join('\n')).toMatch(/aparece duas vezes/);
  });
});
