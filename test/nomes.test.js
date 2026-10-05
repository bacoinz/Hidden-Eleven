import { describe, it, expect } from 'vitest';
import { normalizar, distancia, tolerancia, chavesDe, criarIndice, procurar } from '../src/nomes.js';

// Pessoas reais (subconjuntos dos jogos) usadas nos testes.
const p = (id, nome, aceites = []) => ({ id, nome, aceites });

describe('normalizar', () => {
  it('tira acentos, maiúsculas e simplifica espaços', () => {
    expect(normalizar('  Vítor   Baía ')).toBe('vitor baia');
    expect(normalizar('Luka Modrić')).toBe('luka modric');
    expect(normalizar('İlkay Gündoğan')).toBe('ilkay gundogan');
    expect(normalizar('Hakan Çalhanoğlu')).toBe('hakan calhanoglu');
  });

  it('converte letras que o NFD não decompõe', () => {
    expect(normalizar('Jakub Błaszczykowski')).toBe('jakub blaszczykowski');
    expect(normalizar('Martin Ødegaard')).toBe('martin odegaard');
    expect(normalizar('Christian Nørgaard')).toBe('christian norgaard');
    expect(normalizar('Weiß')).toBe('weiss');
  });

  it('junta apóstrofos e separa hífenes e pontuação', () => {
    expect(normalizar("N'Golo Kanté")).toBe('ngolo kante');
    expect(normalizar('Pierre-Emerick Aubameyang')).toBe('pierre emerick aubameyang');
    expect(normalizar('C. Ronaldo!')).toBe('c ronaldo');
    expect(normalizar('CR7')).toBe('cr7');
  });
});

describe('distancia (Damerau-Levenshtein restrita)', () => {
  it('conta substituições, inserções e remoções', () => {
    expect(distancia('casilas', 'casillas')).toBe(1);
    expect(distancia('iniessta', 'iniesta')).toBe(1);
    expect(distancia('rivaldo', 'ronaldo')).toBe(2);
  });

  it('conta uma troca de letras vizinhas como 1', () => {
    expect(distancia('drogab', 'drogba')).toBe(1);
  });

  it('para cedo quando passa o máximo', () => {
    expect(distancia('messi', 'casillas', 2)).toBeGreaterThan(2);
  });
});

describe('tolerancia', () => {
  it('1 gralha até 6 letras, 2 para nomes maiores (sem contar espaços)', () => {
    expect(tolerancia('deco')).toBe(1);
    expect(tolerancia('drogba')).toBe(1);
    expect(tolerancia('ronaldo')).toBe(2);
    expect(tolerancia('xabi alonso')).toBe(2);
  });
});

describe('chavesDe', () => {
  it('gera nome completo, aceites e apelido automático com prioridades', () => {
    const chaves = chavesDe(p('x', 'Cristiano Ronaldo', ['cristiano', 'CR7']));
    expect(chaves).toEqual(expect.arrayContaining([
      { chave: 'cristiano ronaldo', prioridade: 3 },
      { chave: 'cristiano', prioridade: 2 },
      { chave: 'cr7', prioridade: 2 },
      { chave: 'ronaldo', prioridade: 1 },
    ]));
  });

  it('trata partículas no apelido', () => {
    const chaves = chavesDe(p('x', 'Edwin van der Sar')).map((c) => c.chave);
    expect(chaves).toEqual(expect.arrayContaining(['edwin van der sar', 'van der sar', 'sar']));
    const db = chavesDe(p('y', 'Kevin De Bruyne')).map((c) => c.chave);
    expect(db).toEqual(expect.arrayContaining(['de bruyne', 'bruyne']));
  });

  it('um só nome não gera apelido extra', () => {
    expect(chavesDe(p('x', 'Deco'))).toEqual([{ chave: 'deco', prioridade: 3 }]);
  });

  it('ignora apelidos automáticos com menos de 3 letras', () => {
    const chaves = chavesDe(p('x', 'Lee Kang-in', ['lee'])).map((c) => c.chave);
    expect(chaves).not.toContain('in');
  });
});

