// Arranque e controlo do cliente: ecrãs, ligação à sala, palpites e animações.
import { $, ler, guardar, novoId, NOMES_PISTAS } from './util.js';
import { Ligacao } from './ligacao.js';
import { Relvado } from './relvado.js';
import * as ui from './ui.js';

const CHAVE_TOKEN = 'he.token';
const CHAVE_NOME = 'he.nome';

let token = ler(CHAVE_TOKEN);
if (!token) {
  token = novoId();
  guardar(CHAVE_TOKEN, token);
}

const estado = {
  codigo: null,
  ligacao: null,
  eu: null,
  sala: null,
  catalogo: null,
  ultimoSeq: null,
  totais: null,
  bloqueadoAte: 0,
  pendente: null,
};

const relvado = new Relvado($('#relvado'), $('#banco-cima'), $('#banco-baixo'));
const enviar = (msg) => estado.ligacao?.enviar(msg);

// ---------------------------------------------------------------------------
// Ecrãs e navegação
// ---------------------------------------------------------------------------

function mostrar(ecra) {
  for (const e of document.querySelectorAll('.ecra')) e.hidden = e.id !== `ecra-${ecra}`;
  if (ecra === 'jogo') document.body.classList.add('a-jogar');
  else document.body.classList.remove('a-jogar');
}

function irPara(caminho) {
  if (location.pathname !== caminho) history.pushState(null, '', caminho);
}

function voltarAoInicio(erro = '') {
  estado.ligacao?.fechar();
  estado.ligacao = null;
  estado.sala = null;
  irPara('/');
  document.title = 'Hidden Eleven';
  $('#erro-inicio').textContent = erro;
  $('#aviso-ligacao').hidden = true;
  mostrar('inicio');
}

async function infoSala(codigo) {
  try {
    const r = await fetch(`/api/salas/${codigo}`);
    return await r.json();
  } catch {
    return { existe: false, falhou: true };
  }
}

async function abrirSala(codigo) {
  const info = await infoSala(codigo);
  if (info.falhou) return voltarAoInicio('Sem ligação ao servidor. Tenta outra vez.');
  if (!info.existe) return voltarAoInicio(`A sala ${codigo} não existe ou já expirou.`);
  irPara(`/sala/${codigo}`);
  if (!ler(CHAVE_NOME)) {
    $('#nome-codigo').textContent = codigo;
    $('#erro-nome').textContent = info.solo ? 'Esta sala é para jogar sozinho.' : info.cheia ? 'A sala está cheia.' : '';
    mostrar('nome');
    $('#nome-link').focus();
    estado.codigo = codigo;
    return;
  }
  ligar(codigo);
}

function ligar(codigo) {
  estado.ligacao?.fechar();
  Object.assign(estado, { codigo, eu: null, sala: null, ultimoSeq: null, totais: null, bloqueadoAte: 0 });
  document.title = `Hidden Eleven · Sala ${codigo}`;
  estado.ligacao = new Ligacao({
    codigo,
    identidade: () => ({ token, nome: ler(CHAVE_NOME) ?? '' }),
    aoMensagem,
    aoEstado: (ligado) => {
      $('#aviso-ligacao').hidden = ligado;
    },
  });
  estado.ligacao.ligar();
}

async function criarSala(solo) {
  const nome = $('#nome').value.trim();
  if (!nome) {
    $('#erro-inicio').textContent = 'Escolhe um nome primeiro.';
    $('#nome').focus();
    return;
  }
  guardar(CHAVE_NOME, nome);
  $('#erro-inicio').textContent = '';
  try {
    const r = await fetch('/api/salas', { method: 'POST', body: JSON.stringify({ token, solo }) });
    const { codigo, erro } = await r.json();
    if (!codigo) throw new Error(erro);
    irPara(`/sala/${codigo}`);
    ligar(codigo);
  } catch (e) {
    $('#erro-inicio').textContent = e.message || 'Não foi possível criar a sala.';
  }
}

// ---------------------------------------------------------------------------
// Mensagens do servidor
// ---------------------------------------------------------------------------

