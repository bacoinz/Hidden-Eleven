// Teste ponta-a-ponta: dois clientes WebSocket jogam uma ronda completa contra o servidor.
// Uso: npm run dev (noutro terminal) e depois npm run e2e   ·   BASE=https://… npm run e2e para o servidor publicado.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) falhas++;
};

class Cliente {
  constructor(nome, token) {
    this.nome = nome;
    this.token = token;
    this.mensagens = [];
    this.estado = null;
    this.eu = null;
    this.esperas = [];
  }
  ligar(codigo) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws/${codigo}`);
      this.ws.addEventListener('open', () => this.enviar({ t: 'entrar', token: this.token, nome: this.nome }));
      this.ws.addEventListener('error', reject);
      this.ws.addEventListener('message', (ev) => {
        const texto = String(ev.data);
        const msg = JSON.parse(texto);
        this.mensagens.push({ texto, msg });
        if (msg.t === 'bemvindo') {
          this.eu = msg.eu;
          resolve();
        }
        if (msg.t === 'estado') this.estado = msg.sala;
        if (msg.t === 'erro' && msg.fatal) reject(new Error(msg.msg));
        this.esperas = this.esperas.filter((e) => !e(msg));
      });
    });
  }
  enviar(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  /** Espera por uma mensagem que cumpra `teste` (até `ms`). */
  esperar(teste, ms = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`tempo esgotado à espera de mensagem (${this.nome})`)), ms);
      this.esperas.push((msg) => {
        if (!teste(msg)) return false;
        clearTimeout(t);
        resolve(msg);
        return true;
      });
    });
  }
  async palpite(texto) {
    // O servidor pede pelo menos 150 ms entre palpites do mesmo jogador.
    const desde = Date.now() - (this.ultimoPalpite ?? 0);
    if (desde < 170) await espera(170 - desde);
    this.ultimoPalpite = Date.now();
    const pedido = this.esperar((m) => m.t === 'resposta');
    this.enviar({ t: 'palpite', texto });
    return pedido;
  }
  fechar() {
    this.ws.close();
  }
}

async function principal() {
  console.log(`Servidor: ${BASE}`);
  const tokenA = `e2e-anfitriao-${Date.now()}`;
  const criar = await fetch(`${BASE}/api/salas`, { method: 'POST', body: JSON.stringify({ token: tokenA }) }).then((r) => r.json());
  ok(/^[A-Z]{4}$/.test(criar.codigo), `sala criada (${criar.codigo})`);
  const codigo = criar.codigo;
  const info = await fetch(`${BASE}/api/salas/${codigo}`).then((r) => r.json());
  ok(info.existe === true && info.solo === false, 'a sala existe e é multijogador');
  const html = await fetch(`${BASE}/sala/${codigo}`).then((r) => r.text());
  ok(html.includes(`Sala ${codigo}`), 'a página da sala tem o código na pré-visualização');
  const inexistente = await fetch(`${BASE}/api/salas/ZZZZ`).then((r) => r.json());
  ok(inexistente.existe === false, 'uma sala inexistente é reportada');

  const a = new Cliente('Anfitriã', tokenA);
  const b = new Cliente('Rui', `e2e-convidado-${Date.now()}`);
  await a.ligar(codigo);
  await b.ligar(codigo);
  await espera(300);
  ok(a.estado?.anfitriao === a.eu, 'quem criou a sala é o anfitrião');
  ok(a.estado?.jogadores.length === 2 && a.estado.jogadores[0].cor !== a.estado.jogadores[1].cor, 'dois jogadores com cores diferentes');

  a.enviar({ t: 'config', conteudo: 'finais', rondas: 1 });
  a.enviar({ t: 'comecar' });
  const ficha = await a.esperar((m) => m.t === 'estado' && m.sala.fase === 'ficha');
  ok(Boolean(ficha.sala.ronda?.jogo?.resultado), `ficha do jogo: ${ficha.sala.ronda.jogo.resultado}`);
  const jogo = JSON.parse(readFileSync(join(raiz, 'data', 'jogos', `${ficha.sala.ronda.jogo.id}.json`), 'utf8'));
  const naoUtilizados = jogo.equipas.flatMap((e) => e.nao_utilizados.map((n) => (typeof n === 'string' ? n : n.nome)));
  const pessoas = jogo.equipas.flatMap((e) => [e.treinador, ...e.onze, ...e.suplentes].map((p) => p.nome));

  await b.esperar((m) => m.t === 'estado' && m.sala.fase === 'ronda', 12000);
  const inicio = Date.now();
  ok(true, 'a ronda começou depois da ficha');

  const titular = jogo.equipas[0].onze[5].nome;
  const errado = await b.palpite('Zé Ninguém Desconhecido');
  ok(errado.r === 'errado' && errado.ate > 0, 'nome errado bloqueia');
  const bloqueado = await b.palpite(titular);
  ok(bloqueado.r === 'bloqueado', 'durante o bloqueio de 1 s o palpite é recusado');
  await espera(1100);
  const certo = await b.palpite(titular);
  ok(certo.r === 'certo' && certo.pontos === 5, `acerto vale 5 (${titular})`);
  const ja = await a.palpite(titular);
  ok(ja.r === 'ja' && ja.porNome === 'Rui', `"Já é de Rui!"`);
  const banco = await b.palpite(naoUtilizados[0]);
  ok(banco.r === 'banco', `"Ficou no banco!" (${naoUtilizados[0]})`);

  // A anfitriã descobre o resto (respeitando o intervalo mínimo entre palpites).
  const restantes = pessoas.filter((n) => n !== titular);
  let ultimo = null;
  for (const nome of restantes) {
    await espera(170);
    ultimo = await a.palpite(nome);
    if (ultimo.r !== 'certo') ok(false, `devia acertar ${nome}: ${JSON.stringify(ultimo)}`);
  }
  ok(ultimo?.bonus === 2 && ultimo?.terminou === true, 'quem fecha a última posição ganha +2 e a ronda acaba');
  const fim = await a.esperar((m) => m.t === 'estado' && m.sala.fase === 'fim');
  const lugares = fim.sala.ronda.equipas.flatMap((e) => [...e.onze, ...e.suplentes, e.treinador]);
  ok(lugares.every((l) => l.nome), 'no fim todos os lugares têm nome');
  ok(Date.now() - inicio < 60000, 'a ronda acabou antes do tempo por estar tudo descoberto');
  const totalA = fim.sala.jogadores.find((j) => j.id === a.eu).total;
  const totalB = fim.sala.jogadores.find((j) => j.id === b.eu).total;
  ok(totalB === 5, `Rui tem 5 pontos (${totalB})`);
  ok(totalA > 0, `a anfitriã tem ${totalA} pontos`);

  // Nenhuma mensagem antes do fim pode conter nomes ainda escondidos ou do banco.
  let fugas = 0;
  for (const cliente of [a, b]) {
    for (const { texto, msg } of cliente.mensagens) {
      if (msg.t !== 'estado' || !msg.sala.ronda || msg.sala.fase === 'fim') continue;
      const revelados = new Set(msg.sala.ronda.equipas.flatMap((e) => [...e.onze, ...e.suplentes, e.treinador]).filter((l) => l.nome).map((l) => l.nome));
      for (const nome of [...pessoas, ...naoUtilizados]) {
        if (!revelados.has(nome) && texto.includes(`"${nome}"`)) fugas++;
      }
    }
  }
  ok(fugas === 0, 'nenhum nome escondido chegou aos clientes antes de ser descoberto');

  // Reconexão: o Rui recarrega a página.
  b.fechar();
  await espera(300);
  const b2 = new Cliente('Rui', b.token);
  await b2.ligar(codigo);
  await espera(300);
  ok(b2.eu === b.eu, 'reconexão devolve o mesmo jogador');
  ok(b2.estado?.jogadores.find((j) => j.id === b.eu)?.total === 5, 'e os mesmos pontos');

  a.enviar({ t: 'proxima' });
  const final = await a.esperar((m) => m.t === 'estado' && m.sala.fase === 'final');
  ok(final.sala.partida.historico.length === 1, 'depois da última ronda aparece a classificação final');

  a.fechar();
  b2.fechar();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
}

principal().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
