// Relvado em SVG: linhas do campo, camisolas colocadas pela formação, pistas, descobertas e bancos.
import { disporOnze } from './formacao.js';
import { svg, el, corTexto, bandeira } from './util.js';
import { traduzir } from './idioma.js';

const L = 1050; // comprimento (unidades de 10 cm)
const W = 680; // largura
const M = 22; // margem à volta das linhas

const TAMANHOS = {
  horizontal: { S: 58, numero: 24, nome: 15, dono: 12, maxNome: 122 },
  vertical: { S: 68, numero: 29, nome: 21, dono: 15, maxNome: 158 },
};
/** Em ecrãs pequenos o texto cresce (em unidades do SVG) para nunca ficar abaixo deste tamanho em píxeis. */
const LETRA_MINIMA_PX = 11;

const COR_EQUIPA_OMISSAO = ['#e5e7eb', '#9ca3af'];

/** Contorno de uma camisola centrada em (0,0) com largura S. */
function caminhoCamisola(S) {
  const pontos = [[33, 6], [18, 12], [2, 30], [14, 46], [24, 38], [24, 95], [76, 95], [76, 38], [86, 46], [98, 30], [82, 12], [67, 6]];
  const f = (x, y) => `${((x - 50) * S) / 100} ${((y - 50) * S) / 100}`;
  return `M${pontos.map(([x, y]) => f(x, y)).join(' L')} Q${f(50, 22)} ${f(33, 6)} Z`;
}