function aoMensagem(msg) {
  switch (msg.t) {
    case 'bemvindo':
      estado.eu = msg.eu;
      estado.catalogo = msg.catalogo;
      break;
    case 'estado':
      aoEstado(msg.sala);
      break;
    case 'resposta':
      aoResposta(msg);
      break;
    case 'erro':
      if (msg.fatal) voltarAoInicio(msg.msg);
      else {
        $('#erro-lobby').textContent = msg.msg;
        ui.toast(msg.msg);
      }
      break;
    default:
  }
}

function aoEstado(sala) {
  const anterior = estado.sala;
  estado.sala = sala;
  if (!estado.eu) return;
  const novos = estado.ultimoSeq == null ? [] : sala.feed.filter((ev) => ev.seq > estado.ultimoSeq);
  estado.ultimoSeq = sala.feed.at(-1)?.seq ?? 0;

  if (sala.fase === 'lobby') {
    mostrar('lobby');
    $('#erro-lobby').textContent = '';
    ui.renderLobby(sala, estado.eu, estado.catalogo, enviar);
    return;
  }

  mostrar('jogo');
  ui.renderCabecalho(sala);
  if (sala.ronda) {
    const jogadores = new Map(sala.jogadores.map((j) => [j.id, j]));
    relvado.render(sala.ronda, jogadores);
  }
  ui.renderFicha(sala);
  ui.renderFim(sala, estado.eu, enviar);
  ui.renderFinal(sala, estado.eu);
  ui.renderClassificacao(sala, estado.eu, estado.totais);
  estado.totais = new Map(sala.jogadores.map((j) => [j.id, j.total]));
  ui.renderFeed(sala);
  atualizarCaixa(sala, anterior);

  for (const ev of novos) {
    if (ev.tipo === 'descoberta') {
      const extra = $('#relogio-extra');
      extra.textContent = '+5s';
      extra.classList.remove('mostrar');
      void extra.offsetWidth;
      extra.classList.add('mostrar');
    }
    if (ev.tipo === 'pista') ui.toast(`Nova pista: ${NOMES_PISTAS[ev.nivel]}`);
    if (ev.tipo === 'anfitriao' && ev.jogador === estado.eu) ui.toast('Agora és tu o anfitrião.');
  }
  ui.tick(sala, estado.ligacao.agora());
}

function atualizarCaixa(sala, anterior) {
  const caixa = $('#palpite');
  const aJogar = sala.fase === 'ronda';
  caixa.disabled = !aJogar;
  $('#form-palpite button').disabled = !aJogar;
  caixa.placeholder = aJogar
    ? 'Escreve um nome e carrega Enter'
    : sala.fase === 'ficha'
      ? 'Prepara-te…'
      : 'Ronda terminada';
  if (aJogar && anterior?.fase !== 'ronda') {
    $('#resposta').textContent = '';
    caixa.value = '';
    caixa.focus();
  }
}

// ---------------------------------------------------------------------------
// Palpites
// ---------------------------------------------------------------------------

function responder(texto, tipo) {
  const r = $('#resposta');
  r.textContent = texto;
  r.className = `resposta ${tipo}`;
}

function bloquear(ate) {
  const ms = Math.max(0, ate - estado.ligacao.agora());
  estado.bloqueadoAte = Date.now() + ms;
  const form = $('#form-palpite');
  const barra = $('#bloqueio');
  form.classList.add('bloqueada');
  form.classList.remove('tremer');
  void form.offsetWidth;
  form.classList.add('tremer');
  barra.style.setProperty('--bloqueio-ms', `${ms}ms`);
  barra.classList.remove('ativo');
  void barra.offsetWidth;
  barra.classList.add('ativo');
  clearTimeout(bloquear.t);
  bloquear.t = setTimeout(() => {
    form.classList.remove('bloqueada');
    barra.classList.remove('ativo');
  }, ms);
}

