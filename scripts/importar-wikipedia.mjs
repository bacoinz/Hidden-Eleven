// Importa um jogo a partir do wikitext bruto da Wikipédia e escreve um rascunho em data/jogos/<id>.json.
// O rascunho tem de ser revisto à mão (formação, nomes em pt-PT, alcunhas) e passar no validador.
//
// Uso:
//   node scripts/importar-wikipedia.mjs <id>            importa a entrada <id> de scripts/fontes.json
//   node scripts/importar-wikipedia.mjs --todos         importa todas as entradas sem ficheiro
//   opções: --forcar (reescreve o ficheiro), --mostrar (só imprime, não escreve), --fresco (ignora a cache)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paraIso, paraCodigoJson } from './paises.mjs';
import { alcunhasDe } from './alcunhas.mjs';
import { formatarJogo } from './formato.mjs';
import { normalizar } from '../src/nomes.js';
import { problemasDaFormacao } from '../public/js/formacao.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'HiddenEleven/1.0 (jogo entre amigos; importação de onzes)';

const POSICOES = {
  GK: 'GR', RB: 'DD', RWB: 'DD', CB: 'DC', SW: 'DC', LB: 'DE', LWB: 'DE',
  DM: 'MDC', CM: 'MC', RM: 'MD', LM: 'ME', AM: 'MO', RW: 'ED', LW: 'EE',
  RF: 'PL', LF: 'PL', CF: 'PL', ST: 'PL', SS: 'PL', FW: 'PL',
};

// Nomes de equipas e cidades em pt-PT (o que não estiver aqui fica como vem e é revisto à mão).
export const EQUIPAS_PT = {
  Monaco: 'Mónaco', Porto: 'FC Porto', 'Bayern Munich': 'Bayern Munique', 'Bayern München': 'Bayern Munique', 'Newcastle United': 'Newcastle', Germany: 'Alemanha', Spain: 'Espanha',
  France: 'França', Italy: 'Itália', Netherlands: 'Holanda', England: 'Inglaterra', Portugal: 'Portugal',
  Brazil: 'Brasil', Argentina: 'Argentina', Croatia: 'Croácia', Greece: 'Grécia', 'Manchester United': 'Manchester United',
  'Manchester City': 'Manchester City', Chelsea: 'Chelsea', Liverpool: 'Liverpool', Arsenal: 'Arsenal',
  'Real Madrid': 'Real Madrid', Barcelona: 'Barcelona', 'Atlético Madrid': 'Atlético de Madrid', Juventus: 'Juventus',
  'AC Milan': 'Milan', Milan: 'Milan', 'Inter Milan': 'Inter', Internazionale: 'Inter', Valencia: 'Valência',
  'Bayer Leverkusen': 'Bayer Leverkusen', 'Borussia Dortmund': 'Borussia Dortmund', 'Paris Saint-Germain': 'Paris Saint-Germain',
  'Tottenham Hotspur': 'Tottenham', Benfica: 'Benfica', Sporting: 'Sporting', 'Sporting CP': 'Sporting', Braga: 'SC Braga',
  'CSKA Moscow': 'CSKA Moscovo', Sevilla: 'Sevilha', Celtic: 'Celtic', 'Queens Park Rangers': 'QPR',
};
// Seleções em pt-PT pelo código da bandeira (as caixas das seleções só têm {{fb|POR}}).
const SELECOES_PT = {
  pt: 'Portugal', es: 'Espanha', fr: 'França', it: 'Itália', de: 'Alemanha', nl: 'Holanda', 'gb-eng': 'Inglaterra',
  br: 'Brasil', ar: 'Argentina', hr: 'Croácia', gr: 'Grécia', se: 'Suécia', au: 'Austrália', ch: 'Suíça', cz: 'Chéquia',
  dk: 'Dinamarca', be: 'Bélgica', uy: 'Uruguai', mx: 'México', us: 'Estados Unidos', jp: 'Japão', kr: 'Coreia do Sul',
  ru: 'Rússia', tr: 'Turquia', pl: 'Polónia', ua: 'Ucrânia', no: 'Noruega', ma: 'Marrocos', gh: 'Gana', ng: 'Nigéria',
  cm: 'Camarões', sn: 'Senegal', ci: 'Costa do Marfim', co: 'Colômbia', cl: 'Chile', is: 'Islândia', 'gb-wls': 'País de Gales',
  'gb-sct': 'Escócia', ie: 'Irlanda', at: 'Áustria', hu: 'Hungria', ro: 'Roménia', rs: 'Sérvia', sk: 'Eslováquia',
  si: 'Eslovénia', ec: 'Equador', py: 'Paraguai', pe: 'Peru', cr: 'Costa Rica', sa: 'Arábia Saudita', ir: 'Irão',
  qa: 'Catar', ca: 'Canadá', tn: 'Tunísia', dz: 'Argélia', eg: 'Egito', fi: 'Finlândia', ge: 'Geórgia', al: 'Albânia',
  kp: 'Coreia do Norte', ao: 'Angola', uz: 'Usbequistão', cd: 'RD Congo',
};

