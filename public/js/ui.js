// Pedaços da interface: lobby, classificação, feed, ficha, fim de ronda, pódio, relógio e avisos.
import { $, el, formatarData, formatarTempo, nomePista } from './util.js';

const CONTEUDOS = [
  { id: 'finais', nome: 'Finais', chave: 'finais' },
  { id: 'classicos', nome: 'Clássicos', chave: 'classicos' },
  { id: 'equipa', nome: 'Equipa Mítica', chave: null },
  { id: 'aleatorio', nome: 'Aleatório', chave: 'aleatorio' },
];
const RONDAS = [3, 5, 10];

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function toast(texto, ms = 2600) {
  const t = el('div', { class: 'toast', text: texto });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

/** Jogadores ordenados por pontos, com a posição (empates partilham o lugar). */
export function ordenar(jogadores, campo = 'total') {
  const lista = [...jogadores].sort((a, b) => b[campo] - a[campo] || a.nome.localeCompare(b.nome, 'pt'));
  let posicao = 0;
  let anterior = null;
  return lista.map((j, i) => {
    if (j[campo] !== anterior) posicao = i + 1;
    anterior = j[campo];
    return { ...j, posicao };
  });
}

const chipJogador = (j, sala) =>
  el('li', { class: `chip-jogador${j.ligado ? '' : ' desligado'}` },
    el('span', { class: 'ponto', style: { background: j.cor } }),
    j.nome,
    j.id === sala.anfitriao ? el('span', { class: 'coroa', title: 'Anfitrião', text: '👑' }) : null);

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export function renderLobby(sala, eu, catalogo, enviar) {
  const anfitriao = sala.anfitriao === eu;
  $('#lobby-sala').hidden = sala.solo;
  $('#lobby-jogadores-bloco').hidden = sala.solo;
  $('#lobby-codigo').textContent = sala.codigo;
  $('#lobby-jogadores').replaceChildren(...sala.jogadores.map((j) => chipJogador(j, sala)));

  const equipas = catalogo?.equipas ?? [];
  const contagens = catalogo?.contagens ?? {};
  $('#cfg-conteudo').replaceChildren(
    ...CONTEUDOS.map((c) => {
      const n = c.chave ? contagens[c.chave] ?? 0 : equipas.length;
      const sufixo = c.chave ? plural(n, 'jogo', 'jogos') : plural(n, 'equipa', 'equipas');
      return el('button', {
        class: 'segmento',
        type: 'button',
        role: 'radio',
        'aria-checked': String(sala.config.conteudo === c.id),
        disabled: !anfitriao || !n,
        onclick: () => enviar({ t: 'config', conteudo: c.id }),
      }, c.nome, el('small', { text: sufixo }));
    }),
  );

  const blocoEquipa = $('#cfg-equipa-bloco');
  blocoEquipa.hidden = sala.config.conteudo !== 'equipa';
  const select = $('#cfg-equipa');
  select.disabled = !anfitriao;
  const atual = [...select.options].map((o) => o.value).join();
  if (atual !== equipas.map((e) => e.slug).join()) {
    select.replaceChildren(...equipas.map((e) => el('option', { value: e.slug, text: `${e.nome} (${plural(e.jogos, 'jogo', 'jogos')})` })));
  }
  if (sala.config.equipa) select.value = sala.config.equipa;
  select.onchange = () => enviar({ t: 'config', conteudo: 'equipa', equipa: select.value });

  $('#cfg-rondas').replaceChildren(
    ...RONDAS.map((n) =>
      el('button', {
        class: 'segmento',
        type: 'button',
        role: 'radio',
        'aria-checked': String(sala.config.rondas === n),
        disabled: !anfitriao,
        onclick: () => enviar({ t: 'config', rondas: n }),
      }, String(n)),
    ),
  );

  const duracao = sala.solo ? '5:00' : '3:00';
  const rondas = Math.min(sala.config.rondas, sala.disponiveis);
  $('#cfg-resumo').textContent = sala.disponiveis
    ? `${plural(sala.disponiveis, 'jogo', 'jogos')} por jogar · ${plural(rondas, 'ronda', 'rondas')} de ${duracao} (+5 s por acerto)`
    : 'Já jogaram todos os jogos deste conteúdo nesta sala.';
  $('#btn-comecar').hidden = !anfitriao;
  $('#btn-comecar').disabled = !sala.disponiveis;
  $('#btn-repor').hidden = !anfitriao || sala.disponiveis > 0;
  $('#lobby-espera').hidden = anfitriao;
}

// ---------------------------------------------------------------------------
// Jogo
// ---------------------------------------------------------------------------

export function renderCabecalho(sala) {
  const r = sala.ronda;
  const p = sala.partida;
  $('#jogo-ronda').textContent = p ? `Ronda ${p.numero}/${p.total}` : '';
  $('#jogo-competicao').textContent = r ? `${r.jogo.competicao}${r.jogo.fase ? ` · ${r.jogo.fase}` : ''}${r.jogo.titulo ? ` · ${r.jogo.titulo}` : ''}` : '';
  // Equipas e resultado, estádio e cidade, data.
  $('#jogo-resultado').textContent = r?.jogo.resultado ?? '';
  $('#jogo-local').textContent = r?.jogo.estadio ?? '';
  $('#jogo-data').textContent = r ? formatarData(r.jogo.data) : '';
  $('#jogo-sala').textContent = sala.solo ? '' : sala.codigo;
}

function textoFeed(ev, nomeDe) {
  const quem = (id) => el('span', { class: 'destaque', style: { color: nomeDe(id)?.cor }, text: nomeDe(id)?.nome ?? '?' });
  switch (ev.tipo) {
    case 'descoberta':
      return [quem(ev.jogador), ' descobriu ', el('strong', { text: ev.nome }), ' ', el('span', { class: 'pontos', text: `+${ev.pontos}` }),
        ev.bonus ? el('span', { class: 'pontos', text: ` · fechou o jogo +${ev.bonus}` }) : null];
    case 'pista':
      return [el('span', { class: 'sistema', text: `Pista: ${nomePista(ev)}` })];
    case 'fim':
      return [el('span', { class: 'sistema', text: ev.motivo === 'completo' ? 'Onze completo!' : 'Acabou o tempo!' })];
    case 'ronda':
      return [el('span', { class: 'sistema', text: `Começou a ronda ${ev.numero}` })];
    case 'entrou':
      return [quem(ev.jogador), el('span', { class: 'sistema', text: ' entrou na sala' })];
    case 'anfitriao':
      return [quem(ev.jogador), el('span', { class: 'sistema', text: ' é agora o anfitrião' })];
    case 'final':
      return [el('span', { class: 'sistema', text: 'Fim do jogo' })];
    default:
      return null;
  }
}

export function renderFeed(sala) {
  const porId = new Map(sala.jogadores.map((j) => [j.id, j]));
  const itens = [...sala.feed].reverse().slice(0, 12)
    .map((ev) => {
      const conteudo = textoFeed(ev, (id) => porId.get(id));
      return conteudo ? el('li', { 'data-seq': ev.seq }, ...conteudo) : null;
    })
    .filter(Boolean);
  // Só recria se mudou (evita repetir a animação de entrada).
  const lista = $('#feed');
  if (lista.firstElementChild?.dataset.seq === itens[0]?.dataset.seq && lista.children.length === itens.length) return;
  lista.replaceChildren(...itens);
}

export function renderFicha(sala) {
  const r = sala.ronda;
  $('#ficha').hidden = sala.fase !== 'ficha';
  if (sala.fase !== 'ficha' || !r) return;
  $('#ficha-competicao').textContent = `${r.jogo.competicao}${r.jogo.fase ? ` · ${r.jogo.fase}` : ''}`;
  $('#ficha-titulo').textContent = r.jogo.titulo ?? '';
  $('#ficha-resultado').textContent = r.jogo.resultado;
  $('#ficha-data').textContent = formatarData(r.jogo.data);
  $('#ficha-estadio').textContent = r.jogo.estadio;
  $('#ficha-equipas').replaceChildren(
    ...r.equipas.map((e) =>
      el('li', {},
        el('span', {}, el('span', { class: 'ponto', style: { background: e.cor ?? '#e5e7eb', display: 'inline-block', marginRight: '8px' } }), e.nome),
        el('span', { class: 'formacao', text: e.formacao }))),
  );
}

/**
 * Classificação sempre visível. No fim da ronda passa a "Fim da ronda N/M", com o resumo
 * e o botão do anfitrião para a próxima ronda.
 */
export function renderPlacar(sala, eu, anterior, enviar) {
  const p = sala.partida;
  const r = sala.ronda;
  const terminou = sala.fase === 'fim' || sala.fase === 'final';
  $('#jogo-grelha').classList.toggle('terminada', terminou);
  $('#placar-titulo').textContent =
    sala.fase === 'final' ? 'Jogo terminado' : sala.fase === 'fim' ? `Fim da ronda ${p?.numero ?? ''}/${p?.total ?? ''}` : 'Classificação';
  $('#placar-resumo').textContent =
    terminou && r ? `Descobriram ${r.descobertos} de ${r.total} posições. O que ficou por descobrir está a cinzento.` : '';

  $('#placar-tabela').replaceChildren(
    ...ordenar(sala.jogadores).map((j) => {
      const subiu = anterior?.get(j.id) !== undefined && anterior.get(j.id) < j.total;
      return el('tr', { class: [j.id === eu ? 'eu' : '', j.ligado ? '' : 'desligado', subiu ? 'subiu' : ''].filter(Boolean).join(' ') || null },
        el('td', { text: `${j.posicao}.` }),
        el('td', {},
          el('span', { class: 'celula-jogador' },
            el('span', { class: 'ponto', style: { background: j.cor } }),
            el('span', { class: 'nome-jogador' }, j.nome, j.id === sala.anfitriao ? ' 👑' : '', j.id === eu ? ' (tu)' : ''))),
        el('td', { class: 'mais', text: j.ronda ? `+${j.ronda}` : '0' }),
        el('td', { class: 'total-celula', text: String(j.total) }));
    }),
  );

  const anfitriao = sala.anfitriao === eu;
  const ultima = p && p.numero >= p.total;
  const botao = $('#btn-proxima');
  if (sala.fase === 'final') {
    botao.hidden = false;
    botao.textContent = 'Ver classificação final';
    botao.onclick = () => mostrarFinal(true);
  } else {
    botao.hidden = !(sala.fase === 'fim' && anfitriao);
    botao.textContent = ultima ? 'Ver classificação final' : 'Próxima ronda';
    botao.onclick = () => enviar({ t: 'proxima' });
  }
  $('#placar-espera').hidden = !(sala.fase === 'fim' && !anfitriao);
}

let finalEscondido = false;
export function mostrarFinal(mostrar) {
  finalEscondido = !mostrar;
  $('#final').hidden = !mostrar;
}

export function renderFinal(sala, eu) {
  if (sala.fase !== 'final') {
    finalEscondido = false;
    $('#final').hidden = true;
    return;
  }
  $('#final').hidden = finalEscondido;
  const lista = ordenar(sala.jogadores);
  const ordemPodio = [lista[1], lista[0], lista[2]];
  $('#podio').replaceChildren(
    ...ordemPodio.map((j, i) => {
      if (!j) return el('li');
      const lugar = [2, 1, 3][i];
      return el('li', { class: `degrau p${lugar}` },
        el('span', { class: 'quem' }, el('span', { class: 'ponto', style: { background: j.cor } }), j.nome),
        el('span', { class: 'pts', text: plural(j.total, 'ponto', 'pontos') }),
        el('span', { class: 'bloco', text: String(j.posicao) }));
    }),
  );
  $('#final-tabela').replaceChildren(
    ...lista.map((j) =>
      el('tr', {},
        el('td', { text: String(j.posicao) }),
        el('td', {}, el('span', { class: 'celula-jogador' }, el('span', { class: 'ponto', style: { background: j.cor } }), j.nome, j.id === eu ? ' (tu)' : '')),
        el('td', { text: String(j.total) }))),
  );
  const anfitriao = sala.anfitriao === eu;
  $('#btn-novo').hidden = !anfitriao;
  $('#final-espera').hidden = anfitriao;
}

/** Atualiza relógio, barra de tempo, marcas das pistas e contagem da ficha. */
export function tick(sala, agora) {
  const r = sala?.ronda;
  if (!r) return;
  if (sala.fase === 'ficha') {
    const n = String(Math.max(1, Math.ceil((r.fichaAte - agora) / 1000)));
    const contagem = $('#ficha-contagem');
    if (contagem.textContent !== n) {
      contagem.textContent = n;
      contagem.classList.remove('bater');
      void contagem.offsetWidth;
      contagem.classList.add('bater');
    }
  }
  const correr = sala.fase === 'ronda';
  const restante = correr ? Math.max(0, r.fim - agora) : sala.fase === 'ficha' ? r.duracaoBase : 0;
  const relogio = $('#relogio');
  relogio.textContent = formatarTempo(restante);
  relogio.classList.toggle('urgente', correr && restante <= 30_000);
  // A barra mostra quanto do tempo inicial já se gastou: recua quando um acerto dá +5 s.
  const consumido = sala.fase === 'ficha' ? 0 : correr ? 1 - restante / r.duracaoBase : 1;
  $('#barra-tempo-enchimento').style.width = `${Math.min(100, Math.max(0, consumido * 100))}%`;
  const pistas = r.pistas ?? [];
  document.querySelectorAll('.marca-pista').forEach((m) => {
    const i = pistas.findIndex((p) => p.tipo === m.dataset.tipo);
    m.hidden = i < 0;
    if (i < 0) return;
    m.style.left = `${pistas[i].fracao * 100}%`;
    m.classList.toggle('ativa', r.nivelPista > i);
  });
  $('#contador').textContent = `${r.descobertos}/${r.total} descobertos`;
}