function aoResposta(msg) {
  const enviado = estado.pendente;
  estado.pendente = null;
  switch (msg.r) {
    case 'certo':
      responder(`Boa! ${msg.nome} +${msg.pontos}${msg.bonus ? ` · fechaste o jogo +${msg.bonus}` : ''}`, 'certo');
      break;
    case 'errado':
      responder(`${enviado ?? 'Esse nome'} não está no jogo.`, 'errado');
      bloquear(msg.ate);
      break;
    case 'bloqueado':
      responder('Espera um segundo…', 'errado');
      bloquear(msg.ate);
      if (enviado && !$('#palpite').value) $('#palpite').value = enviado;
      break;
    case 'ja':
      responder(msg.porNome ? `Já é de ${msg.porNome}!` : 'Já é teu!', 'info');
      break;
    case 'banco':
      responder('Ficou no banco!', 'info');
      break;
    case 'ambiguo':
      responder('Há mais do que um com esse nome — escreve o nome completo!', 'info');
      break;
    case 'invalido':
      responder('Escreve pelo menos 2 letras.', 'info');
      break;
    case 'devagar':
      if (enviado && !$('#palpite').value) $('#palpite').value = enviado;
      break;
    default:
  }
}

$('#form-palpite').addEventListener('submit', (e) => {
  e.preventDefault();
  const caixa = $('#palpite');
  const texto = caixa.value.trim();
  if (!texto || Date.now() < estado.bloqueadoAte) return;
  if (!enviar({ t: 'palpite', texto })) return;
  estado.pendente = texto;
  caixa.value = '';
  caixa.focus();
});

// Escrever em qualquer lado durante a ronda vai para a caixa.
document.addEventListener('keydown', (e) => {
  if (estado.sala?.fase !== 'ronda' || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
  const ativo = document.activeElement;
  if (ativo && (ativo.tagName === 'INPUT' || ativo.tagName === 'SELECT' || ativo.tagName === 'TEXTAREA')) return;
  $('#palpite').focus();
});

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

$('#nome').value = ler(CHAVE_NOME) ?? '';
$('#nome-link').value = ler(CHAVE_NOME) ?? '';
$('#btn-criar').addEventListener('click', () => criarSala(false));
$('#btn-solo').addEventListener('click', () => criarSala(true));

$('#codigo').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});
$('#form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codigo = $('#codigo').value.trim().toUpperCase();
  const nome = $('#nome').value.trim();
  if (codigo.length !== 4) {
    $('#erro-inicio').textContent = 'O código tem 4 letras.';
    return;
  }
  if (!nome) {
    $('#erro-inicio').textContent = 'Escolhe um nome primeiro.';
    $('#nome').focus();
    return;
  }
  guardar(CHAVE_NOME, nome);
  const info = await infoSala(codigo);
  if (!info.existe) {
    $('#erro-inicio').textContent = info.falhou ? 'Sem ligação ao servidor.' : `A sala ${codigo} não existe.`;
    return;
  }
  if (info.solo) {
    $('#erro-inicio').textContent = 'Essa sala é para jogar sozinho.';
    return;
  }
  irPara(`/sala/${codigo}`);
  ligar(codigo);
});

$('#form-nome').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = $('#nome-link').value.trim();
  if (!nome) return;
  guardar(CHAVE_NOME, nome);
  $('#nome').value = nome;
  ligar(estado.codigo);
});

$('#btn-copiar').addEventListener('click', async () => {
  const link = `${location.origin}/sala/${estado.codigo}`;
  try {
    await navigator.clipboard.writeText(link);
    ui.toast('Link copiado! Cola-o no Discord.');
  } catch {
    ui.toast(link, 6000);
  }
});
$('#btn-comecar').addEventListener('click', () => enviar({ t: 'comecar' }));
$('#btn-repor').addEventListener('click', () => enviar({ t: 'repor' }));
$('#btn-novo').addEventListener('click', () => enviar({ t: 'novo_jogo' }));
$('#btn-ver-campo').addEventListener('click', () => ui.mostrarFinal(false));
for (const b of document.querySelectorAll('.btn-sair')) b.addEventListener('click', () => voltarAoInicio());
for (const b of document.querySelectorAll('[data-abrir]')) b.addEventListener('click', () => document.getElementById(b.dataset.abrir).showModal());

// Relógio
setInterval(() => {
  if (estado.sala && estado.ligacao) ui.tick(estado.sala, estado.ligacao.agora());
}, 200);

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

function rota() {
  const m = location.pathname.match(/^\/sala\/([A-Za-z]{4})\/?$/);
  if (m) abrirSala(m[1].toUpperCase());
  else voltarAoInicio();
}
window.addEventListener('popstate', rota);
rota();