// Equipas da Equipa Mítica (nome em pt-PT → slug de data/equipas.json).
export const SLUGS = {
  'Real Madrid': 'real-madrid', Barcelona: 'barcelona', 'Manchester United': 'man-utd', 'Manchester City': 'man-city',
  Liverpool: 'liverpool', Chelsea: 'chelsea', Arsenal: 'arsenal', Tottenham: 'tottenham', 'Bayern Munique': 'bayern',
  'Borussia Dortmund': 'dortmund', Juventus: 'juventus', Milan: 'milan', Inter: 'inter', 'Atlético de Madrid': 'atletico',
  'Valência': 'valencia', 'Paris Saint-Germain': 'psg', Benfica: 'benfica', 'FC Porto': 'porto', Sporting: 'sporting',
  Portugal: 'portugal', Espanha: 'espanha', 'França': 'franca', 'Itália': 'italia', Alemanha: 'alemanha',
  Inglaterra: 'inglaterra', Holanda: 'holanda', Argentina: 'argentina', Brasil: 'brasil', 'Croácia': 'croacia', 'Grécia': 'grecia',
};

// Cor principal do equipamento (para as camisolas). Ajustável por jogo em curadoria.json.
const CORES = {
  'Real Madrid': '#f4f4f4', Barcelona: '#a50044', 'Manchester United': '#da291c', 'Manchester City': '#6cabdd',
  Liverpool: '#c8102e', Chelsea: '#034694', Arsenal: '#ef0107', Tottenham: '#f4f4f4', 'Bayern Munique': '#dc052d',
  'Borussia Dortmund': '#fde100', Juventus: '#1a1a1a', Milan: '#d4021d', Inter: '#0068a8', 'Atlético de Madrid': '#cb3524',
  'Valência': '#f4f4f4', 'Paris Saint-Germain': '#004170', 'Bayer Leverkusen': '#e32221', 'Mónaco': '#e2001a',
  'FC Porto': '#0047ab', Benfica: '#e30613', Sporting: '#008057', 'SC Braga': '#e30613', Celtic: '#018749',
  'CSKA Moscovo': '#c8102e', Sevilha: '#f4f4f4', QPR: '#1d5ba4', Portugal: '#c8102e', 'França': '#1e3a8a',
  Espanha: '#c60b1e', 'Itália': '#0066cc', Alemanha: '#f4f4f4', Inglaterra: '#f4f4f4', Holanda: '#f36c21',
  Argentina: '#75aadb', Brasil: '#ffdf00', 'Croácia': '#e5242a', 'Grécia': '#0d5eaf', 'Suíça': '#d52b1e',
};

/** Cores das duas equipas; se forem parecidas, a segunda passa a branco (ou escuro, se a primeira já for clara). */
export function coresDoJogo(nomes) {
  const cores = nomes.map((n) => CORES[n] ?? null);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (cores[0] && cores[1]) {
    const [a, b] = [rgb(cores[0]), rgb(cores[1])];
    const distancia = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (distancia < 90) cores[1] = a.reduce((s, x) => s + x, 0) / 3 > 180 ? '#1f2937' : '#f4f4f4';
  }
  return cores;
}

const CIDADES_PT = {
  Munich: 'Munique', Moscow: 'Moscovo', Rome: 'Roma', Milan: 'Milão', Lisbon: 'Lisboa', Seville: 'Sevilha',
  Turin: 'Turim', London: 'Londres', Athens: 'Atenas', Berlin: 'Berlim', Vienna: 'Viena', Istanbul: 'Istambul',
  Basel: 'Basileia', Amsterdam: 'Amesterdão', Budapest: 'Budapeste', Johannesburg: 'Joanesburgo', Brussels: 'Bruxelas',
  Warsaw: 'Varsóvia', Rotterdam: 'Roterdão', Bucharest: 'Bucareste', Nuremberg: 'Nuremberga', Glasgow: 'Glasgow',
  Kyiv: 'Kiev', Kiev: 'Kiev', 'Saint-Denis': 'Saint-Denis', Yokohama: 'Yokohama', Cardiff: 'Cardiff',
};

// As páginas descarregadas ficam em .cache/wikipedia para que rever a curadoria não volte a pedir tudo.
// Usa --fresco para ignorar a cache.
const pastaCache = join(raiz, '.cache', 'wikipedia');
const fresco = process.argv.includes('--fresco');

// Estádios com nome traduzível (os nomes próprios ficam como estão).
const ESTADIOS_PT = {
  'Wembley Stadium': 'Estádio de Wembley', Olympiastadion: 'Estádio Olímpico', 'Olympic Stadium': 'Estádio Olímpico',
  'Stadio Olimpico': 'Estádio Olímpico', 'NSC Olimpiyskiy': 'Estádio Olímpico', 'Atatürk Olympic Stadium': 'Estádio Olímpico Atatürk',
  'Luzhniki Stadium': 'Estádio Luzhniki', 'Maracanã Stadium': 'Estádio do Maracanã', 'International Stadium': 'Estádio Internacional',
  'Fisht Olympic Stadium': 'Estádio Olímpico Fisht', 'Lusail Stadium': 'Estádio de Lusail', 'Estadio Metropolitano': 'Estádio Metropolitano',
  'Stadio San Siro': 'San Siro', 'City of Manchester Stadium': 'Etihad Stadium', 'Munich Football Arena': 'Allianz Arena',
  'Estadio Olímpico de Sevilla': 'Estádio Olímpico', 'Ernst-Happel-Stadion': 'Estádio Ernst Happel',
};

