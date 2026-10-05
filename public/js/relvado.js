// Relvado em SVG: linhas do campo, camisolas colocadas pela formação, pistas, descobertas e bancos.
import { disporOnze } from './formacao.js';
import { svg, el, corTexto, bandeira } from './util.js';

const L = 1050; // comprimento (unidades de 10 cm)
const W = 680; // largura
const M = 22; // margem à volta das linhas

const TAMANHOS = {
  horizontal: { S: 50, numero: 21, nome: 14, dono: 11, maxNome: 112 },
  vertical: { S: 62, numero: 26, nome: 20, dono: 14, maxNome: 150 },
};

const COR_EQUIPA_OMISSAO = ['#e5e7eb', '#9ca3af'];

/** Contorno de uma camisola centrada em (0,0) com largura S. */
function caminhoCamisola(S) {
  const pontos = [[33, 6], [18, 12], [2, 30], [14, 46], [24, 38], [24, 95], [76, 95], [76, 38], [86, 46], [98, 30], [82, 12], [67, 6]];
  const f = (x, y) => `${((x - 50) * S) / 100} ${((y - 50) * S) / 100}`;
  return `M${pontos.map(([x, y]) => f(x, y)).join(' L')} Q${f(50, 22)} ${f(33, 6)} Z`;
}

export function camisolaMini(cor = '#ffffff22', contorno = '#ffffff99') {
  return svg('svg', { width: 22, height: 22, viewBox: '-12 -12 24 24', 'aria-hidden': 'true' },
    svg('path', { d: caminhoCamisola(22), fill: cor, stroke: contorno, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
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
  constructor(svgEl, bancoCima, bancoBaixo) {
    this.svg = svgEl;
    this.bancoCima = bancoCima;
    this.bancoBaixo = bancoBaixo;
    this.chave = null;
    this.assinaturas = new Map();
    this.ultimo = null;
    this.vertical = false;
    new ResizeObserver(() => {
      const vertical = this.decidirOrientacao();
      if (vertical !== this.vertical && this.ultimo) this.render(...this.ultimo);
    }).observe(this.svg.parentElement);
  }

  decidirOrientacao() {
    return (this.svg.parentElement?.clientWidth ?? 1000) < 640;
  }

  /** Desenha (ou atualiza) o jogo. `jogadores`: Map id → { nome, cor }. */
  render(ronda, jogadores) {
    this.ultimo = [ronda, jogadores];
    this.vertical = this.decidirOrientacao();
    const chave = `${ronda.jogo.id}|${ronda.equipaMitica ?? ''}|${this.vertical}`;
    const novo = chave !== this.chave;
    if (novo) this.construir(ronda, chave);
    for (const e of ronda.equipas) {
      for (const lugar of e.onze) this.atualizarCamisola(lugar, e, jogadores, !novo);
      for (const lugar of [...e.suplentes, e.treinador]) this.atualizarBanco(lugar, jogadores, !novo);
    }
  }

  construir(ronda, chave) {
    this.chave = chave;
    this.assinaturas.clear();
    const t = TAMANHOS[this.vertical ? 'vertical' : 'horizontal'];
    const escala = ronda.equipas.length === 1 ? 1.12 : 1;
    this.t = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v * escala]));
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

    // Bancos: no telemóvel a equipa de cima tem o banco por cima do relvado.
    this.bancos = new Map();
    this.bancoCima.replaceChildren();
    this.bancoBaixo.replaceChildren();
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
      const destino = this.vertical && n === 2 && i === 1 ? this.bancoCima : this.bancoBaixo;
      destino.append(banco);
    });
    this.coresEquipa = ronda.equipas.map((e, i) => e.cor ?? COR_EQUIPA_OMISSAO[i]);
    this.indiceEquipa = new Map(ronda.equipas.flatMap((e, i) => [...e.onze, ...e.suplentes, e.treinador].map((l) => [l.id, i])));
  }

  atualizarCamisola(lugar, equipa, jogadores, animar) {
    const g = this.camisolas.get(lugar.id);
    if (!g) return;
    const dono = lugar.por ? jogadores.get(lugar.por) : null;
    const estado = lugar.por ? 'descoberta' : lugar.revelado ? 'revelada' : 'escondida';
    const assinatura = JSON.stringify([estado, lugar.numero, lugar.pais, lugar.inicial, lugar.curto, dono?.cor, dono?.nome]);
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
    } else {
      conteudo.append(svg('path', { class: 'forma', d: forma, fill: estado === 'descoberta' ? dono?.cor ?? '#fff' : '#4b5563' }));
    }
    const textoNumero = lugar.numero ?? (estado === 'escondida' ? '?' : '');
    const corNumero = estado === 'descoberta' ? corTexto(dono?.cor ?? '#ffffff') : null;
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
      const titulo = estado === 'descoberta' ? `${lugar.nome} — descoberto por ${dono?.nome ?? '?'} (+${lugar.pontos})` : `${lugar.nome} (ninguém descobriu)`;
      g.replaceChildren(svg('title', {}, titulo));
    }
    if (estado === 'escondida') g.replaceChildren();
    g.append(conteudo, rotulo);

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
    const assinatura = JSON.stringify([estado, lugar.curto, dono?.cor, dono?.nome]);
    const anterior = this.assinaturas.get(lugar.id);
    if (anterior === assinatura) return;
    this.assinaturas.set(lugar.id, assinatura);

    const treinador = lugar.tipo === 'treinador';
    chip.className = `lugar-banco ${estado}${treinador ? ' treinador' : ''}`;
    chip.style.setProperty('--cor', dono?.cor ?? '');
    const corCamisola = estado === 'descoberta' ? dono.cor : estado === 'revelada' ? '#4b5563' : '#ffffff1f';
    const partes = treinador
      ? [el('span', { class: 'minuto', text: 'Treinador' })]
      : [camisolaMini(corCamisola), el('span', { class: 'minuto', text: `⬆ ${lugar.minuto}'` })];
    chip.replaceChildren(...partes, el('span', { class: 'quem', text: estado === 'escondida' ? '?' : lugar.curto ?? lugar.nome }));
    chip.title = estado === 'descoberta' ? `${lugar.nome} — descoberto por ${dono?.nome} (+${lugar.pontos})` : estado === 'revelada' ? lugar.nome : '';
    if (animar && estado === 'descoberta' && anterior && JSON.parse(anterior)[0] === 'escondida') {
      chip.classList.remove('conquista');
      void chip.offsetWidth;
      chip.classList.add('conquista');
    }
  }
}
