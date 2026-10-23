// Posição de cada suplente utilizado: a de quem ele substituiu (pelo minuto em que um saiu e o outro entrou).
// Os importadores deixam nos jogadores os campos temporários `_saiu`, `_entrou` e `_dica` (posição da fonte ou
// habitual), e esta passagem corre depois da curadoria, para usar as posições finais do onze.

/** "90+2" → 90.02; 46 → 46; sem minuto → null. */
export function minutoNumerico(m) {
  const x = String(m ?? '').match(/(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/);
  return x ? Number(x[1]) + (x[2] ? Number(x[2]) / 100 : 0) : null;
}

/** Linha de uma sigla (ou de uma dica genérica 'G' | 'D' | 'M' | 'A'). */
export function linha(s) {
  if (!s) return null;
  if (s.length === 1) return s;
  if (s === 'GR') return 'G';
  if (/^D/.test(s)) return 'D';
  if (/^(ED|EE|PL)$/.test(s)) return 'A';
  return 'M';
}
const POR_OMISSAO = { G: 'GR', D: 'DC', M: 'MC', A: 'PL' };
const ALAS = new Set(['DD', 'DE', 'MD', 'ME']);

/**
 * Sigla de cada suplente de uma equipa. `dica(suplente)` (pode ser assíncrona) devolve a posição da fonte, quando há,
 * e só é pedida quando é precisa: vários a entrar no mesmo minuto, ou uma troca para outra linha.
 * Devolve { siglas: [sigla | null], avisos: [texto] }.
 */
export async function siglasDosSuplentes(onze, suplentes, dica = (s) => s._dica ?? null) {
  const saidas = onze
    .filter((p) => minutoNumerico(p._saiu) != null)
    .map((p) => ({ pos: p.pos, min: minutoNumerico(p._saiu), quem: p.nome }));
  const siglas = suplentes.map(() => null);
  const avisos = [];
  const ordem = suplentes.map((s, k) => ({ s, k, min: minutoNumerico(s._entrou ?? s.minuto) })).sort((a, b) => a.min - b.min || a.k - b.k);
  const dicas = new Map();
  const dicaDe = async (x) => {
    if (!dicas.has(x.k)) dicas.set(x.k, (await dica(x.s)) ?? null);
    return dicas.get(x.k);
  };

  for (let i = 0; i < ordem.length; ) {
    const grupo = ordem.filter((x) => x.min === ordem[i].min);
    i += grupo.length;
    // Quem saiu nesse minuto; se não bater certo (fontes com 90' e 90+1'), o mais próximo até 3 minutos.
    let candidatos = saidas.filter((o) => !o.usado && o.min === grupo[0].min);
    if (candidatos.length < grupo.length) {
      const perto = saidas
        .filter((o) => !o.usado && !candidatos.includes(o) && Math.abs(o.min - grupo[0].min) <= 3)
        .sort((a, b) => Math.abs(a.min - grupo[0].min) - Math.abs(b.min - grupo[0].min));
      candidatos = [...candidatos, ...perto].slice(0, grupo.length);
    }
    const pares = new Map();
    if (grupo.length === 1 && candidatos.length) pares.set(grupo[0], candidatos[0]);
    else {
      // Vários no mesmo minuto: primeiro os da mesma linha, depois pela ordem.
      for (const x of grupo) {
        const l = linha(await dicaDe(x));
        const c = candidatos.find((o) => !o.usado && l && linha(o.pos) === l);
        if (c) {
          c.usado = true;
          pares.set(x, c);
        }
      }
      for (const x of grupo) {
        if (pares.has(x)) continue;
        const c = candidatos.find((o) => !o.usado);
        if (c) {
          c.usado = true;
          pares.set(x, c);
        }
      }
    }
    for (const x of grupo) {
      const c = pares.get(x);
      if (c) c.usado = true;
      let sigla = c?.pos ?? null;
      // Um defesa a entrar para o lugar de um médio ou avançado (ou o contrário) muda a linha: fica a posição da fonte.
      // Entre médios e avançados não: a dica é a posição habitual e o lugar de quem saiu diz mais sobre esse jogo.
      if (c) {
        const d = await dicaDe(x);
        const [ld, lc] = [linha(d), linha(c.pos)];
        // Laterais e alas trocam entre si (um lateral no lugar de um ala de um 3-4-3 joga a ala).
        const alas = ALAS.has(d) && ALAS.has(c.pos);
        if (d && ld !== lc && (ld === 'D' || lc === 'D') && lc !== 'G' && ld !== 'G' && !alas) sigla = d.length > 1 ? d : POR_OMISSAO[d];
      } else {
        const d = await dicaDe(x);
        sigla = d ? (d.length > 1 ? d : POR_OMISSAO[d]) : null;
        avisos.push(`${x.s.nome} (${x.s.minuto}'): não encontrei quem saiu${sigla ? `; fica ${sigla}` : ''}`);
      }
      siglas[x.k] = sigla;
      // Um suplente que depois também sai deixa a posição a quem entra a seguir.
      if (sigla && minutoNumerico(x.s._saiu) != null) saidas.push({ pos: sigla, min: minutoNumerico(x.s._saiu), quem: x.s.nome });
    }
  }
  return { siglas, avisos };
}

/** Dá `pos` aos suplentes do jogo (os que a curadoria já fixou ficam) e apaga os campos temporários. */
export async function atribuirPosicoesSuplentes(jogo, dica) {
  const avisos = [];
  for (const e of jogo.equipas) {
    const { siglas, avisos: a } = await siglasDosSuplentes(e.onze, e.suplentes, dica);
    e.suplentes.forEach((s, k) => {
      if (!s.pos && siglas[k]) s.pos = siglas[k];
      if (!s.pos) avisos.push(`${e.nome}: ${s.nome} sem posição`);
    });
    avisos.push(...a.map((x) => `${e.nome}: ${x}`));
    for (const p of [...e.onze, ...e.suplentes]) for (const campo of ['_saiu', '_entrou', '_dica', '_perfil']) delete p[campo];
  }
  return avisos;
}
