// Valida todos os ficheiros de data/jogos/ e mostra um resumo (contagens, apelidos partilhados).
// Uso: node scripts/validar-dados.mjs   (sai com código 1 se houver erros)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { problemasDaFormacao, SIGLAS } from '../public/js/formacao.js';
import { normalizar, chavesDe } from '../src/nomes.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINUTO = /^(\d{1,3})(\+\d{1,2})?$/;

export function carregarJogos() {
  const pasta = join(raiz, 'data', 'jogos');
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((ficheiro) => ({ ficheiro, jogo: JSON.parse(readFileSync(join(pasta, ficheiro), 'utf8')) }));
}

export const carregarEquipas = () => JSON.parse(readFileSync(join(raiz, 'data', 'equipas.json'), 'utf8'));

const nomeDe = (x) => (typeof x === 'string' ? x : x?.nome);
const temBandeira = (pais) => typeof pais === 'string' && existsSync(join(raiz, 'public', 'bandeiras', `${pais.toLowerCase()}.svg`));

/** Erros de um jogo (lista vazia se estiver tudo bem). */
export function validarJogo(jogo, { ficheiro, equipas = {} } = {}) {
  const erros = [];
  const erro = (m) => erros.push(m);
  if (ficheiro && jogo.id !== ficheiro.replace(/\.json$/, '')) erro(`id "${jogo.id}" não bate com o ficheiro`);
  for (const campo of ['id', 'competicao', 'data', 'estadio', 'resultado']) {
    if (typeof jogo[campo] !== 'string' || !jogo[campo].trim()) erro(`falta "${campo}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jogo.data ?? '')) erro(`data inválida "${jogo.data}"`);
  if (jogo.selecoes !== undefined && typeof jogo.selecoes !== 'boolean') erro('"selecoes" tem de ser true/false');
  if (jogo.selecoes) {
    for (const e of jogo.equipas ?? []) {
      const paises = new Set((e.onze ?? []).map((p) => p.pais));
      if (paises.size > 1) erro(`${e.nome}: jogo entre seleções com nacionalidades diferentes no onze`);
    }
  }
  if (!Array.isArray(jogo.modos) || !jogo.modos.length) erro('falta "modos"');
  for (const m of jogo.modos ?? []) {
    if (m === 'final' || m === 'classico') continue;
    const slug = m.match(/^equipa:([a-z0-9-]+)$/)?.[1];
    if (!slug) erro(`modo inválido "${m}"`);
    else if (!equipas[slug]) erro(`equipa "${slug}" não está em data/equipas.json`);
    else if (!jogo.equipas?.some((e) => e.slug === slug)) erro(`modo "${m}" sem equipa com slug "${slug}"`);
  }
  if (!(jogo.modos ?? []).some((m) => m === 'final' || m === 'classico')) erro('modos tem de incluir "final" ou "classico"');
  if (!Array.isArray(jogo.equipas) || jogo.equipas.length !== 2) {
    erro('são precisas 2 equipas');
    return erros;
  }

  const nomes = new Map(); // nome normalizado -> onde aparece
  const registar = (nome, onde) => {
    if (typeof nome !== 'string' || !nome.trim() || nome === '?') return erro(`${onde}: nome em falta`);
    const n = normalizar(nome);
    if (nomes.has(n)) erro(`"${nome}" aparece duas vezes (${nomes.get(n)} e ${onde})`);
    else nomes.set(n, onde);
  };
  const verGolos = (p, onde) => {
    if (p.golos === undefined) return;
    if (!Array.isArray(p.golos) || !p.golos.length) return erro(`${onde}: "golos" inválido`);
    for (const g of p.golos) {
      if (!MINUTO.test(String(g?.minuto ?? '')) || Number.parseInt(g.minuto, 10) > 125) erro(`${onde}: minuto de golo inválido "${g?.minuto}"`);
      if ((g.penalti !== undefined && g.penalti !== true) || (g.autogolo !== undefined && g.autogolo !== true)) erro(`${onde}: golo com campos inválidos`);
      if (g.penalti && g.autogolo) erro(`${onde}: golo não pode ser penálti e autogolo`);
    }
  };
  const verAceites = (p, onde) => {
    if (p.aceites !== undefined && (!Array.isArray(p.aceites) || p.aceites.some((a) => typeof a !== 'string' || !normalizar(a)))) {
      erro(`${onde}: "aceites" inválido`);
    }
    if (p.curto !== undefined && (typeof p.curto !== 'string' || !p.curto.trim() || p.curto.length > 18)) erro(`${onde}: "curto" inválido`);
  };

  jogo.equipas.forEach((e, ie) => {
    const eq = `equipa ${ie + 1} (${e.nome})`;
    if (!e.nome) erro(`${eq}: falta o nome`);
    if (e.slug && !equipas[e.slug]) erro(`${eq}: slug "${e.slug}" desconhecido`);
    if (e.cor !== undefined && !/^#[0-9a-f]{6}$/i.test(e.cor)) erro(`${eq}: cor inválida "${e.cor}"`);
    if (!e.treinador?.nome) erro(`${eq}: falta o treinador`);
    else {
      registar(e.treinador.nome, `${eq} treinador`);
      verAceites(e.treinador, `${eq} treinador`);
    }
    if (!Array.isArray(e.onze) || e.onze.length !== 11) erro(`${eq}: o onze tem ${e.onze?.length ?? 0} jogadores`);
    const numeros = new Map();
    for (const p of e.onze ?? []) {
      const onde = `${eq} onze ${p.nome}`;
      registar(p.nome, onde);
      verAceites(p, onde);
      verGolos(p, onde);
      if (!SIGLAS.includes(p.pos)) erro(`${onde}: posição "${p.pos}" inválida`);
      if (!Number.isInteger(p.numero) || p.numero < 1 || p.numero > 99) erro(`${onde}: número inválido`);
      if (!temBandeira(p.pais)) erro(`${onde}: país "${p.pais}" sem bandeira`);
      if (p.inicial !== undefined && !/^\p{Lu}$/u.test(p.inicial)) erro(`${onde}: inicial inválida`);
      if (numeros.has(p.numero)) erro(`${eq}: número ${p.numero} repetido`);
      numeros.set(p.numero, p.nome);
    }
    if (e.onze?.length === 11) {
      for (const problema of problemasDaFormacao(e.onze, e.formacao)) erro(`${eq}: ${problema}`);
    }
    for (const s of e.suplentes ?? []) {
      const onde = `${eq} suplente ${s.nome}`;
      registar(s.nome, onde);
      verAceites(s, onde);
      verGolos(s, onde);
      if (!MINUTO.test(String(s.minuto ?? '')) || Number.parseInt(s.minuto, 10) > 125) erro(`${onde}: minuto inválido "${s.minuto}"`);
      if (!temBandeira(s.pais)) erro(`${onde}: país "${s.pais}" sem bandeira`);
      if (s.numero !== undefined && s.numero !== null) {
        if (numeros.has(s.numero)) erro(`${eq}: número ${s.numero} repetido`);
        numeros.set(s.numero, s.nome);
      }
    }
    for (const n of e.nao_utilizados ?? []) {
      registar(nomeDe(n), `${eq} banco`);
      if (typeof n === 'object') verAceites(n, `${eq} banco ${n.nome}`);
    }
  });
  const placar = String(jogo.resultado ?? '').match(/(\d+)\s*–\s*(\d+)/);
  if (!placar) erro(`resultado sem placar "X–Y": "${jogo.resultado}"`);
  else {
    const marcados = [0, 0];
    jogo.equipas.forEach((e, i) => {
      for (const p of [...(e.onze ?? []), ...(e.suplentes ?? [])]) {
        for (const g of p.golos ?? []) marcados[g.autogolo ? 1 - i : i]++;
      }
    });
    if (marcados[0] !== Number(placar[1]) || marcados[1] !== Number(placar[2])) {
      erro(`golos (${marcados[0]}–${marcados[1]}) não batem com o resultado ${placar[1]}–${placar[2]}`);
    }
  }
  return erros;
}

/** Chaves partilhadas por pessoas diferentes do mesmo jogo (o apelido sozinho não conta). */
export function apelidosPartilhados(jogo) {
  const pessoas = jogo.equipas.flatMap((e) => [
    e.treinador,
    ...e.onze,
    ...(e.suplentes ?? []),
    ...(e.nao_utilizados ?? []).map((n) => (typeof n === 'string' ? { nome: n } : n)),
  ]);
  const donos = new Map();
  for (const p of pessoas) {
    for (const { chave } of chavesDe(p)) {
      if (!donos.has(chave)) donos.set(chave, new Set());
      donos.get(chave).add(p.nome);
    }
  }
  return [...donos].filter(([, s]) => s.size > 1).map(([chave, s]) => `${chave}: ${[...s].join(' / ')}`);
}

export function validarTudo() {
  const equipas = carregarEquipas();
  const jogos = carregarJogos();
  const erros = [];
  const ids = new Set();
  for (const { ficheiro, jogo } of jogos) {
    if (ids.has(jogo.id)) erros.push(`${ficheiro}: id repetido`);
    ids.add(jogo.id);
    for (const e of validarJogo(jogo, { ficheiro, equipas })) erros.push(`${ficheiro}: ${e}`);
  }
  return { jogos, equipas, erros };
}

function principal() {
  const { jogos, equipas, erros } = validarTudo();
  const conta = (f) => jogos.filter(({ jogo }) => f(jogo)).length;
  console.log(`${jogos.length} jogos · ${conta((j) => j.modos.includes('final'))} finais · ${conta((j) => j.modos.includes('classico'))} clássicos`);
  const porEquipa = Object.keys(equipas)
    .map((slug) => [equipas[slug].nome, conta((j) => j.modos.includes(`equipa:${slug}`))])
    .filter(([, n]) => n > 0)
    .map(([nome, n]) => `${nome} ${n}`);
  console.log(`Equipa Mítica: ${porEquipa.join(' · ')}`);
  const partilhados = jogos.flatMap(({ ficheiro, jogo }) => apelidosPartilhados(jogo).map((a) => `  ${ficheiro}: ${a}`));
  if (partilhados.length) console.log(`Chaves partilhadas (pedem nome completo):\n${partilhados.join('\n')}`);
  if (erros.length) {
    console.error(`\n${erros.length} erro(s):\n${erros.map((e) => `  ✗ ${e}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Tudo válido.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