export function camisolaMini(cor = '#ffffff22', contorno = '#ffffff99', numero = null) {
  return svg('svg', { class: 'camisola-mini', width: 32, height: 32, viewBox: '-12 -12 24 24', 'aria-hidden': 'true' },
    svg('path', { d: caminhoCamisola(22), fill: cor, stroke: contorno, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
    numero != null ? svg('text', { class: 'numero-mini', x: 0, y: 4.2, 'font-size': String(numero).length > 1 ? 10 : 11.5 }, String(numero)) : null);
}

/** Bola de futebol centrada em (0,0); vermelha nos autogolos. */
function bola(r, autogolo = false) {
  const pentagono = [...Array(5)]
    .map((_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      return `${(Math.cos(a) * r * 0.45).toFixed(2)},${(Math.sin(a) * r * 0.45).toFixed(2)}`;
    })
    .join(' ');
  return svg('g', { class: 'bola' },
    svg('circle', { r, fill: autogolo ? '#ef4444' : '#ffffff', stroke: '#0b1220', 'stroke-width': r * 0.2 }),
    svg('polygon', { points: pentagono, fill: autogolo ? '#7f1d1d' : '#0b1220' }));
}

const descreverGolo = (g) => traduzir(`${g.autogolo ? 'Autogolo' : g.penalti ? 'Golo de penálti' : 'Golo'} ${g.minuto}'`);

/** Bolas dos golos ao lado da camisola (uma por golo; a partir de 4, uma bola com "×N"). */
function iconesGolos(golos, S) {
  const r = S * 0.15;
  const g = svg('g', { class: 'golos' });
  const mostrar = golos.length > 3 ? [golos[0]] : golos;
  mostrar.forEach((golo, i) => {
    const icone = bola(r, golo.autogolo);
    icone.setAttribute('transform', `translate(${S * 0.52 + r} ${-S * 0.3 + i * r * 2.3})`);
    g.append(icone);
    const extra = golos.length > 3 ? `×${golos.length}` : golo.penalti ? 'P' : '';
    if (extra) {
      g.append(svg('text', { class: 'golo-extra', x: S * 0.52 + r * 2.3, y: -S * 0.3 + i * r * 2.3 + r * 0.45, 'font-size': r * 1.35, 'stroke-width': r * 0.35 }, extra));
    }
  });
  return g;
}

/** Versão HTML (para os bancos). */
export function bolasHtml(golos = []) {
  return golos.map((golo) => {
    const s = svg('svg', { class: 'bola-mini', width: 14, height: 14, viewBox: '-8 -8 16 16', 'aria-hidden': 'true' }, bola(6.5, golo.autogolo));
    return el('span', { class: 'golo-mini', title: descreverGolo(golo) }, s, golo.penalti ? el('b', { text: 'P' }) : null);
  });
}

/** Linhas do campo em coordenadas horizontais (x ao longo do comprimento, y na largura). */
function marcacoes() {
  const g = svg('g');
  const faixas = 14;
  for (let i = 0; i < faixas; i++) {
    g.append(svg('rect', { x: (L / faixas) * i, y: 0, width: L / faixas + 0.5, height: W, fill: i % 2 ? '#0f3d24' : '#124a2c' }));
  }
  const linhas = svg('g', { class: 'linhas' });
  const area = (x0, sentido) => {
    const ax = (d) => x0 + sentido * d;
    linhas.append(
      svg('rect', { x: Math.min(x0, ax(165)), y: (W - 403.2) / 2, width: 165, height: 403.2 }),
      svg('rect', { x: Math.min(x0, ax(55)), y: (W - 183.2) / 2, width: 55, height: 183.2 }),
      svg('path', { d: `M${ax(165)} ${W / 2 - 73.2} A91.5 91.5 0 0 ${sentido > 0 ? 1 : 0} ${ax(165)} ${W / 2 + 73.2}` }),
      svg('rect', { x: sentido > 0 ? -16 : L, y: (W - 73.2) / 2, width: 16, height: 73.2 }),
    );
    g.append(svg('circle', { class: 'ponto-cal', cx: ax(110), cy: W / 2, r: 4 }));
  };
  linhas.append(
    svg('rect', { x: 0, y: 0, width: L, height: W }),
    svg('line', { x1: L / 2, y1: 0, x2: L / 2, y2: W }),
    svg('circle', { cx: L / 2, cy: W / 2, r: 91.5 }),
    svg('path', { d: `M10 0 A10 10 0 0 1 0 10 M${L - 10} 0 A10 10 0 0 0 ${L} 10 M0 ${W - 10} A10 10 0 0 1 10 ${W} M${L} ${W - 10} A10 10 0 0 0 ${L - 10} ${W}` }),
  );
  area(0, 1);
  area(L, -1);
  g.append(linhas, svg('circle', { class: 'ponto-cal', cx: L / 2, cy: W / 2, r: 4 }));
  return g;
}

/**
 * Coordenadas da equipa (x lateral 0=direita…1=esquerda; y profundidade 0…1) → campo horizontal.
 * Com duas equipas, cada uma fica na sua metade e as linhas mais avançadas não chegam ao meio-campo,
 * para os nomes dos avançados das duas equipas não se sobreporem.
 */
const PROFUNDIDADE_METADE = 0.9;
function paraCampo(indice, nEquipas, p) {
  if (nEquipas === 1) return { x: M * 0.5 + p.y * (L - M), y: (1 - p.x) * W };
  const x = p.y * (L / 2) * PROFUNDIDADE_METADE;
  if (indice === 0) return { x, y: (1 - p.x) * W };
  return { x: L - x, y: p.x * W };
}

const larguraTexto = (texto, tamanho) => texto.length * tamanho * 0.58;

export class Relvado {
  /** `bancoA`: à esquerda (computador) ou por cima (telemóvel); `bancoB`: à direita ou por baixo. */
  constructor(svgEl, bancoA, bancoB) {
    this.svg = svgEl;
    this.bancoA = bancoA;
    this.bancoB = bancoB;
    this.k = 1;
    this.chave = null;
    this.assinaturas = new Map();
    this.ultimo = null;
    this.vertical = false;
    new ResizeObserver(() => {
      if (!this.ultimo) return;
      const vertical = this.decidirOrientacao();
      const mudouTexto = Math.abs(this.fatorTexto(vertical) - this.k) / this.k > 0.08;
      if (vertical !== this.vertical || mudouTexto) {
        this.chave = null;
        this.render(...this.ultimo);
      }
    }).observe(this.svg.parentElement);
  }

  /** Vertical só no layout de telemóvel (abaixo de 960 px) e quando a largura é pouca. */
  decidirOrientacao() {
    if (matchMedia('(min-width: 960px)').matches) return false;
    return (this.svg.parentElement?.clientWidth ?? 1000) < 640;
  }

  /** Quanto o texto tem de crescer para se ler bem à escala a que o relvado está desenhado. */
  fatorTexto(vertical) {
    const caixa = this.svg.parentElement?.getBoundingClientRect();
    if (!caixa?.width) return 1;
    const [vw, vh] = vertical ? [W + 2 * M, L + 2 * M] : [L + 2 * M, W + 2 * M];
    // No telemóvel a altura acompanha a largura; no computador o SVG ajusta-se à caixa.
    const escala = vertical || !caixa.height ? caixa.width / vw : Math.min(caixa.width / vw, caixa.height / vh);
    const base = TAMANHOS[vertical ? 'vertical' : 'horizontal'].nome;
    return Math.min(1.6, Math.max(1, LETRA_MINIMA_PX / (base * escala)));
  }

  /**
   * Desenha (ou atualiza) o jogo. `jogadores`: Map id → { nome, cor }.
   * `meuLado` (duelo): índice da equipa de quem joga; a outra fica esbatida.
   */
  render(ronda, jogadores, meuLado = null) {
    this.ultimo = [ronda, jogadores, meuLado];
    this.vertical = this.decidirOrientacao();
    const chave = `${ronda.jogo.id}|${ronda.equipaMitica ?? ''}|${this.vertical}`;
    const novo = chave !== this.chave;
    if (novo) this.construir(ronda, chave);
    for (const e of ronda.equipas) {
      for (const lugar of e.onze) this.atualizarCamisola(lugar, e, jogadores, !novo);
      for (const lugar of [...e.suplentes, e.treinador]) this.atualizarBanco(lugar, jogadores, !novo);
      const fora = meuLado != null && e.indice !== meuLado;
      for (const lugar of e.onze) this.camisolas.get(lugar.id)?.classList.toggle('outro-lado', fora);
      for (const lugar of [...e.suplentes, e.treinador]) this.bancos.get(lugar.id)?.classList.toggle('outro-lado', fora);
    }
  }

  construir(ronda, chave) {
    this.chave = chave;
    this.assinaturas.clear();
    const t = TAMANHOS[this.vertical ? 'vertical' : 'horizontal'];
    const escala = ronda.equipas.length === 1 ? 1.12 : 1;
    this.k = this.fatorTexto(this.vertical);
    const k = this.k;
    const ks = Math.min(k, 1.2);
    this.t = {
      S: t.S * escala * ks,
      numero: t.numero * escala * ks,
      nome: t.nome * escala * k,
      dono: t.dono * escala * k,
      maxNome: t.maxNome * escala * k,
    };
    const [vw, vh] = this.vertical ? [W, L] : [L, W];
    this.svg.setAttribute('viewBox', `${-M} ${-M} ${vw + 2 * M} ${vh + 2 * M}`);
    this.svg.replaceChildren();
    const campo = marcacoes();
    if (this.vertical) campo.setAttribute('transform', `translate(0 ${L}) rotate(-90)`);
    this.svg.append(campo);

    this.camisolas = new Map();
    const n = ronda.equipas.length;
    ronda.equipas.forEach((e, i) => {
      const posicoes = disporOnze(e.onze, e.formacao);
      e.onze.forEach((lugar, k) => {
        const c = paraCampo(i, n, posicoes[k]);
        const [X, Y] = this.vertical ? [c.y, L - c.x] : [c.x, c.y];
        const g = svg('g', { class: 'camisola escondida', transform: `translate(${X.toFixed(1)} ${Y.toFixed(1)})`, 'data-id': lugar.id });
        this.svg.append(g);
        this.camisolas.set(lugar.id, g);
      });
    });

    // Bancos: no computador ao lado de cada equipa; no telemóvel por cima/por baixo do relvado.
    this.bancos = new Map();
    this.bancoA.replaceChildren();
    this.bancoB.replaceChildren();
    const destino = (i) => {
      if (n === 1) return this.vertical ? this.bancoB : this.bancoA;
      if (this.vertical) return i === 1 ? this.bancoA : this.bancoB;
      return i === 0 ? this.bancoA : this.bancoB;
    };
    ronda.equipas.forEach((e, i) => {
      const cor = e.cor ?? COR_EQUIPA_OMISSAO[i];
      const lugares = el('div', { class: 'banco-lugares' });
      const banco = el('section', { class: 'banco' },
        el('p', { class: 'banco-titulo' }, el('span', { class: 'ponto', style: { background: cor } }), `${e.nome} · ${e.formacao}`),
        lugares);
      for (const lugar of [...e.suplentes, e.treinador]) {
        const chip = el('span', { class: `lugar-banco escondida${lugar.tipo === 'treinador' ? ' treinador' : ''}`, 'data-id': lugar.id });
        lugares.append(chip);
        this.bancos.set(lugar.id, chip);
      }
      destino(i).append(banco);
    });
    this.coresEquipa = ronda.equipas.map((e, i) => e.cor ?? COR_EQUIPA_OMISSAO[i]);
    this.indiceEquipa = new Map(ronda.equipas.flatMap((e, i) => [...e.onze, ...e.suplentes, e.treinador].map((l) => [l.id, i])));
  }

  atualizarCamisola(lugar, equipa, jogadores, animar) {
    const g = this.camisolas.get(lugar.id);
    if (!g) return;
    const dono = lugar.por ? jogadores.get(lugar.por) : null;
    const estado = lugar.por ? 'descoberta' : lugar.revelado ? 'revelada' : 'escondida';
    const assinatura = JSON.stringify([estado, lugar.numero, lugar.pais, lugar.inicial, lugar.curto, dono?.cor, dono?.nome, lugar.golos]);
    const anterior = this.assinaturas.get(lugar.id);
    if (anterior === assinatura) return;
    this.assinaturas.set(lugar.id, assinatura);

    const { S, numero, nome, dono: tamDono, maxNome } = this.t;
    const corEquipa = this.coresEquipa[this.indiceEquipa.get(lugar.id)];
    g.setAttribute('class', `camisola ${estado}`);
    const conteudo = svg('g', { class: 'conteudo' });
    const forma = caminhoCamisola(S);
    if (estado === 'escondida') {
      conteudo.append(
        svg('path', { d: forma, fill: '#06140d', 'fill-opacity': 0.82 }),
        svg('path', { class: 'forma', d: forma, fill: corEquipa, 'fill-opacity': 0.38 }),
      );
    } else if (estado === 'descoberta') {
      // Camisolas claras levam contorno escuro para se verem no relvado.
      const contorno = corTexto(corEquipa) === '#ffffff' ? '#ffffff' : '#0b1220';
      conteudo.append(svg('path', { class: 'forma', d: forma, fill: corEquipa, style: { stroke: contorno } }));
    } else {
      conteudo.append(svg('path', { class: 'forma', d: forma, fill: '#4b5563' }));
    }
    const textoNumero = lugar.numero ?? (estado === 'escondida' ? '?' : '');
    const corNumero = estado === 'descoberta' ? corTexto(corEquipa) : null;
    conteudo.append(svg('text', { class: 'numero', y: S * 0.1, 'font-size': numero, fill: corNumero }, String(textoNumero)));

    const rotulo = svg('g', { class: 'legenda' });
    const y0 = S * 0.5 + nome * 0.95;
    if (estado === 'escondida') {
      const temBandeira = Boolean(lugar.pais);
      const temInicial = Boolean(lugar.inicial);
      if (temBandeira || temInicial) {
        const bw = nome * 1.5;
        const bh = bw * 0.75;
        const larguraInicial = temInicial ? larguraTexto(`${lugar.inicial}.`, nome) : 0;
        const total = (temBandeira ? bw : 0) + (temBandeira && temInicial ? 6 : 0) + larguraInicial;
        let x = -total / 2;
        if (temBandeira) {
          rotulo.append(svg('image', { class: 'bandeira', href: bandeira(lugar.pais), x, y: y0 - bh * 0.8, width: bw, height: bh, preserveAspectRatio: 'none' }));
          x += bw + 6;
        }
        if (temInicial) {
          rotulo.append(svg('text', { class: 'rotulo-pista', x: x + larguraInicial / 2, y: y0, 'font-size': nome, 'stroke-width': nome * 0.28 }, `${lugar.inicial}.`));
        }
        if (anterior) rotulo.classList.add('pista-nova');
      }
    } else {
      const texto = lugar.curto ?? lugar.nome ?? '';
      const t = svg('text', { class: 'rotulo-nome', y: y0, 'font-size': nome, 'stroke-width': nome * 0.3 }, texto);
      if (larguraTexto(texto, nome) > maxNome) {
        t.setAttribute('textLength', maxNome);
        t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      rotulo.append(t);
      if (estado === 'descoberta' && dono) {
        rotulo.append(svg('text', { class: 'rotulo-dono', y: y0 + tamDono * 1.25, 'font-size': tamDono, fill: dono.cor, 'stroke-width': tamDono * 0.3 }, dono.nome));
      }
      const golos = (lugar.golos ?? []).map(descreverGolo).join(', ');
      // O título do SVG não passa pelo tradutor do ecrã: traduz-se aqui.
      const titulo = `${traduzir(`${lugar.nome}${estado === 'descoberta' ? ` — descoberto por ${dono?.nome ?? '?'} (+${lugar.pontos})` : ' (ninguém descobriu)'}`)}${golos ? ` · ${golos}` : ''}`;
      g.replaceChildren(svg('title', {}, titulo));
    }
    if (estado === 'escondida') g.replaceChildren();
    g.append(conteudo, rotulo);
    if (lugar.golos?.length) g.append(iconesGolos(lugar.golos, S));

    if (animar && estado === 'descoberta' && anterior && JSON.parse(anterior)[0] === 'escondida') {
      this.animarConquista(g, dono?.cor ?? '#fff', lugar.pontos);
    }
  }

  animarConquista(g, cor, pontos) {
    const { S, numero } = this.t;
    g.classList.add('conquista');
    const anel = svg('circle', { class: 'anel', r: S * 0.55, stroke: cor });
    const mais = svg('text', { class: 'pontos-flutuantes', y: -S * 0.7, 'font-size': numero * 1.25, fill: cor }, `+${pontos}`);
    g.append(anel, mais);
    // Traz a camisola para cima das vizinhas durante a animação.
    g.parentNode.append(g);
    setTimeout(() => {
      anel.remove();
      mais.remove();
      g.classList.remove('conquista');
    }, 1300);
  }

  atualizarBanco(lugar, jogadores, animar) {
    const chip = this.bancos.get(lugar.id);
    if (!chip) return;
    const dono = lugar.por ? jogadores.get(lugar.por) : null;
    const estado = lugar.por ? 'descoberta' : lugar.revelado ? 'revelada' : 'escondida';
    const assinatura = JSON.stringify([estado, lugar.curto, dono?.cor, dono?.nome, lugar.golos, lugar.pos, lugar.numero, lugar.pais, lugar.inicial]);
    const anterior = this.assinaturas.get(lugar.id);
    if (anterior === assinatura) return;
    this.assinaturas.set(lugar.id, assinatura);

    const treinador = lugar.tipo === 'treinador';
    chip.className = `lugar-banco ${estado}${treinador ? ' treinador' : ''}`;
    chip.style.setProperty('--cor', dono?.cor ?? '');
    const corEquipa = this.coresEquipa[this.indiceEquipa.get(lugar.id)];
    const corCamisola = estado === 'descoberta' ? corEquipa : estado === 'revelada' ? '#4b5563' : '#ffffff1f';
    // Por descobrir: a posição desde o início e, com as pistas, o número, a bandeira e a inicial (ao treinador, só a inicial).
    const partes = treinador
      ? [el('span', { class: 'minuto', text: 'Treinador' })]
      : [
          camisolaMini(corCamisola, '#ffffff99', lugar.numero),
          el('span', { class: 'minuto', text: `⬆ ${lugar.minuto}'` }),
          lugar.pos ? el('span', { class: 'pos-banco', text: lugar.pos }) : null,
        ];
    const escondida = estado === 'escondida';
    const filhos = [
      ...partes,
      escondida && lugar.pais ? el('img', { class: 'bandeira-banco', src: bandeira(lugar.pais), alt: '', width: 18, height: 12 }) : null,
      el('span', { class: 'quem', text: escondida ? (lugar.inicial ? `${lugar.inicial}.` : '?') : lugar.curto ?? lugar.nome }),
      ...bolasHtml(lugar.golos),
      estado === 'descoberta' && dono ? el('span', { class: 'dono', style: { color: dono.cor }, text: dono.nome }) : null,
    ];
    chip.replaceChildren(...filhos.filter(Boolean));
    chip.title = estado === 'descoberta' ? `${lugar.nome} — descoberto por ${dono?.nome} (+${lugar.pontos})` : estado === 'revelada' ? lugar.nome : '';
    if (animar && estado === 'descoberta' && anterior && JSON.parse(anterior)[0] === 'escondida') {
      chip.classList.remove('conquista');
      void chip.offsetWidth;
      chip.classList.add('conquista');
    }
  }
}
