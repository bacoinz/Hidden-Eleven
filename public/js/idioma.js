// Idioma do jogo: português (o original) ou inglês. Em inglês, cada texto que aparece no ecrã (do cliente ou do
// servidor) troca-se pela tradução de ingles.js, à medida que vai aparecendo. Mudar de idioma recarrega a página.
import { PARES, EQUIPAS, POSICOES, COMO_JOGAR } from './ingles.js';

const CHAVE = 'he.idioma';

function escolhido() {
  if (typeof location === 'undefined') return 'pt'; // nos testes, sem browser
  const doLink = new URLSearchParams(location.search).get('lang');
  try {
    // Um link com ?lang=en fica escolhido para as próximas visitas.
    if (doLink === 'pt' || doLink === 'en') localStorage.setItem(CHAVE, doLink);
  } catch {}
  if (doLink === 'pt' || doLink === 'en') return doLink;
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (guardado === 'pt' || guardado === 'en') return guardado;
  } catch {}
  return (navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export const IDIOMA = escolhido();
export const emIngles = IDIOMA === 'en';

export function mudarIdioma(idioma) {
  try {
    localStorage.setItem(CHAVE, idioma);
  } catch {}
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url);
}

// --- O dicionário: textos exatos e padrões com partes que mudam ---

const exatos = new Map();
const padroes = [];
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function juntar(pt, en) {
  if (!/\{\d+\}/.test(pt)) {
    if (!exatos.has(pt)) exatos.set(pt, en);
    return;
  }
  const ordem = [];
  const re = new RegExp(`^${escapar(pt).replace(/\\\{(\d+)\\\}/g, (_, d) => {
    ordem.push(Number(d));
    return '([\\s\\S]+?)';
  })}$`);
  padroes.push({ re, ordem, en, fixo: pt.replace(/\{\d+\}/g, '').length });
}

for (const [pt, en] of PARES) juntar(pt, en);
for (const [pt, en] of Object.entries(EQUIPAS)) juntar(pt, en);
for (const [pt, en] of Object.entries(POSICOES)) juntar(pt, en);

// Os padrões com mais texto fixo são os mais específicos: experimentam-se primeiro.
padroes.sort((a, b) => b.fixo - a.fixo);

/** "Mónaco 0–3 FC Porto (5–3 g.p.)" → "Monaco 0–3 FC Porto (5–3 pens)"; "(a.p.)" → "(a.e.t.)". */
function resultado(t) {
  const m = t.match(/^(.+?) (\d+)–(\d+) (.+?)(?: \((a\.p\.|\d+–\d+ g\.p\.)\))?$/);
  if (!m) return null;
  const equipa = (n) => EQUIPAS[n] ?? n;
  const extra = !m[5] ? '' : m[5] === 'a.p.' ? ' (a.e.t.)' : ` (${m[5].replace(' g.p.', ' pens')})`;
  return `${equipa(m[1])} ${m[2]}–${m[3]} ${equipa(m[4])}${extra}`;
}

const cache = new Map();

function parte(t, profundidade) {
  const exato = exatos.get(t);
  if (exato !== undefined) return exato;
  const r = resultado(t);
  if (r) return r;
  if (profundidade > 3) return t;
  for (const p of padroes) {
    const m = t.match(p.re);
    if (!m) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, d) => parte(m[p.ordem.indexOf(Number(d)) + 1], profundidade + 1));
  }
  return t;
}

/** O texto no idioma escolhido. Em português, fica igual. */
export function traduzir(texto) {
  if (!emIngles || !texto) return texto;
  const m = texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const nucleo = m[2];
  if (!nucleo) return texto;
  let r = cache.get(nucleo);
  if (r === undefined) {
    r = parte(nucleo, 0);
    if (cache.size > 20000) cache.clear();
    cache.set(nucleo, r);
  }
  return m[1] + r + m[3];
}

// --- No ecrã: traduz o que já lá está e o que for aparecendo ---

const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt'];
const SVG = 'http://www.w3.org/2000/svg';

function traduzirAtributo(el, nome) {
  const v = el.getAttribute(nome);
  if (!v) return;
  const t = traduzir(v);
  if (t !== v) el.setAttribute(nome, t);
}

function traduzirNo(no) {
  if (no.nodeType === 3) {
    if (no.parentNode?.namespaceURI === SVG) return; // nomes dos jogadores no relvado
    const v = no.nodeValue;
    const t = traduzir(v);
    if (t !== v) no.nodeValue = t;
    return;
  }
  if (no.nodeType !== 1 || no.tagName === 'SCRIPT' || no.tagName === 'STYLE') return;
  for (const a of ATRIBUTOS) traduzirAtributo(no, a);
  if (no.namespaceURI === SVG) return;
  for (const filho of no.childNodes) traduzirNo(filho);
}

/** Liga a tradução do ecrã. Chama-se uma vez, antes de o jogo desenhar alguma coisa. */
export function instalarTradutor() {
  document.documentElement.lang = emIngles ? 'en' : 'pt-PT';
  for (const el of document.querySelectorAll('[data-idioma]')) el.hidden = el.dataset.idioma !== IDIOMA;
  for (const s of document.querySelectorAll('[data-mudar-idioma]')) {
    s.value = IDIOMA;
    s.addEventListener('change', () => mudarIdioma(s.value));
  }
  if (!emIngles) return;
  const como = document.querySelector('#dialogo-como .regras');
  if (como) como.innerHTML = COMO_JOGAR;
  traduzirNo(document.body);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'characterData') traduzirNo(m.target);
      else if (m.type === 'attributes') traduzirAtributo(m.target, m.attributeName);
      else for (const no of m.addedNodes) traduzirNo(no);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
