// Utilitários do cliente.

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

/** Cria um elemento HTML. `attrs`: class, text, dataset, style, on* e atributos normais. */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  aplicar(n, attrs);
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f);
  return n;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Cria um elemento SVG. */
export function svg(tag, attrs = {}, ...filhos) {
  const n = document.createElementNS(SVG_NS, tag);
  aplicar(n, attrs);
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f);
  return n;
}

function aplicar(n, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2004-05-26" → "26 de maio de 2004" */
export function formatarData(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  if (!a || !m || !d) return iso ?? '';
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** 167000 → "2:47" */
export function formatarTempo(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Cor de texto legível sobre um fundo. */
export function corTexto(hex) {
  const v = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? '#0b1220' : '#ffffff';
}

export function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // modo privado: fica só em memória
  }
}

export function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const bandeira = (pais) => `/bandeiras/${String(pais).toLowerCase()}.svg`;

/** Nome de uma pista para o feed e avisos. */
const NOMES_PISTAS = { numero: 'números das camisolas', pais: 'bandeiras', inicial: 'iniciais dos apelidos' };
export const nomePista = (ev) => NOMES_PISTAS[ev.pista] ?? NOMES_PISTAS[['numero', 'pais', 'inicial'][ev.nivel - 1]] ?? 'nova pista';