describe('procurar — casos reais', () => {
  // Final da LC 2004 (FC Porto).
  const porto2004 = criarIndice([
    p('baia', 'Vítor Baía', ['baia', 'vitor baia']),
    p('deco', 'Deco'),
    p('carvalho', 'Ricardo Carvalho'),
    p('costa', 'Jorge Costa'),
    p('rcosta', 'Ricardo Costa'),
    p('mourinho', 'José Mourinho', ['mourinho']),
    p('nuno', 'Nuno Espírito Santo', ['nuno']),
  ]);

  it('aceita nome completo, apelido e variantes com acentos', () => {
    expect(procurar(porto2004, 'Vitor Baia')).toMatchObject({ tipo: 'unico', id: 'baia' });
    expect(procurar(porto2004, 'baía')).toMatchObject({ tipo: 'unico', id: 'baia' });
    expect(procurar(porto2004, 'DECO')).toMatchObject({ tipo: 'unico', id: 'deco' });
    expect(procurar(porto2004, 'mourinho')).toMatchObject({ tipo: 'unico', id: 'mourinho' });
  });

  it('apelido partilhado (Jorge Costa / Ricardo Costa) exige nome completo', () => {
    expect(procurar(porto2004, 'costa')).toMatchObject({ tipo: 'ambiguo' });
    expect(procurar(porto2004, 'Jorge Costa')).toMatchObject({ tipo: 'unico', id: 'costa' });
    expect(procurar(porto2004, 'ricardo costa')).toMatchObject({ tipo: 'unico', id: 'rcosta' });
  });

  it('nome que não está no jogo devolve nenhum', () => {
    expect(procurar(porto2004, 'Figo')).toEqual({ tipo: 'nenhum' });
    expect(procurar(porto2004, '')).toEqual({ tipo: 'nenhum' });
  });

  // Final da LC 2008: os dois Cole.
  const ucl2008 = criarIndice([
    p('acole', 'Ashley Cole'),
    p('jcole', 'Joe Cole'),
    p('ronaldo', 'Cristiano Ronaldo', ['cristiano', 'cr7']),
    p('vds', 'Edwin van der Sar'),
    p('drogba', 'Didier Drogba'),
    p('lampard', 'Frank Lampard'),
  ]);

  it('os Cole: "cole" é ambíguo, nomes completos funcionam, mesmo com gralha', () => {
    expect(procurar(ucl2008, 'Cole')).toMatchObject({ tipo: 'ambiguo' });
    expect(procurar(ucl2008, 'colle')).toMatchObject({ tipo: 'ambiguo' });
    expect(procurar(ucl2008, 'ashley cole')).toMatchObject({ tipo: 'unico', id: 'acole' });
    expect(procurar(ucl2008, 'joe colle')).toMatchObject({ tipo: 'unico', id: 'jcole' });
  });

  it('alcunhas e apelidos com partículas', () => {
    expect(procurar(ucl2008, 'CR7')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });
    expect(procurar(ucl2008, 'ronaldo')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });
    expect(procurar(ucl2008, 'C. Ronaldo')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });
    expect(procurar(ucl2008, 'van der sar')).toMatchObject({ tipo: 'unico', id: 'vds' });
    expect(procurar(ucl2008, 'vandersar')).toMatchObject({ tipo: 'unico', id: 'vds' });
  });

  it('tolera gralhas, incluindo letras trocadas', () => {
    expect(procurar(ucl2008, 'drogab')).toMatchObject({ tipo: 'unico', id: 'drogba' });
    expect(procurar(ucl2008, 'lamprad')).toMatchObject({ tipo: 'unico', id: 'lampard' });
    expect(procurar(ucl2008, 'lampardd')).toMatchObject({ tipo: 'unico', id: 'lampard' });
  });

  it('não aceita gralhas acima da tolerância', () => {
    // "drgoab" está a 2 de "drogba" (6 letras → só 1 permitido).
    expect(procurar(ucl2008, 'drgoab')).toEqual({ tipo: 'nenhum' });
  });

  // Final da LC 2021: Thiago Silva e Bernardo Silva.
  const ucl2021 = criarIndice([
    p('tsilva', 'Thiago Silva', ['thiago']),
    p('bsilva', 'Bernardo Silva', ['bernardo']),
    p('kante', "N'Golo Kanté", ['kante']),
    p('debruyne', 'Kevin De Bruyne'),
  ]);

  it('os Silva: apelido sozinho não conta', () => {
    expect(procurar(ucl2021, 'silva')).toMatchObject({ tipo: 'ambiguo' });
    expect(procurar(ucl2021, 'Thiago Silva')).toMatchObject({ tipo: 'unico', id: 'tsilva' });
    expect(procurar(ucl2021, 'bernardo')).toMatchObject({ tipo: 'unico', id: 'bsilva' });
  });

  it('apóstrofos e partículas', () => {
    expect(procurar(ucl2021, 'ngolo kante')).toMatchObject({ tipo: 'unico', id: 'kante' });
    expect(procurar(ucl2021, "n'golo kanté")).toMatchObject({ tipo: 'unico', id: 'kante' });
    expect(procurar(ucl2021, 'kante')).toMatchObject({ tipo: 'unico', id: 'kante' });
    expect(procurar(ucl2021, 'de bruyne')).toMatchObject({ tipo: 'unico', id: 'debruyne' });
    expect(procurar(ucl2021, 'debruyne')).toMatchObject({ tipo: 'unico', id: 'debruyne' });
  });

  // Final do Mundial 2010: Xavi e Xabi Alonso.
  const wc2010 = criarIndice([
    p('xavi', 'Xavi'),
    p('xabi', 'Xabi Alonso', ['xabi']),
    p('iniesta', 'Andrés Iniesta'),
    p('casillas', 'Iker Casillas'),
    p('vbronckhorst', 'Giovanni van Bronckhorst'),
  ]);

  it('Xavi e Xabi: o exato ganha sempre à gralha', () => {
    expect(procurar(wc2010, 'xavi')).toMatchObject({ tipo: 'unico', id: 'xavi' });
    expect(procurar(wc2010, 'xabi')).toMatchObject({ tipo: 'unico', id: 'xabi' });
    expect(procurar(wc2010, 'alonso')).toMatchObject({ tipo: 'unico', id: 'xabi' });
    expect(procurar(wc2010, 'xavu')).toMatchObject({ tipo: 'unico', id: 'xavi' });
  });

  it('gralhas comuns', () => {
    expect(procurar(wc2010, 'iniessta')).toMatchObject({ tipo: 'unico', id: 'iniesta' });
    expect(procurar(wc2010, 'casilas')).toMatchObject({ tipo: 'unico', id: 'casillas' });
    expect(procurar(wc2010, 'van bronkhorst')).toMatchObject({ tipo: 'unico', id: 'vbronckhorst' });
  });

  // Final do Mundial 2002: Ronaldo, Ronaldinho e Rivaldo.
  const wc2002 = criarIndice([
    p('ronaldo', 'Ronaldo', ['fenomeno']),
    p('ronaldinho', 'Ronaldinho', ['ronaldinho gaucho']),
    p('rivaldo', 'Rivaldo'),
    p('kahn', 'Oliver Kahn'),
  ]);

  it('Ronaldo, Ronaldinho e Rivaldo não se confundem', () => {
    expect(procurar(wc2002, 'ronaldo')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });
    expect(procurar(wc2002, 'ronaldinho')).toMatchObject({ tipo: 'unico', id: 'ronaldinho' });
    expect(procurar(wc2002, 'rivaldo')).toMatchObject({ tipo: 'unico', id: 'rivaldo' });
    expect(procurar(wc2002, 'ronaldnho')).toMatchObject({ tipo: 'unico', id: 'ronaldinho' });
    expect(procurar(wc2002, 'rnaldo')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });
  });

  it('o nome completo de alguém ganha ao apelido automático de outro', () => {
    const idx = criarIndice([p('r9', 'Ronaldo'), p('cr7', 'Cristiano Ronaldo')]);
    expect(procurar(idx, 'ronaldo')).toMatchObject({ tipo: 'unico', id: 'r9' });
    expect(procurar(idx, 'cristiano ronaldo')).toMatchObject({ tipo: 'unico', id: 'cr7' });
  });

  it('nomes reais de outros jogos não são corrigidos para outra pessoa', () => {
    const conhecidos = new Set(['rivaldo', 'pedri', 'pereira']);
    const real2003 = criarIndice([p('ronaldo', 'Ronaldo'), p('figo', 'Luís Figo')], { conhecidos });
    // "rivaldo" está a 2 de "ronaldo", mas é outro jogador real.
    expect(procurar(real2003, 'rivaldo')).toEqual({ tipo: 'nenhum' });
    // Uma gralha que não é nome de ninguém continua a ser aceite.
    expect(procurar(real2003, 'ronaldoo')).toMatchObject({ tipo: 'unico', id: 'ronaldo' });

    const porto = criarIndice([p('pf', 'Paulo Ferreira')], { conhecidos });
    expect(procurar(porto, 'pereira')).toEqual({ tipo: 'nenhum' });
    expect(procurar(porto, 'ferrera')).toMatchObject({ tipo: 'unico', id: 'pf' });
  });

  it('nomes curtos só aceitam 1 gralha', () => {
    const idx = criarIndice([p('pepe', 'Pepe'), p('deco', 'Deco')]);
    expect(procurar(idx, 'pepi')).toMatchObject({ tipo: 'unico', id: 'pepe' });
    expect(procurar(idx, 'decco')).toMatchObject({ tipo: 'unico', id: 'deco' });
    expect(procurar(idx, 'dico')).toMatchObject({ tipo: 'unico', id: 'deco' });
    expect(procurar(idx, 'paca')).toEqual({ tipo: 'nenhum' });
  });

  it('Błaszczykowski aceita a alcunha e o nome sem acentos', () => {
    const idx = criarIndice([p('kuba', 'Jakub Błaszczykowski', ['kuba']), p('ode', 'Martin Ødegaard')]);
    expect(procurar(idx, 'kuba')).toMatchObject({ tipo: 'unico', id: 'kuba' });
    expect(procurar(idx, 'blaszczykowski')).toMatchObject({ tipo: 'unico', id: 'kuba' });
    expect(procurar(idx, 'odegaard')).toMatchObject({ tipo: 'unico', id: 'ode' });
    expect(procurar(idx, 'ødegard')).toMatchObject({ tipo: 'unico', id: 'ode' });
  });

  it('textos com menos de 3 letras só contam se forem exatos', () => {
    const idx = criarIndice([p('ze', 'Zé', []), p('sar', 'Edwin van der Sar')]);
    expect(procurar(idx, 'ze')).toMatchObject({ tipo: 'unico', id: 'ze' });
    expect(procurar(idx, 'sa')).toEqual({ tipo: 'nenhum' });
  });
});
