// Importa um jogo a partir da ficha do zerozero.pt (HTML bruto) e escreve data/jogos/<id>.json.
// Serve para os jogos sem tabela de onzes na Wikipédia (dérbis portugueses, jornadas de campeonato).
// O zerozero não tem posições: o onze de cada equipa (nome → sigla, pela ordem no relvado) e a formação
// vêm de scripts/curadoria.json, campos "onze" e "formacao".
//
// Uso:
//   node scripts/importar-zerozero.mjs <id>             importa a entrada <id> de scripts/fontes.json (com "zerozero")
//   node scripts/importar-zerozero.mjs --todos          importa todas as entradas do zerozero sem ficheiro
//   opções: --forcar (reescreve o ficheiro), --mostrar (só imprime), --fresco (ignora a cache)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraCodigoJson } from './paises.mjs';
import { formatarJogo } from './formato.mjs';
import { aplicarCuradoria, pessoa, coresDoJogo, deduzirFormacao, SLUGS, EQUIPAS_PT } from './importar-wikipedia.mjs';
import { problemasDaFormacao, linhasDaFormacao, PROFUNDIDADE } from '../public/js/formacao.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HiddenEleven/1.0 (jogo entre amigos)';
const pastaCache = join(raiz, '.cache', 'zerozero');
const fresco = process.argv.includes('--fresco');

async function pagina(id) {
  const ficheiro = join(pastaCache, `${id}.html`);
  if (!fresco && existsSync(ficheiro)) return readFileSync(ficheiro, 'utf8');
  const r = await fetch(`https://www.zerozero.pt/jogo.php?id=${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} na ficha ${id}`);
  const html = await r.text();
  mkdirSync(pastaCache, { recursive: true });
  writeFileSync(ficheiro, html);
  return html;
}

// --- FotMob (só para a formação e as posições; os nomes ficam os do zerozero, com acentos) ---
const pastaFotmob = join(raiz, '.cache', 'fotmob');

