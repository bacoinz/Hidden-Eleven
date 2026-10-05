// Durable Object de uma sala: WebSockets (com hibernação), persistência e alarmes.
// Toda a lógica do jogo está em sala-logica.js; aqui só há I/O.
import { DurableObject } from 'cloudflare:workers';
import * as L from './sala-logica.js';
import { equipasMiticas, contagens } from './catalogo.js';
import { REGRAS } from './regras.js';

const ACOES_ANFITRIAO = {
  config: (sala, id, msg) => L.configurar(sala, id, msg),
  comecar: (sala, id, _msg, agora) => L.comecar(sala, id, agora),
  proxima: (sala, id, _msg, agora) => L.proxima(sala, id, agora),
  novo_jogo: (sala, id) => L.novoJogo(sala, id),
  repor: (sala, id) => L.reporJogos(sala, id),
};

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sala = null;
    // Responde a "ping" sem acordar o objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.sala = (await ctx.storage.get('sala')) ?? null;
    });
  }

  // --- RPC chamado pelo Worker ---

  async criar({ codigo, solo, anfitriaoToken }) {
    if (this.sala) return { ok: false };
    this.sala = L.novaSala({ codigo, solo, anfitriaoToken, agora: Date.now() });
    await this.guardar();
    await this.agendar();
    return { ok: true };
  }

  async info() {
    if (!this.sala) return { existe: false };
    return {
      existe: true,
      solo: this.sala.solo,
      jogadores: this.sala.jogadores.length,
      cheia: this.sala.jogadores.length >= REGRAS.maxJogadores,
      fase: L.faseVisivel(this.sala),
    };
  }

  // --- WebSockets ---

  async fetch() {
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ jogadorId: null });
    if (!this.sala) {
      this.enviar(servidor, { t: 'erro', msg: 'Esta sala não existe ou já expirou.', fatal: true });
      servidor.close(4004, 'sala inexistente');
    }
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, mensagem) {
    if (!this.sala || typeof mensagem !== 'string' || mensagem.length > 2000) return;
    let msg;
    try {
      msg = JSON.parse(mensagem);
    } catch {
      return;
    }
    const agora = Date.now();
    const id = ws.deserializeAttachment()?.jogadorId ?? null;
    let mudou = false;

    if (msg.t === 'entrar') {
      const r = L.entrar(this.sala, { token: msg.token, nome: msg.nome }, agora);
      if (r.erro) {
        this.enviar(ws, { t: 'erro', msg: r.erro, fatal: true });
        ws.close(4003, 'recusado');
        return;
      }
      ws.serializeAttachment({ jogadorId: r.jogador.id });
      this.enviar(ws, { t: 'bemvindo', eu: r.jogador.id, catalogo: { equipas: equipasMiticas(), contagens: contagens() } });
      mudou = true;
    } else if (!id) {
      return;
    } else if (msg.t === 'palpite') {
      const r = L.palpite(this.sala, id, msg.texto, agora);
      if (r.resposta) this.enviar(ws, { t: 'resposta', ...r.resposta, agora });
      mudou = r.mudou;
    } else if (msg.t === 'terminar') {
      const r = L.votarTerminar(this.sala, id, agora);
      if (r.erro) this.enviar(ws, { t: 'erro', msg: r.erro });
      else mudou = true;
    } else if (ACOES_ANFITRIAO[msg.t]) {
      const r = ACOES_ANFITRIAO[msg.t](this.sala, id, msg, agora);
      if (r?.erro) this.enviar(ws, { t: 'erro', msg: r.erro });
      else mudou = true;
    }

    if (mudou) await this.publicar(agora);
  }

  async webSocketClose(ws) {
    await this.saiu(ws);
  }

  async webSocketError(ws) {
    await this.saiu(ws);
  }

  async saiu(ws) {
    const id = ws.deserializeAttachment()?.jogadorId;
    if (!id || !this.sala) return;
    const outros = this.ctx.getWebSockets().filter((w) => w !== ws && w.deserializeAttachment()?.jogadorId === id);
    if (outros.length) return; // ainda tem outro separador aberto
    if (L.desligar(this.sala, id, Date.now())) await this.publicar();
  }

  // --- Alarmes ---

  async alarm() {
    if (!this.sala) return;
    const agora = Date.now();
    if (L.deveLimpar(this.sala, agora)) {
      await this.ctx.storage.deleteAll();
      this.sala = null;
      return;
    }
    if (L.avancar(this.sala, agora)) await this.publicar(agora);
    else await this.agendar();
  }

  // --- utilitários ---

  async publicar(agora = Date.now()) {
    await this.guardar();
    this.difundir(agora);
    await this.agendar();
  }

  async guardar() {
    await this.ctx.storage.put('sala', this.sala);
  }

  async agendar() {
    const prazo = this.sala ? L.proximoPrazo(this.sala) : null;
    if (prazo == null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if ((await this.ctx.storage.getAlarm()) !== prazo) await this.ctx.storage.setAlarm(prazo);
  }

  difundir(agora = Date.now()) {
    const estado = JSON.stringify({ t: 'estado', sala: L.estadoPublico(this.sala, agora) });
    for (const ws of this.ctx.getWebSockets()) {
      if (!ws.deserializeAttachment()?.jogadorId) continue;
      try {
        ws.send(estado);
      } catch {
        // socket a fechar; o webSocketClose trata do resto
      }
    }
  }

  enviar(ws, dados) {
    try {
      ws.send(JSON.stringify({ agora: Date.now(), ...dados }));
    } catch {
      // ignorado
    }
  }
}