async function wikitext(lingua, titulo, saltos = 0) {
  const url = `https://${lingua}.wikipedia.org/w/index.php?title=${encodeURIComponent(titulo.replace(/ /g, '_'))}&action=raw`;
  const ficheiroCache = join(pastaCache, `${lingua}-${titulo.replace(/[^\p{L}\p{N}]+/gu, '_')}.txt`);
  let texto;
  if (!fresco && existsSync(ficheiroCache)) texto = readFileSync(ficheiroCache, 'utf8');
  else {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    texto = await r.text();
    mkdirSync(pastaCache, { recursive: true });
    writeFileSync(ficheiroCache, texto);
  }
  const redirect = texto.match(/^#REDIRECT\s*\[\[([^\]#|]+)/i);
  if (redirect && saltos < 3) return wikitext(lingua, redirect[1], saltos + 1);
  return { texto, url: `https://${lingua}.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, '_'))}` };
}

// --- utilitários de wikitext ---
const semRefs = (s) => s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
function textoDeLigacao(s) {
  // [[Alvo|Texto]] → Texto ; [[Alvo]] → Alvo (sem "(footballer...)").
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, alvo) => alvo.replace(/\s*\([^)]*\)\s*$/, ''));
}
function limpar(s) {
  return textoDeLigacao(semRefs(s))
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// [[Cédric Soares|Cédric]] → "Cédric Soares" (título do artigo, sem desambiguação).
const alvoDeLigacao = (ligacao) => ligacao.replace(/^\[\[([^\]|]+).*$/, '$1').replace(/\s*\([^)]*\)\s*$/, '').trim();

function campoDaCaixa(caixa, nome) {
  const m = caixa.match(new RegExp(`\\|\\s*${nome}\\s*=([^\\n]*)`));
  return m ? m[1].trim() : '';
}
function bandeira(s) {
  const m =
    s.match(/\{\{\s*(?:flagicon|flag icon|fbaicon|flagdeco)\s*\|\s*([^|}]+)/i) ||
    s.match(/\{\{#invoke:flagg\|[^}]*?\|([A-Z]{3})\}\}/) ||
    s.match(/\{\{#invoke:flag\|[^|}]*\|([^|}]+)/i) ||
    s.match(/\{\{\s*(?:fb|fb-rt|fbu|fb-rt-u)\s*\|\s*([A-Z]{3})/);
  return m ? paraIso(m[1]) : null;
}
const minuto = (s) => {
  const v = s.trim().replace(/[′']/g, '');
  return /^\d+$/.test(v) ? Number(v) : v;
};

function dataDaCaixa(caixa) {
  const d = campoDaCaixa(caixa, 'date');
  const m = d.match(/(\d{4})\|(\d{1,2})\|(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // Texto: "20 April 2011" ou "April 20, 2011" (sem passar por Date, que mudaria o dia com o fuso horário).
  const texto = limpar(d);
  const t = texto.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/) ?? texto.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!t) return '';
  const [dia, nomeMes] = /^\d/.test(t[1]) ? [t[1], t[2]] : [t[2], t[1]];
  const mes = MESES_EN.indexOf(nomeMes.slice(0, 3).toLowerCase()) + 1;
  return mes ? `${t[3]}-${String(mes).padStart(2, '0')}-${dia.padStart(2, '0')}` : '';
}
const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function nomeEquipa(campo) {
  const nome = limpar(campo.replace(/\{\{#invoke:flagg?\|[^}]*\}\}/g, '').replace(/\{\{\s*(?:fbaicon|flagicon)[^}]*\}\}/gi, ''));
  if (nome) return nome;
  // Seleções: {{fb-rt|ESP}} / {{#invoke:flag|fb|ARG}}
  const iso = bandeira(campo);
  return SELECOES_PT[iso] ?? campo;
}

// --- parse do bloco do jogo ---
function encontrarCaixa(texto, procurar) {
  const caixas = [];
  const re = /\{\{\s*(?:#invoke:\s*football\s*box\s*\|\s*main|football\s*box|footballbox)/gi;
  let m;
  while ((m = re.exec(texto))) {
    // Fecha a caixa contando chavetas.
    let nivel = 0;
    let i = m.index;
    for (; i < texto.length; i++) {
      if (texto.startsWith('{{', i)) { nivel++; i++; }
      else if (texto.startsWith('}}', i)) { nivel--; i++; if (nivel === 0) break; }
    }
    caixas.push({ inicio: m.index, fim: i + 1, caixa: texto.slice(m.index, i + 1) });
  }
  if (!caixas.length) throw new Error('Não encontrei nenhuma {{Football box}}.');
  if (!procurar?.length) return caixas.find((c) => /\n\s*\|\s*GK\s*\|\|/.test(texto.slice(c.fim, c.fim + 20000))) ?? caixas[0];
  // Procura pelo nome ou pelo código FIFA ({{fb|POR}}).
  const CODIGOS = { Portugal: 'POR', Netherlands: 'NED', England: 'ENG', Germany: 'GER', Italy: 'ITA', Spain: 'ESP', Brazil: 'BRA', France: 'FRA', Argentina: 'ARG', Greece: 'GRE', Croatia: 'CRO', Switzerland: 'SUI' };
  const equipasDaCaixa = (c) => `${campoDaCaixa(c.caixa, 'team1')} ${campoDaCaixa(c.caixa, 'team2')}`;
  const tem = (c, p) => {
    const t = equipasDaCaixa(c);
    return t.includes(p) || Boolean(CODIGOS[p] && new RegExp(`\\b${CODIGOS[p]}\\b`).test(t));
  };
  const alvo = caixas.find((c) => procurar.every((p) => tem(c, p)));
  if (!alvo) throw new Error(`Nenhuma caixa com ${procurar.join(' e ')}.`);
  return alvo;
}

function lerOnzes(texto, desde) {
  const linhas = texto.slice(desde).split('\n');
  const equipas = [];
  let atual = { onze: [], banco: [], treinador: null };
  let seccao = 'onze';
  for (const linha of linhas) {
    if (equipas.length === 2) break;
    if (/\{\{\s*(?:#invoke:\s*football\s*box|football\s*box|footballbox)/i.test(linha) && (atual.onze.length || equipas.length)) break;
    // "'''Substitutes:'''" ou, em alguns artigos, "|colspan=3|'''Substitutes'''".
    if (/Substitutes:|Substitutions:|^\|.*'''\s*Substitut(?:es|ions)\s*'''/i.test(linha)) { seccao = 'banco'; continue; }
    if (/(Managers?|Head coach(es)?|Coach(es)?):|^\|.*'''\s*(?:Managers?|Head coach(?:es)?|Coach(?:es)?)\s*'''/i.test(linha)) { seccao = 'treinador'; continue; }
    if (seccao === 'treinador' && /\[\[/.test(linha)) {
      const ligacaoTreinador = linha.match(/\[\[[^\]]+\]\]/)?.[0];
      atual.treinador = {
        // "|colspan=3|{{flagicon|ESP}} [[Roberto Martínez]] || {{yel|110}}": o cartão fica de fora; "Sir" também.
        nome: limpar(linha.replace(/^\|[^|]*\|/, '').split('||')[0]).replace(/^Sir\s+/, ''),
        alvo: ligacaoTreinador ? alvoDeLigacao(ligacaoTreinador) : undefined,
        iso: bandeira(linha),
      };
      equipas.push(atual);
      atual = { onze: [], banco: [], treinador: null };
      seccao = 'onze';
      continue;
    }
    // "|CB ||…" ou "|{{abbr|MF|Midfielder}} ||…"
    const m =
      linha.match(/^\|\s*\{\{\s*abbr\s*\|\s*([A-Z]{2,3})\s*\|[^}]*\}\}\s*\|\|(.*)$/) || linha.match(/^\|\s*([A-Z]{2,3})\s*\|\|(.*)$/);
    if (!m) continue;
    const resto = m[2];
    const numero = resto.match(/'''\s*(\d+)\s*'''/)?.[1];
    const ligacao = [...resto.matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[0]).find((l) => !/Captain|\|c\]\]/i.test(l));
    if (!ligacao) continue;
    const jogador = {
      posWiki: m[1],
      numero: numero ? Number(numero) : null,
      nome: limpar(ligacao),
      alvo: alvoDeLigacao(ligacao),
      iso: bandeira(resto),
      saiu: resto.match(/\{\{\s*sub\s*off\s*\|\s*([^}|]+)/i)?.[1],
      entrou: resto.match(/\{\{\s*sub\s*on\s*\|\s*([^}|]+)/i)?.[1],
    };
    (seccao === 'banco' ? atual.banco : atual.onze).push(jogador);
  }
  return equipas;
}

// --- golos (campos goals1/goals2 da Football box; o desempate por penáltis fica de fora) ---
function lerGolos(caixa, campo) {
  const linhas = caixa.split('\n');
  const inicio = linhas.findIndex((l) => new RegExp(`^\\|\\s*${campo}\\s*=`).test(l));
  if (inicio < 0) return [];
  const golos = [];
  const segmentos = [];
  for (let k = inicio; k < linhas.length; k++) {
    const linha = k === inicio ? linhas[k].replace(/^\|[^=]*=/, '') : linhas[k];
    if (k > inicio && /^\s*\|/.test(linha)) break; // começou outro campo
    // Vários marcadores na mesma linha: "[[A]] {{goal|22}}<br />[[B]] {{goal|28}}".
    segmentos.push(...semRefs(linha).split(/<br\s*\/?>/i));
  }
  for (const linha of segmentos) {
    const ligacao = linha.match(/\[\[[^\]]+\]\]/)?.[0];
    if (!ligacao) continue;
    for (const g of linha.matchAll(/\{\{\s*(?:goal|golden\s*goal|goldengoal|silver\s*goal|silvergoal)\s*\|([^}]*)\}\}/gi)) {
      const minutos = [];
      for (const p of g[1].split('|').map((x) => x.trim())) {
        if (/^\d{1,3}(\+\d{1,2})?$/.test(p)) minutos.push({ minuto: minuto(p) });
        else if (/^(pen\.?|p)$/i.test(p) && minutos.length) minutos.at(-1).penalti = true;
        else if (/^(o\.?g\.?)$/i.test(p) && minutos.length) minutos.at(-1).autogolo = true;
      }
      if (minutos.length) golos.push({ nome: limpar(ligacao), alvo: alvoDeLigacao(ligacao), minutos });
    }
    // Sem {{goal}}: minutos em texto ("[[Ferran Torres|Torres]] 106'", "23' (pen.)").
    if (!/\{\{\s*(?:goal|golden\s*goal|goldengoal|silver\s*goal|silvergoal)\s*\|/i.test(linha)) {
      const minutos = [...linha.replace(/\[\[[^\]]+\]\]/g, '').matchAll(/(\d{1,3}(?:\+\d{1,2})?)\s*['′]\s*(\((?:pen|p|o\.?\s*g)\.?\))?/gi)].map((x) => {
        const golo = { minuto: minuto(x[1]) };
        if (x[2] && /pen|\(p/i.test(x[2])) golo.penalti = true;
        if (x[2] && /o\.?\s*g/i.test(x[2])) golo.autogolo = true;
        return golo;
      });
      if (minutos.length) golos.push({ nome: limpar(ligacao), alvo: alvoDeLigacao(ligacao), minutos });
    }
  }
  return golos;
}

/** Junta cada golo ao jogador (nos autogolos, o marcador é da outra equipa). */
function atribuirGolos(onzes, golosPorEquipa) {
  const avisos = [];
  const chaves = (j) => [normalizar(j.nome), normalizar(j.alvo ?? '')].filter(Boolean);
  golosPorEquipa.forEach((golos, equipa) => {
    for (const g of golos) {
      for (const m of g.minutos) {
        const alvoEquipa = m.autogolo ? 1 - equipa : equipa;
        const candidatos = [...onzes[alvoEquipa].onze, ...onzes[alvoEquipa].banco];
        const alvos = [normalizar(g.alvo), normalizar(g.nome)];
        let jogador = candidatos.find((j) => chaves(j).some((c) => alvos.includes(c)));
        if (!jogador) {
          // Pelo apelido, se for único.
          const apelido = normalizar(g.nome).split(' ').pop();
          const porApelido = candidatos.filter((j) => chaves(j).some((c) => c.split(' ').pop() === apelido));
          if (porApelido.length === 1) [jogador] = porApelido;
        }
        if (!jogador) {
          avisos.push(`golo de ${g.nome} (${m.minuto}') sem jogador correspondente`);
          continue;
        }
        const golo = { minuto: m.minuto };
        if (m.penalti) golo.penalti = true;
        if (m.autogolo) golo.autogolo = true;
        (jogador.golos ??= []).push(golo);
      }
    }
  });
  return avisos;
}

// --- posições e formação ---
function mapearPosicoes(onze) {
  const nCB = onze.filter((j) => j.posWiki === 'CB' || j.posWiki === 'SW').length;
  const temCF = onze.some((j) => ['CF', 'ST'].includes(j.posWiki));
  return onze.map((j) => {
    let pos = POSICOES[j.posWiki] ?? 'PL';
    if (nCB === 3 && j.posWiki === 'RWB') pos = 'MD';
    if (nCB === 3 && j.posWiki === 'LWB') pos = 'ME';
    if (temCF && j.posWiki === 'RF') pos = 'ED';
    if (temCF && j.posWiki === 'LF') pos = 'EE';
    return { ...j, pos };
  });
}

// Nomes habituais para as linhas deduzidas das posições (o trinco junta-se aos médios quando é assim que se diz).
const CANONICAS = {
  '4-1-2-1-2': '4-4-2 losango', '4-1-2-3': '4-3-3', '4-2-1-3': '4-2-3-1', '3-1-4-2': '3-5-2', '5-1-2-2': '5-3-2',
  '4-1-3-2': '4-4-2 losango', '4-1-3-1-1': '4-4-1-1', '4-2-2-1-1': '4-4-1-1', '4-1-1-3-1': '4-2-3-1', '4-2-4': '4-4-2',
  '3-1-2-3-1': '3-4-3 losango',
};
export function deduzirFormacao(onze) {
  const conta = (...ps) => onze.filter((j) => ps.includes(j.pos)).length;
  const D = conta('DD', 'DC', 'DE');
  const MDC = conta('MDC');
  const MID = conta('MD', 'MC', 'ME');
  const MO = conta('MO');
  const W = conta('ED', 'EE');
  const PL = conta('PL');
  const linhas = [D];
  if (MDC) linhas.push(MDC);
  if (MID) linhas.push(MID);
  if (MO && W) linhas.push(MO + W);
  else if (MO) linhas.push(MO);
  if (W && !MO) linhas.push(W + PL);
  else if (PL) linhas.push(PL);
  const f = linhas.filter(Boolean).join('-');
  return CANONICAS[f] ?? f;
}

// --- convocados (seleções): a Wikipédia só lista as substituições feitas ---
async function lerPlantel(plantel) {
  const { texto } = await wikitext(plantel.lingua ?? 'en', plantel.artigo);
  return plantel.seccoes.map((seccao) => {
    const titulo = texto.search(new RegExp(`^==+\\s*${seccao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*==+\\s*$`, 'm'));
    if (titulo < 0) throw new Error(`Secção "${seccao}" não encontrada em ${plantel.artigo}.`);
    const resto = texto.slice(titulo).split('\n').slice(1);
    const fim = resto.findIndex((l) => /^==/.test(l));
    const linhas = resto.slice(0, fim < 0 ? undefined : fim);
    const jogadores = [];
    for (const l of linhas) {
      const campo = l.match(/\|\s*name\s*=\s*(\{\{[^}]*\}\}|\[\[[^\]]*\]\]|[^|}]*)/)?.[1];
      if (!campo || !/(nat fs (g )?player|national football squad player)/i.test(l)) continue;
      let nome;
      const sortname = campo.match(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)/i);
      const sort = campo.match(/\{\{\s*sort\s*\|[^|]*\|(.*)\}\}$/i);
      if (sortname) nome = [sortname[1], sortname[2]].map((x) => x.trim()).filter(Boolean).join(' ');
      else if (sort) nome = limpar(sort[1]);
      else nome = limpar(campo);
      const ligacao = campo.match(/\[\[[^\]]+\]\]/)?.[0];
      const numero = l.match(/\|\s*no\s*=\s*(\d+)/)?.[1];
      jogadores.push({ nome, alvo: ligacao ? alvoDeLigacao(ligacao) : nome, numero: numero ? Number(numero) : null });
    }
    if (!jogadores.length) throw new Error(`Sem jogadores na secção "${seccao}".`);
    return jogadores;
  });
}

/** Atribui a cada equipa a lista de convocados com mais nomes em comum com quem jogou. */
function atribuirPlanteis(onzes, planteis) {
  const chaves = (lista) => new Set(lista.flatMap((j) => [normalizar(j.nome), normalizar(j.alvo ?? '')]).filter(Boolean));
  return onzes.map((bruta) => {
    const jogaram = chaves([...bruta.onze, ...bruta.banco]);
    let melhor = null;
    let pontos = 0;
    for (const p of planteis) {
      const comuns = [...chaves(p)].filter((k) => jogaram.has(k)).length;
      if (comuns > pontos) {
        pontos = comuns;
        melhor = p;
      }
    }
    if (pontos < 8) throw new Error('Não consegui associar os convocados às equipas.');
    return melhor;
  });
}

// --- montagem do JSON ---
export function pessoa(j, extra = {}) {
  const aceites = new Set([...alcunhasDe(j.nome), ...(j.alvo ? alcunhasDe(j.alvo) : [])]);
  if (j.alvo && normalizar(j.alvo) !== normalizar(j.nome)) aceites.add(j.alvo);
  return { nome: j.nome, ...(aceites.size ? { aceites: [...aceites] } : {}), ...extra };
}

// Losango em que a Wikipédia chama extremos aos médios interiores (RW/LW + AM + DM + 2 CF).
function corrigirLosango(onze) {
  const conta = (p) => onze.filter((j) => j.pos === p).length;
  if (conta('MDC') === 1 && conta('MO') === 1 && conta('ED') === 1 && conta('EE') === 1 && conta('PL') === 2 && !conta('MC') && !conta('MD') && !conta('ME')) {
    return onze.map((j) => (j.pos === 'ED' || j.pos === 'EE' ? { ...j, pos: 'MC' } : j));
  }
  return onze;
}

function montarEquipa(bruta, nomeEquipa, isoEquipa, slug, plantel, cor) {
  const onze = corrigirLosango(mapearPosicoes(bruta.onze));
  const usados = bruta.banco.filter((j) => j.entrou);
  let naoUsados = bruta.banco.filter((j) => !j.entrou);
  if (plantel) {
    // Convocados que não estão no onze nem nas substituições.
    const jogaram = new Set([...bruta.onze, ...usados].flatMap((j) => [normalizar(j.nome), normalizar(j.alvo ?? '')]));
    naoUsados = plantel.filter((j) => !jogaram.has(normalizar(j.nome)) && !jogaram.has(normalizar(j.alvo)));
  }
  const pais = (j) => paraCodigoJson(j.iso ?? isoEquipa);
  return {
    nome: nomeEquipa,
    ...(slug ? { slug } : {}),
    ...(cor ? { cor } : {}),
    formacao: deduzirFormacao(onze),
    treinador: pessoa(bruta.treinador ?? { nome: '?' }),
    onze: onze.map((j) => pessoa(j, { numero: j.numero, pais: pais(j), pos: j.pos, ...(j.golos ? { golos: j.golos } : {}) })),
    suplentes: usados.map((j) =>
      pessoa(j, { numero: j.numero, minuto: minuto(j.entrou), pais: pais(j), ...(j.golos ? { golos: j.golos } : {}) }),
    ),
    nao_utilizados: naoUsados.map((j) => {
      const p = pessoa(j);
      return p.aceites ? p : p.nome;
    }),
  };
}

export async function importar(entrada) {
  const { texto, url } = await wikitext(entrada.lingua ?? 'en', entrada.artigo);
  const { caixa, fim } = encontrarCaixa(texto, entrada.procurar);
  const t1 = campoDaCaixa(caixa, 'team1');
  const t2 = campoDaCaixa(caixa, 'team2');
  const nomes = [nomeEquipa(t1), nomeEquipa(t2)].map((n) => EQUIPAS_PT[n] ?? n);
  const isos = [bandeira(t1), bandeira(t2)];
  const onzes = lerOnzes(texto, fim);
  if (onzes.length < 2) throw new Error(`Só encontrei ${onzes.length} onze(s) completo(s).`);
  const avisosGolos = atribuirGolos(onzes, [lerGolos(caixa, 'goals1'), lerGolos(caixa, 'goals2')]);
  for (const a of avisosGolos) console.log(`   ⚠ ${entrada.id}: ${a}`);

  const placarBruto = campoDaCaixa(caixa, 'score');
  const placar = limpar(placarBruto).replace(/-/g, '–');
  const gols = placarBruto.match(/(\d+)\s*[–-]\s*(\d+)/);
  const prolongamento = /a\.?e\.?t|aet|extra time/i.test(caixa.match(/\|\s*score\s*=[^\n]*/)?.[0] ?? '') || /\|\s*aet\s*=\s*yes/i.test(caixa);
  const penaltis = limpar(campoDaCaixa(caixa, 'penaltyscore')).replace(/-/g, '–');
  let resultado = gols ? `${nomes[0]} ${gols[1]}–${gols[2]} ${nomes[1]}` : `${nomes[0]} ${placar} ${nomes[1]}`;
  if (penaltis) resultado += ` (${penaltis} g.p.)`;
  else if (prolongamento) resultado += ' (a.p.)';

  const estadio = limpar(campoDaCaixa(caixa, 'stadium'))
    .split(/\s*,\s*/)
    .map((p) => ESTADIOS_PT[p] ?? CIDADES_PT[p] ?? p)
    .join(', ');

  // Slugs automáticos pelo nome; `slugs` explícitos ganham; `semEquipa` exclui (ex.: Portugal antes de 2004).
  const excluir = new Set(entrada.semEquipa ?? []);
  const slugs = nomes.map((n, i) => (entrada.slugs?.[i] !== undefined ? entrada.slugs[i] : SLUGS[n] ?? ''));
  const modos = [...new Set([...entrada.modos, ...slugs.filter((s) => s && !excluir.has(s)).map((s) => `equipa:${s}`)])];
  const planteis = entrada.plantel ? atribuirPlanteis(onzes, await lerPlantel(entrada.plantel)) : [];
  return {
    id: entrada.id,
    modos,
    competicao: entrada.competicao,
    ...(entrada.fase ? { fase: entrada.fase } : {}),
    ...(entrada.titulo ? { titulo: entrada.titulo } : {}),
    // Jogos entre seleções não têm a pista da bandeira.
    ...(entrada.plantel || entrada.selecoes ? { selecoes: true } : {}),
    data: dataDaCaixa(caixa),
    estadio,
    resultado,
    fonte: url,
    equipas: (() => {
      const cores = coresDoJogo(nomes);
      return [0, 1].map((i) => montarEquipa(onzes[i], nomes[i], isos[i], slugs[i], planteis[i], cores[i]));
    })(),
  };
}

// --- curadoria manual (scripts/curadoria.json), aplicada depois de cada importação ---
export function aplicarCuradoria(jogo, c) {
  if (!c) return jogo;
  const { equipas: ajustesEquipas = [], ...topo } = c;
  Object.assign(jogo, topo);
  ajustesEquipas.forEach((a, i) => {
    const e = jogo.equipas[i];
    if (!a || !e) return;
    const todas = () => [e.treinador, ...e.onze, ...e.suplentes];
    for (const [antigo, novo] of Object.entries(a.nomes ?? {})) {
      const p = todas().find((x) => x.nome === antigo);
      if (p) {
        p.nome = novo;
        if (normalizar(antigo) !== normalizar(novo)) p.aceites = [...new Set([...(p.aceites ?? []), antigo])];
        continue;
      }
      const k = e.nao_utilizados.findIndex((x) => (typeof x === 'string' ? x : x.nome) === antigo);
      if (k < 0) throw new Error(`curadoria: "${antigo}" não existe em ${e.nome}`);
      e.nao_utilizados[k] = typeof e.nao_utilizados[k] === 'string' ? novo : { ...e.nao_utilizados[k], nome: novo };
    }
    // Convocados que não estavam no banco (lesionados, nomes repetidos na lista do plantel).
    for (const nome of a.remover ?? []) {
      const k = e.nao_utilizados.findIndex((x) => (typeof x === 'string' ? x : x.nome) === nome);
      if (k < 0) throw new Error(`curadoria: "${nome}" não está no banco de ${e.nome}`);
      e.nao_utilizados.splice(k, 1);
    }
    for (const [nome, pos] of Object.entries(a.pos ?? {})) {
      const p = e.onze.find((x) => x.nome === nome);
      if (!p) throw new Error(`curadoria: "${nome}" não está no onze de ${e.nome}`);
      p.pos = pos;
    }
    // Onze completo (fontes sem posições, como o zerozero): nome → sigla, pela ordem em que ficam no relvado.
    if (a.onze) {
      const nomes = Object.keys(a.onze);
      const falta = e.onze.filter((p) => !nomes.includes(p.nome)).map((p) => p.nome);
      if (falta.length || nomes.length !== e.onze.length) throw new Error(`curadoria: onze de ${e.nome} não bate certo (${falta.join(', ')})`);
      for (const p of e.onze) p.pos = a.onze[p.nome];
      e.onze.sort((x, y) => nomes.indexOf(x.nome) - nomes.indexOf(y.nome));
    }
    for (const [nome, extra] of Object.entries(a.aceites ?? {})) {
      const p = todas().find((x) => x.nome === nome);
      if (p) {
        p.aceites = [...new Set([...(p.aceites ?? []), ...extra])];
        continue;
      }
      const k = e.nao_utilizados.findIndex((x) => (typeof x === 'string' ? x : x.nome) === nome);
      if (k < 0) throw new Error(`curadoria: "${nome}" não existe em ${e.nome}`);
      const atual = e.nao_utilizados[k];
      e.nao_utilizados[k] = { nome, aceites: [...new Set([...(typeof atual === 'string' ? [] : atual.aceites ?? []), ...extra])] };
    }
    for (const [nome, golos] of Object.entries(a.golos ?? {})) {
      const p = [...e.onze, ...e.suplentes].find((x) => x.nome === nome);
      if (!p) throw new Error(`curadoria: "${nome}" não jogou por ${e.nome}`);
      if (golos.length) p.golos = golos;
      else delete p.golos;
    }
    for (const [nome, numero] of Object.entries(a.numeros ?? {})) {
      const p = [...e.onze, ...e.suplentes].find((x) => x.nome === nome);
      if (!p) throw new Error(`curadoria: "${nome}" não jogou por ${e.nome}`);
      p.numero = numero;
    }
    for (const [nome, curto] of Object.entries(a.curto ?? {})) {
      const p = todas().find((x) => x.nome === nome);
      if (!p) throw new Error(`curadoria: "${nome}" não existe em ${e.nome}`);
      p.curto = curto;
    }
    if (a.ordem) {
      const falta = a.ordem.filter((n) => !e.onze.some((p) => p.nome === n));
      if (falta.length || a.ordem.length !== 11) throw new Error(`curadoria: ordem inválida em ${e.nome} (${falta.join(', ')})`);
      e.onze.sort((x, y) => a.ordem.indexOf(x.nome) - a.ordem.indexOf(y.nome));
    }
    for (const campo of ['nome', 'formacao', 'cor', 'slug']) if (a[campo] !== undefined) e[campo] = a[campo];
  });
  return jogo;
}

async function principal() {
  const args = process.argv.slice(2);
  const forcar = args.includes('--forcar');
  const mostrar = args.includes('--mostrar');
  const fontes = JSON.parse(readFileSync(join(raiz, 'scripts', 'fontes.json'), 'utf8'));
  const curadoria = JSON.parse(readFileSync(join(raiz, 'scripts', 'curadoria.json'), 'utf8'));
  const ids = args.includes('--todos') ? fontes.map((f) => f.id) : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) {
    console.log('Uso: node scripts/importar-wikipedia.mjs <id>|--todos [--forcar] [--mostrar]');
    process.exit(1);
  }
  let falhas = 0;
  for (const id of ids) {
    const entrada = fontes.find((f) => f.id === id);
    if (!entrada) { console.error(`✗ ${id}: não está em scripts/fontes.json`); falhas++; continue; }
    if (!entrada.artigo) continue; // jogos transcritos à mão
    const destino = join(raiz, 'data', 'jogos', `${id}.json`);
    if (existsSync(destino) && !forcar && !mostrar) { console.log(`· ${id}: já existe (usa --forcar para reescrever)`); continue; }
    try {
      const jogo = aplicarCuradoria(await importar(entrada), curadoria[id]);
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