async function jogoFotmob(id) {
  const ficheiro = join(pastaFotmob, `${id}.json`);
  if (!fresco && existsSync(ficheiro)) return JSON.parse(readFileSync(ficheiro, 'utf8'));
  const r = await fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${id}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} no FotMob ${id}`);
  const texto = await r.text();
  mkdirSync(pastaFotmob, { recursive: true });
  writeFileSync(ficheiro, texto);
  return JSON.parse(texto);
}

const FORMACOES_FOTMOB = { '4-1-2-1-2': '4-4-2 losango' };

/**
 * Siglas para as linhas de campo (da defesa para o ataque; cada linha da direita para a esquerda).
 * A primeira linha é a defesa e a última o ataque; no meio, a linha a seguir à defesa com 1 ou 2 jogadores
 * são trincos e a linha antes do ataque com 1 ou 2 são médios ofensivos (com 3 e um só ponta: extremos e um 10).
 */
export function siglasDasLinhas(tamanhos) {
  const n = tamanhos.length;
  const meio = (k) => (k <= 3 ? Array(k).fill('MC') : ['MD', ...Array(k - 2).fill('MC'), 'ME']);
  return tamanhos.map((k, i) => {
    if (i === 0) return k === 4 ? ['DD', 'DC', 'DC', 'DE'] : k === 5 ? ['DD', 'DC', 'DC', 'DC', 'DE'] : Array(k).fill('DC');
    if (i === n - 1) return k === 3 ? ['ED', 'PL', 'EE'] : Array(k).fill('PL');
    if (n === 3) return meio(k);
    if (i === 1 && k <= 2) return Array(k).fill('MDC');
    if (i === n - 2 && k <= 2) return Array(k).fill('MO');
    if (i === n - 2 && k === 3 && tamanhos[n - 1] === 1) return ['ED', 'MO', 'EE'];
    return meio(k);
  });
}

/** { formacao, posicoes: Map(número → sigla), ordem: [números] } de uma equipa do FotMob. */
export function posicoesFotmob(equipa) {
  const [gr, ...campo] = [...equipa.starters].sort(
    (a, b) => a.horizontalLayout.x - b.horizontalLayout.x || a.positionId - b.positionId,
  );
  const tamanhos = String(equipa.formation ?? '').match(/\d/g)?.map(Number) ?? [];
  if (tamanhos.reduce((s, k) => s + k, 0) !== campo.length) throw new Error(`formação do FotMob "${equipa.formation}" não bate com o onze`);
  const posicoes = new Map([[Number(gr.shirtNumber), 'GR']]);
  const ordem = [Number(gr.shirtNumber)];
  const siglas = siglasDasLinhas(tamanhos);
  let k = 0;
  tamanhos.forEach((tam, i) => {
    const linha = campo.slice(k, k + tam).sort((a, b) => b.horizontalLayout.y - a.horizontalLayout.y);
    k += tam;
    linha.forEach((p, j) => {
      posicoes.set(Number(p.shirtNumber), siglas[i][j]);
      ordem.push(Number(p.shirtNumber));
    });
  });
  return { formacao: FORMACOES_FOTMOB[equipa.formation] ?? equipa.formation, posicoes, ordem };
}

// --- posições habituais (página de cada jogador no zerozero), para jogos sem FotMob ---
const ficheiroPosicoes = join(raiz, '.cache', 'zerozero', 'posicoes.json');
let posicoesEmCache = null;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const SUBPOSICOES = [
  [/guarda/i, 'GR'], [/(defesa|lateral) direito/i, 'DD'], [/(defesa|lateral) esquerdo/i, 'DE'], [/defesa/i, 'DC'],
  [/m[eé]dio defensivo|trinco/i, 'MDC'], [/m[eé]dio ofensivo|m[eé]dio atacante/i, 'MO'], [/m[eé]dio direito|ala direito/i, 'MD'],
  [/m[eé]dio esquerdo|ala esquerdo/i, 'ME'], [/m[eé]dio/i, 'MC'], [/extremo direito/i, 'ED'], [/extremo esquerdo/i, 'EE'],
  [/extremo/i, 'ED'], [/avan[cç]ado|ponta/i, 'PL'],
];

async function posicaoHabitual(perfil) {
  posicoesEmCache ??= existsSync(ficheiroPosicoes) ? JSON.parse(readFileSync(ficheiroPosicoes, 'utf8')) : {};
  if (!perfil) return null;
  if (!(perfil in posicoesEmCache)) {
    const r = await fetch(`https://www.zerozero.pt${perfil}`, { headers: { 'User-Agent': UA } });
    const html = r.ok ? await r.text() : '';
    posicoesEmCache[perfil] = html.match(/<img alt="([^"]+)" src="\/img\/subposicao\//)?.[1] ?? null;
    mkdirSync(dirname(ficheiroPosicoes), { recursive: true });
    writeFileSync(ficheiroPosicoes, JSON.stringify(posicoesEmCache, null, 1));
    await dorme(400);
  }
  const sub = posicoesEmCache[perfil];
  return SUBPOSICOES.find(([re]) => re.test(sub ?? ''))?.[1] ?? null;
}

const LADO = { DD: 0, MD: 0, ED: 0, DE: 2, ME: 2, EE: 2 };
/**
 * Onze (o primeiro é o guarda-redes) a partir das posições habituais. A formação é uma das habituais, escolhida
 * pelo número de defesas e de avançados (as posições habituais não dizem como a equipa jogou nesse dia).
 */
export function formacaoHabitual(gs) {
  const conta = (...ps) => gs.filter((g) => ps.includes(g)).length;
  // Só se usa nos dérbis anteriores ao FotMob (até 2010), todos com quatro defesas.
  const pontas = conta('PL');
  const extremos = conta('ED', 'EE');
  if (pontas >= 2) return conta('MDC') === 1 && conta('MO') === 1 && !conta('MD', 'ME') && !extremos ? '4-4-2 losango' : '4-4-2';
  if (extremos >= 2 && conta('MO') === 0) return '4-3-3';
  return '4-2-3-1';
}

