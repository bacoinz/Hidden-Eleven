// Tira as imagens do README (docs/screenshots) com o Chrome sem janela, a partir do jogo a correr localmente
// (npm run dev). Joga uma ronda a sério com dois jogadores (a Ana e o Rui), em inglês.
//   node scripts/prints.mjs [http://localhost:8787]
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'docs', 'screenshots');
const base = process.argv[2] ?? 'http://localhost:8787';
const CHROMES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chrome = CHROMES.find((c) => existsSync(c));
if (!chrome) throw new Error('Não encontrei o Chrome: indica o caminho na variável CHROME.');

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const PORTA = 9333;

// --- Chrome DevTools Protocol, o mínimo ---
const perfil = await mkdtemp(join(tmpdir(), 'hidden-eleven-print-'));
const processo = spawn(chrome, ['--headless=new', '--hide-scrollbars', '--mute-audio', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let versao = null;
for (let i = 0; i < 50 && !versao; i++) {
  await dorme(200);
  versao = await fetch(`http://127.0.0.1:${PORTA}/json/version`).then((r) => r.json()).catch(() => null);
}
if (!versao) throw new Error('O Chrome não arrancou.');
const ws = new WebSocket(versao.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let proximo = 1;
const pendentes = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendentes.has(m.id)) {
    const { ok, falha } = pendentes.get(m.id);
    pendentes.delete(m.id);
    if (m.error) falha(new Error(`${m.error.message}`));
    else ok(m.result);
  }
});
const cdp = (method, params = {}, sessionId) =>
  new Promise((ok, falha) => {
    const id = proximo++;
    pendentes.set(id, { ok, falha });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

/** Uma página num perfil próprio (cada jogador tem o seu localStorage). */
async function pagina(largura, altura, telemovel = false) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const p = {
    js: async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    ir: async (url) => {
      await cdp('Page.navigate', { url }, sessionId);
      await dorme(1500);
    },
    tamanho: (w, h, movel) =>
      cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: movel ? 2 : 1, mobile: Boolean(movel) }, sessionId),
    foto: async (nome) => {
      await dorme(400);
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile(join(destino, `${nome}.png`), Buffer.from(data, 'base64'));
      console.log(`docs/screenshots/${nome}.png`);
    },
  };
  await cdp('Page.enable', {}, sessionId);
  await p.tamanho(largura, altura, telemovel);
  return p;
}

const esperar = async (p, expr, ms = 20000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await p.js(expr)) return;
    await dorme(250);
  }
  throw new Error(`Esperei demasiado por: ${expr}`);
};
const palpite = (p, nome) => p.js(`(() => { const c = document.querySelector('#palpite'); c.value = ${JSON.stringify(nome)}; document.querySelector('#form-palpite').requestSubmit(); })()`);

try {
  await mkdir(destino, { recursive: true });

  // Início
  const visita = await pagina(1440, 900);
  await visita.ir(`${base}/?lang=en`);
  await visita.foto('start');

  // A Ana cria a sala; o Rui entra pelo link.
  const ana = await pagina(1440, 900);
  await ana.ir(`${base}/?lang=en`);
  await ana.js(`document.querySelector('#nome').value = 'Ana'; document.querySelector('#btn-criar').click()`);
  await esperar(ana, `location.pathname.startsWith('/sala/') && !document.querySelector('#ecra-lobby').hidden`);
  const codigo = (await ana.js('location.pathname')).split('/').pop();
  const rui = await pagina(1440, 900);
  await rui.ir(`${base}/sala/${codigo}?lang=en`);
  await rui.js(`document.querySelector('#nome-link').value = 'Rui'; document.querySelector('#form-nome').requestSubmit()`);
  await esperar(ana, `document.querySelectorAll('#lobby-jogadores li').length === 2`);
  await ana.foto('lobby');

  // Ficha do jogo e depois a ronda.
  await ana.js(`document.querySelector('#btn-comecar').click()`);
  await esperar(ana, `!document.querySelector('#ficha').hidden`);
  await ana.foto('match-sheet');
  await esperar(ana, `document.querySelector('#ficha').hidden && !document.querySelector('#palpite').disabled`);

  // O jogo da ronda, pela data da ficha ("28 May 2016").
  const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [d, mes, a] = (await ana.js(`document.querySelector('#jogo-data').textContent`)).split(' ');
  const data = `${a}-${String(MESES.indexOf(mes) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
  const jogos = [];
  for (const f of await readdir(join(raiz, 'data', 'jogos'))) jogos.push(JSON.parse(await readFile(join(raiz, 'data', 'jogos', f), 'utf8')));
  const jogo = jogos.find((j) => j.data === data && j.modos.includes('final')) ?? jogos.find((j) => j.data === data);
  if (!jogo) throw new Error(`Não encontrei o jogo de ${data}.`);

  // Os dois vão descobrindo nomes, à vez; deixa-se uma parte por descobrir para a imagem do meio da ronda.
  const onze = jogo.equipas.flatMap((e) => e.onze.map((p) => p.nome));
  for (const [k, nome] of onze.entries()) {
    if (k === 15) {
      await ana.foto('game');
      // O Rui no telemóvel.
      await rui.tamanho(390, 844, true);
      await dorme(800);
      await rui.foto('game-phone');
      await rui.tamanho(1440, 900, false);
    }
    await palpite(k % 3 ? ana : rui, nome);
    await dorme(350);
  }
  // Com o onze completo, os dois terminam a ronda: estatísticas e marcador.
  await esperar(ana, `!document.querySelector('#btn-proxima').hidden`);
  await ana.js(`document.querySelector('#btn-proxima').click()`);
  await rui.js(`document.querySelector('#btn-proxima').click()`);
  await esperar(ana, `!document.querySelector('#marcador').hidden`);
  await ana.foto('round-end');
} finally {
  ws.close();
  processo.kill();
  await dorme(500);
  await rm(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(0);
