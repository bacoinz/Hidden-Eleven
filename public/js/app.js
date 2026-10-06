// Arranque e controlo do cliente: ecrãs, ligação à sala, palpites e animações.
import { $, ler, guardar, novoId, nomePista } from './util.js';
import { Ligacao } from './ligacao.js';
import { Relvado } from './relvado.js';
import * as ui from './ui.js';
import { sons, somLigado, alternarSom } from './sons.js';

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

const relvado = new Relvado($('#relvado'), $('#banco-a'), $('#banco-b'));
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
    $('#erro-nome').textContent = info.solo
      ? 'Esta sala é para jogar sozinho: vais entrar a ver.'
      : info.cheia
        ? 'A sala está cheia: vais entrar a ver.'
        : '';
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
    const meuLado = sala.fase === 'ronda' ? sala.ronda.lados?.[estado.eu] ?? null : null;
    relvado.render(sala.ronda, jogadores, meuLado);
  }
  ui.renderFicha(sala);
  ui.renderFinal(sala, estado.eu);
  ui.renderPlacar(sala, estado.eu, estado.totais, enviar);
  estado.totais = new Map(sala.jogadores.map((j) => [j.id, j.total]));
  ui.renderFeed(sala);
  ui.renderMarcador(sala);
  ui.renderPapel(sala, estado.eu);
  atualizarCaixa(sala, anterior);

  for (const ev of novos) {
    if (ev.tipo === 'descoberta') {
      const extra = $('#relogio-extra');
      extra.textContent = '+5s';
      extra.classList.remove('mostrar');
      void extra.offsetWidth;
      extra.classList.add('mostrar');
    }
    if (ev.tipo === 'descoberta' && ev.jogador !== estado.eu) sons.outro();
    if (ev.tipo === 'pista') {
      ui.toast(`Nova pista: ${nomePista(ev)}`);
      sons.pista();
    }
    if (ev.tipo === 'fim') sons.fim();
    if (ev.tipo === 'duelo') {
      const ganhei = ev.vencedores?.includes(estado.eu);
      const joguei = sala.ronda?.lados?.[estado.eu] !== undefined;
      if (ganhei) {
        sons.vitoria();
        ui.toast(`Ganhaste o duelo! +${ev.bonus}`);
      } else if (joguei && ev.equipa) {
        sons.derrota();
        ui.toast(`O ${ev.equipa} fechou primeiro o onze.`);
      }
    }
    if (ev.tipo === 'promovido' && ev.jogador === estado.eu) ui.toast('Agora estás a jogar!');
    if (ev.tipo === 'anfitriao' && ev.jogador === estado.eu) ui.toast('Agora és tu o anfitrião.');
  }
  if (sala.fase === 'ronda' && sala.ronda?.onzeCompleto && anterior?.ronda && !anterior.ronda.onzeCompleto) {
    ui.toast(sala.solo ? 'Onze completo! Podes terminar a ronda.' : 'Onze completo! Podem terminar a ronda se todos confirmarem.');
  }
  ui.tick(sala, estado.ligacao.agora());
}

function atualizarCaixa(sala, anterior) {
  const caixa = $('#palpite');
  const espectador = sala.jogadores.find((j) => j.id === estado.eu)?.espectador;
  const aJogar = sala.fase === 'ronda' && !espectador;
  caixa.disabled = !aJogar;
  $('#form-palpite button').disabled = !aJogar;
  caixa.placeholder = espectador
    ? 'Estás a ver esta ronda'
    : aJogar
      ? 'Escreve um nome e carrega Enter'
      : sala.fase === 'ficha'
        ? 'Prepara-te…'
        : 'Ronda terminada';
  if (sala.fase !== anterior?.fase) $('#resposta').textContent = '';
  if (aJogar && anterior?.fase !== 'ronda') {
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
      sons.acerto();
      break;
    case 'errado':
      responder(`${enviado ?? 'Esse nome'} não está no jogo.`, 'errado');
      bloquear(msg.ate);
      sons.erro();
      break;
    case 'outra':
      responder('É da outra equipa!', 'info');
      sons.aviso();
      break;
    case 'espectador':
      responder('Estás a ver esta ronda. Jogas a partir da próxima.', 'info');
      break;
    case 'bloqueado':
      responder('Espera um segundo…', 'errado');
      bloquear(msg.ate);
      if (enviado && !$('#palpite').value) $('#palpite').value = enviado;
      break;
    case 'ja':
      responder(msg.porNome ? `Já é de ${msg.porNome}!` : 'Já é teu!', 'info');
      sons.aviso();
      break;
    case 'banco':
      responder('Ficou no banco!', 'info');
      sons.aviso();
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
  // Numa sala solo (ou cheia) entra-se a ver.
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

// Som e vibração
function mostrarSom() {
  const b = $('#btn-som');
  b.textContent = somLigado() ? '🔊' : '🔇';
  b.setAttribute('aria-pressed', String(somLigado()));
  b.title = somLigado() ? 'Desligar som e vibração' : 'Ligar som e vibração';
}
$('#btn-som').addEventListener('click', () => {
  alternarSom();
  mostrarSom();
});
mostrarSom();

// Relógio (e tique nos últimos 10 segundos)
let ultimoSegundo = null;
setInterval(() => {
  if (!estado.sala || !estado.ligacao) return;
  const agora = estado.ligacao.agora();
  ui.tick(estado.sala, agora);
  const r = estado.sala.ronda;
  if (estado.sala.fase !== 'ronda' || !r) return;
  const segundo = Math.ceil((r.fim - agora) / 1000);
  if (segundo !== ultimoSegundo && segundo > 0 && segundo <= 10) sons.tique();
  ultimoSegundo = segundo;
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