export function posicoesHabituais(gerais) {
  const campo = gerais.slice(1).map((g, k) => ({ k: k + 1, g: g && g !== 'GR' ? g : 'MC' }));
  const formacao = formacaoHabitual(campo.map((x) => x.g));
  const tamanhos = linhasDaFormacao(formacao);
  const pos = ['GR', ...campo.map((x) => x.g)];
  const ordem = gerais.map((_, k) => k);
  if (tamanhos.reduce((s, n) => s + n, 0) !== campo.length) return { formacao, pos, ordem };
  const lado = (x) => LADO[x.g] ?? 1;
  campo.sort((a, b) => PROFUNDIDADE[a.g] - PROFUNDIDADE[b.g] || lado(a) - lado(b) || a.k - b.k);
  const siglas = siglasDasLinhas(tamanhos);
  let n = 0;
  let posicao = 1;
  tamanhos.forEach((tam, i) => {
    campo.slice(n, n + tam).sort((a, b) => lado(a) - lado(b) || a.k - b.k).forEach((x, j) => {
      pos[x.k] = siglas[i][j];
      ordem[x.k] = posicao++;
    });
    n += tam;
  });
  return { formacao, pos, ordem };
}

// --- texto ---
const MARCAS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧', ring: '̊' };
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', szlig: 'ß', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ' };
function entidade(nome) {
  const m = nome.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil|ring)$/);
  return m ? (m[1] + MARCAS[m[2]]).normalize('NFC') : ENTIDADES[nome];
}
export function texto(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => entidade(n) ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const minuto = (s) => (/^\d+$/.test(s) ? Number(s) : s);
// As nações do Reino Unido aparecem como imagem (flag_16_eng_30x20.png), não como "flag:XX".
const BANDEIRAS_IMAGEM = { eng: 'GB-ENG', sco: 'GB-SCT', wal: 'GB-WLS', nir: 'GB-NIR' };

// --- jogador (um bloco <div class="player ...">) ---
function lerJogador(bloco) {
  const ligacao = bloco.match(/<a href="\/(?:jogador|treinador)\/[^"]+"[^>]*>([\s\S]*?)<\/a>/);
  if (!ligacao) return null;
  const iso = bloco.match(/class="flag:([A-Z]{2})"/)?.[1] ?? BANDEIRAS_IMAGEM[bloco.match(/flag_\d+_([a-z]{3})_/)?.[1]] ?? null;
  // "Morten Hjulmand&nbsp;(C)" → sem a marca de capitão; "Eto´o" → "Eto'o".
  const nome = texto(ligacao[1]).replace(/\s*\(C\)$/, '').replace(/[´`’]/g, "'");
  const perfil = bloco.match(/<a href="(\/jogador\/[^"]+)"/)?.[1];
  const j = { nome, perfil, numero: Number(bloco.match(/<div class="number[^"]*"[^>]*>\s*(\d+)\s*</)?.[1]) || null, iso };
  const eventos = bloco.slice(bloco.indexOf('<div class="events">'));
  for (const [, atributos, icone, valor] of eventos.matchAll(/<span([^>]*)>([^<]*)<\/span>\s*<div>([^<]*)<\/div>/g)) {
    const titulo = atributos.match(/title="([^"]*)"/)?.[1] ?? '';
    if (titulo === 'Golos') {
      for (const [, m, nota] of valor.matchAll(/(\d{1,3}(?:\+\d{1,2})?)'\s*(\((?:g\.p\.|p\.b\.)\))?/g)) {
        const golo = { minuto: minuto(m) };
        if (nota === '(g.p.)') golo.penalti = true;
        if (nota === '(p.b.)') golo.autogolo = true;
        (j.golos ??= []).push(golo);
      }
    } else if (/icn_zerozero\b/.test(atributos) && (titulo === 'Entrou' || icone === '7')) {
      j.entrou = valor.match(/\d{1,3}(?:\+\d{1,2})?/)?.[0];
    } else if (/icn_zerozero\b/.test(atributos) && (titulo === 'Saiu' || icone === '8')) {
      j.saiu = valor.match(/\d{1,3}(?:\+\d{1,2})?/)?.[0];
    }
  }
  return j;
}

/** Formações: [{ titulo, colunas: [[jogador...], [jogador...]] }] (onzes, "Suplentes", "Treinadores"). */
function lerFormacoes(html) {
  const inicio = html.indexOf('id="game_report"');
  if (inicio < 0) throw new Error('A ficha não tem formações.');
  const fimTreinadores = html.indexOf('<div class="box">', html.indexOf('>Treinadores<', inicio));
  const zona = html.slice(inicio, fimTreinadores > 0 ? fimTreinadores : inicio + 80000);
  return zona
    .split('<div class="zz-tpl-row game_report')
    .slice(1)
    .map((linha) => {
      const colunas = linha.split('<div class="zz-tpl-col is-6').slice(1);
      return {
        titulo: texto(colunas[0]?.match(/<div class="subtitle">([\s\S]*?)<\/div>/)?.[1] ?? ''),
        colunas: colunas.map((c) => c.split('<div class="player').slice(1).map(lerJogador).filter(Boolean)),
      };
    });
}

/** "Liga Sagres 10/11", "bwin LIGA 06/07", "Carlsberg Cup 08/09"… → nome da prova em pt-PT. */
function competicaoPt(nome) {
  if (/ta[çc]a\s+(de\s+)?portugal/i.test(nome)) return 'Taça de Portugal';
  if (/carlsberg|ta[çc]a da liga|ta[çc]a ctt|allianz cup|bwin cup/i.test(nome)) return 'Taça da Liga';
  if (/superta[çc]a/i.test(nome)) return 'Supertaça';
  if (/liga|superliga|primeira/i.test(nome)) return 'Primeira Liga';
  return nome.replace(/\s+\d{2}\/\d{2}$/, '');
}
function fasePt(fase) {
  const f = fase.toLowerCase();
  if (/meias?-finais|meia-final/.test(f)) return 'Meia-final';
  if (/quartos/.test(f)) return 'Quartos de final';
  if (/oitavos|1\/8/.test(f)) return 'Oitavos de final';
  if (/^final$/.test(f)) return 'Final';
  return fase;
}

function lerCabecalho(html) {
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        // "name": "Benfica 1-3<span class="prol">(a.p.)</span> Sporting" — o HTML lá dentro estraga o JSON.
        return JSON.parse(m[1].replace(/<[^>]+>/g, ' '));
      } catch {
        return null;
      }
    })
    .find((o) => o?.['@type'] === 'SportsEvent');
  if (!ld) throw new Error('Sem dados estruturados do jogo.');
  const placar = ld.name.match(/\s(\d+)-(\d+)\s/);
  const url = html.match(/property="og:url" content="([^"]+)"/)?.[1] ?? '';
  const estadioBloco = html.slice(html.indexOf('id="stadium"'));
  const estadio = texto(estadioBloco.match(/<a href="\/estadio[^"]*">([\s\S]*?)<\/a>/)?.[1] ?? ld.location?.name ?? '');
  const cidade = texto(estadioBloco.match(/<div class="text">([\s\S]*?)<\/div>/)?.[1] ?? '');
  // "Fase<span>Meias-Finais</span>", "Jornada<span>Jornada 10</span>"; prolongamento e penáltis no cabeçalho.
  const info = (rotulo) => texto(html.match(new RegExp(`>${rotulo}<span[^>]*>([^<]*)</span>`))?.[1] ?? '');
  const jornada = info('Jornada').match(/\d+/)?.[0];
  const cabecalho = `${ld.name} ${texto(html.slice(html.indexOf('match-header'), html.indexOf('match-header-info')))}`;
  const penaltis = cabecalho.match(/(\d+)\s*-\s*(\d+)\s*g\.p\./) ?? cabecalho.match(/g\.p\.\s*(\d+)\s*-\s*(\d+)/);
  return {
    casa: texto(ld.homeTeam.name),
    fora: texto(ld.awayTeam.name),
    competicao: competicaoPt(texto(ld.organizer?.name ?? '')),
    fase: jornada ? `${jornada}.ª jornada` : fasePt(info('Fase')),
    extra: penaltis ? ` (${penaltis[1]}–${penaltis[2]} g.p.)` : /\ba\.p\./.test(cabecalho) ? ' (a.p.)' : '',
    golos: placar ? [placar[1], placar[2]] : null,
    data: url.match(/\/jogo\/(\d{4}-\d{2}-\d{2})-/)?.[1] ?? ld.startDate.slice(0, 10),
    estadio: [estadio, cidade].filter(Boolean).join(', '),
    url,
  };
}

function montarEquipa(onze, banco, treinador, nome, slug, cor) {
  const usados = banco.filter((j) => j.entrou);
  const pais = (j) => (j.iso ? paraCodigoJson(j.iso.toLowerCase()) : null);
  const extra = (j) => (j.golos ? { golos: j.golos } : {});
  return {
    nome,
    ...(slug ? { slug } : {}),
    ...(cor ? { cor } : {}),
    formacao: '?',
    treinador: pessoa(treinador ?? { nome: '?' }),
    onze: onze.map((j) => pessoa(j, { numero: j.numero, pais: pais(j), pos: '?', ...extra(j) })),
    suplentes: usados.map((j) => pessoa(j, { numero: j.numero, minuto: minuto(j.entrou), pais: pais(j), ...extra(j) })),
    nao_utilizados: banco
      .filter((j) => !j.entrou)
      .map((j) => {
        const p = pessoa(j);
        return p.aceites ? p : p.nome;
      }),
  };
}

export async function importar(entrada) {
  const html = await pagina(entrada.zerozero);
  const cab = lerCabecalho(html);
  const linhas = lerFormacoes(html);
  const titular = linhas.find((l) => !/^(Suplentes|Treinadores)$/.test(l.titulo));
  const suplentes = linhas.find((l) => l.titulo === 'Suplentes');
  const treinadores = linhas.find((l) => l.titulo === 'Treinadores');
  if (!titular || titular.colunas.length !== 2 || titular.colunas.some((c) => c.length !== 11)) {
    throw new Error(`Onzes incompletos (${titular?.colunas.map((c) => c.length).join(' + ') ?? 'nenhum'}).`);
  }
  const nomes = [cab.casa, cab.fora].map((n) => EQUIPAS_PT[n] ?? n);
  const slugs = nomes.map((n, i) => (entrada.slugs?.[i] !== undefined ? entrada.slugs[i] : SLUGS[n] ?? ''));
  const modos = [...new Set([...entrada.modos, ...slugs.filter(Boolean).map((s) => `equipa:${s}`)])];
  const cores = coresDoJogo(nomes);
  const resultado = cab.golos ? `${nomes[0]} ${cab.golos[0]}–${cab.golos[1]} ${nomes[1]}` : `${nomes[0]} – ${nomes[1]}`;
  const equipas = [0, 1].map((i) =>
    montarEquipa(titular.colunas[i], suplentes?.colunas[i] ?? [], treinadores?.colunas[i]?.[0], nomes[i], slugs[i], cores[i]),
  );
  const fm = entrada.fotmob ? (await jogoFotmob(entrada.fotmob)).content?.lineup ?? null : null;
  for (const [i, e] of equipas.entries()) {
    const perfis = titular.colunas[i].map((j) => j.perfil);
    // Os dados antigos do FotMob às vezes encaixam os jogadores na formação pela ordem (ex.: Benfica 2010 em 5-3-2);
    // até 2013/14 confirmam-se com as posições habituais de cada jogador no zerozero.
    let escolha = null;
    const t = i === 0 ? fm?.homeTeam : fm?.awayTeam;
    if (t?.starters?.length === 11) {
      const { formacao, posicoes, ordem } = posicoesFotmob(t);
      const semPar = e.onze.filter((p) => !posicoes.has(p.numero)).map((p) => `${p.nome} #${p.numero}`);
      if (semPar.length) console.log(`   · ${e.nome}: números diferentes no FotMob (${semPar.join(', ')}); uso as posições habituais`);
      else escolha = { formacao, pos: e.onze.map((p) => posicoes.get(p.numero)), ordem: e.onze.map((p) => ordem.indexOf(p.numero)) };
    }
    if (!escolha || (fm && cab.data < '2014-07-01')) {
      const gerais = [];
      for (const perfil of perfis) gerais.push(await posicaoHabitual(perfil));
      const habitual = posicoesHabituais(gerais);
      const grupo = (s) => (/^D/.test(s) ? 'D' : /^(ED|EE|PL)$/.test(s) ? 'A' : s === 'GR' ? 'G' : 'M');
      const diferencas = escolha ? escolha.pos.filter((s, k) => grupo(s) !== grupo(habitual.pos[k])).length : 99;
      if (diferencas >= 3) {
        if (escolha) console.log(`   · ${e.nome}: FotMob (${escolha.formacao}) não bate com as posições habituais; uso ${habitual.formacao}`);
        escolha = habitual;
      }
    }
    if (!escolha) continue;
    e.formacao = escolha.formacao;
    e.onze.forEach((p, k) => (p.pos = escolha.pos[k]));
    const ordem = new Map(e.onze.map((p, k) => [p, escolha.ordem[k]]));
    e.onze.sort((a, b) => ordem.get(a) - ordem.get(b));
  }
  const fase = entrada.fase ?? cab.fase;
  return {
    id: entrada.id,
    modos,
    competicao: entrada.competicao ?? cab.competicao,
    ...(fase ? { fase } : {}),
    ...(entrada.titulo ? { titulo: entrada.titulo } : {}),
    data: cab.data,
    estadio: entrada.estadio ?? cab.estadio,
    resultado: entrada.resultado ?? resultado + cab.extra,
    fonte: cab.url,
    equipas,
  };
}

async function principal() {
  const args = process.argv.slice(2);
  const forcar = args.includes('--forcar');
  const mostrar = args.includes('--mostrar');
  const fontes = JSON.parse(readFileSync(join(raiz, 'scripts', 'fontes.json'), 'utf8'));
  const curadoria = JSON.parse(readFileSync(join(raiz, 'scripts', 'curadoria.json'), 'utf8'));
  const ids = args.includes('--todos') ? fontes.filter((f) => f.zerozero).map((f) => f.id) : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.log('Uso: node scripts/importar-zerozero.mjs <id>|--todos [--forcar] [--mostrar] [--fresco]');
    process.exit(1);
  }
  let falhas = 0;
  for (const id of ids) {
    const entrada = fontes.find((f) => f.id === id);
    if (!entrada?.zerozero) { console.error(`✗ ${id}: sem "zerozero" em scripts/fontes.json`); falhas++; continue; }
    const destino = join(raiz, 'data', 'jogos', `${id}.json`);
    if (existsSync(destino) && !forcar && !mostrar) { console.log(`· ${id}: já existe (usa --forcar para reescrever)`); continue; }
    try {
      const jogo = aplicarCuradoria(await importar(entrada), curadoria[id]);
      const semPosicoes = jogo.equipas.filter((e) => e.formacao === '?' || e.onze.some((p) => p.pos === '?'));
      if (semPosicoes.length) {
        // Sem posições não há jogo: mostra os onzes para escrever a curadoria (ou indicar o jogo no FotMob).
        for (const e of semPosicoes) console.log(`  ${e.nome}: ${e.onze.map((p) => `${p.nome} #${p.numero}`).join(' | ')}`);
        throw new Error('faltam posições: indica "fotmob" em scripts/fontes.json ou o "onze" e a "formacao" em scripts/curadoria.json');
      }
      const json = formatarJogo(jogo);
      if (mostrar) console.log(json);
      else writeFileSync(destino, json);
      const resumo = jogo.equipas.map((e) => `${e.nome} ${e.formacao} (${e.onze.length}+${e.suplentes.length}, banco ${e.nao_utilizados.length})`).join(' vs ');
      console.log(`✓ ${id}: ${resumo}`);
      for (const e of jogo.equipas) {
        for (const p of problemasDaFormacao(e.onze, e.formacao)) console.log(`   ⚠ ${e.nome}: ${p}`);
      }
    } catch (e) {
      console.error(`✗ ${id}: ${e.message}`);
      falhas++;
    }
  }
  process.exit(falhas ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
