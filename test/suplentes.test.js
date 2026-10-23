import { describe, it, expect } from 'vitest';
import { siglasDosSuplentes, minutoNumerico } from '../scripts/suplentes.mjs';

const titular = (nome, pos, saiu) => ({ nome, pos, _saiu: saiu });
const suplente = (nome, entrou, extra = {}) => ({ nome, minuto: entrou, _entrou: String(entrou), ...extra });

describe('posições dos suplentes', () => {
  it('lê minutos com descontos', () => {
    expect(minutoNumerico('90+2')).toBeCloseTo(90.02);
    expect(minutoNumerico(46)).toBe(46);
    expect(minutoNumerico(undefined)).toBeNull();
  });

  it('herda a posição de quem saiu no mesmo minuto', async () => {
    const onze = [titular('Carvajal', 'DD', '52'), titular('Kroos', 'MC', '72'), titular('Benzema', 'PL', '77')];
    const subs = [suplente('Danilo', 52), suplente('Lucas Vázquez', 77), suplente('Isco', 72)];
    expect((await siglasDosSuplentes(onze, subs)).siglas).toEqual(['DD', 'PL', 'MC']);
  });

  it('com várias trocas no mesmo minuto, junta pela linha da dica', async () => {
    const onze = [titular('A', 'PL', '68'), titular('B', 'MC', '68')];
    const subs = [suplente('Médio', 68, { _dica: 'M' }), suplente('Ponta', 68, { _dica: 'PL' })];
    expect((await siglasDosSuplentes(onze, subs)).siglas).toEqual(['MC', 'PL']);
  });

  it('um médio no lugar de um central fica médio; um lateral no lugar de um ala fica ala', async () => {
    const onze = [titular('Piqué', 'DC', '33'), titular('Lázaro', 'MD', '45+1')];
    const subs = [suplente('Gavi', 33, { _dica: 'MC' }), suplente('Gilberto', '45+1', { _dica: 'DD' })];
    expect((await siglasDosSuplentes(onze, subs)).siglas).toEqual(['MC', 'MD']);
  });

  it('um suplente que sai deixa a posição a quem entra depois', async () => {
    const onze = [titular('A', 'EE', '60')];
    const subs = [suplente('B', 60, { _saiu: '85' }), suplente('C', 85)];
    expect((await siglasDosSuplentes(onze, subs)).siglas).toEqual(['EE', 'EE']);
  });

  it('sem saída correspondente usa a dica e avisa', async () => {
    const r = await siglasDosSuplentes([], [suplente('X', 70, { _dica: 'D' })]);
    expect(r.siglas).toEqual(['DC']);
    expect(r.avisos).toHaveLength(1);
  });
});
