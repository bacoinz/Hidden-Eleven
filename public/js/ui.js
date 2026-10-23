// Pedaços da interface: lobby, classificação, feed, ficha, fim de ronda, pódio, relógio e avisos.
import { $, el, formatarData, formatarTempo, nomePista } from './util.js';

const CONTEUDOS = [
  { id: 'finais', nome: 'Finais', chave: 'finais' },
  { id: 'classicos', nome: 'Clássicos', chave: 'classicos' },
  { id: 'equipa', nome: 'Equipa Mítica', chave: null },
  { id: 'aleatorio', nome: 'Aleatório', chave: 'aleatorio' },
];
const RONDAS = [3, 5, 10];
const MODOS = [
  { id: 'normal', nome: 'Todos', ajuda: 'todos descobrem tudo' },
  { id: 'duelo', nome: 'Duelo', ajuda: 'cada um a sua equipa' },
];

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
    j.id === sala.anfitriao ? el('span', { class: 'coroa', title: 'Anfitrião', text: '👑' }) : null,
    j.espectador ? el('span', { class: 'coroa', title: 'A ver', text: '👁' }) : null);

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

  $('#cfg-modo-bloco').hidden = sala.solo;
  const modo = sala.config.modo ?? 'normal';
  $('#cfg-modo').replaceChildren(
    ...MODOS.map((m) => {
      const semDuelo = m.id === 'duelo' && sala.config.conteudo === 'equipa';
      return el('button', {
        class: 'segmento',
        type: 'button',
        role: 'radio',
        'aria-checked': String(modo === m.id),
        disabled: !anfitriao || semDuelo,
        title: semDuelo ? 'O duelo precisa das duas equipas: escolhe outro conteúdo.' : m.ajuda,
        onclick: () => enviar({ t: 'config', modo: m.id }),
      }, m.nome, el('small', { text: m.ajuda }));
    }),
  );

  const duracao = sala.solo ? '6:00' : '4:00';
  const rondas = Math.min(sala.config.rondas, sala.disponiveis);
  $('#cfg-resumo').textContent = sala.disponiveis
    ? `${plural(sala.disponiveis, 'jogo', 'jogos')} por jogar · ${plural(rondas, 'ronda', 'rondas')} de ${duracao} (+1 s por acerto)`
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
      return [el('span', { class: 'sistema', text: { completo: 'Tudo descoberto!', votacao: 'Ronda terminada com o onze completo.', duelo: 'Onze fechado!', passou: 'Ronda passada: cada um fica com metade dos pontos dela.' }[ev.motivo] ?? 'Acabou o tempo!' })];
    case 'corte':
      return [quem(ev.jogador), ' passou a ronda ', el('span', { class: 'pontos negativo', text: `−${Math.abs(ev.pontos)}` })];
    case 'duelo':
      return ev.equipa
        ? [el('span', { class: 'sistema', text: `Duelo ganho pelo ${ev.equipa}: ` }), ...ev.vencedores.flatMap((id, i) => [i ? ', ' : '', quem(id)]), el('span', { class: 'pontos', text: ` +${ev.bonus}` })]
        : [el('span', { class: 'sistema', text: 'Duelo empatado.' })];
    case 'promovido':
      return [quem(ev.jogador), el('span', { class: 'sistema', text: ' passou a jogar' })];
    case 'ronda':
      return [el('span', { class: 'sistema', text: `Começou a ronda ${ev.numero}` })];
    case 'entrou':
      return [quem(ev.jogador), el('span', { class: 'sistema', text: ev.espectador ? ' está a ver' : ' entrou na sala' })];
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

  const lados = r?.lados ?? null;
  const equipaDe = (id) => (lados && lados[id] !== undefined ? r.equipas.find((e) => e.indice === lados[id]) : null);
  $('#placar-tabela').replaceChildren(
    ...ordenar(sala.jogadores.filter((j) => !j.espectador)).map((j) => {
      const subiu = anterior?.get(j.id) !== undefined && anterior.get(j.id) < j.total;
      return el('tr', { class: [j.id === eu ? 'eu' : '', j.ligado ? '' : 'desligado', subiu ? 'subiu' : ''].filter(Boolean).join(' ') || null },
        el('td', { text: `${j.posicao}.` }),
        el('td', {},
          el('span', { class: 'celula-jogador' },
            el('span', { class: 'ponto', style: { background: j.cor } }),
            el('span', { class: 'nome-jogador' }, j.nome, j.id === sala.anfitriao ? ' 👑' : '', j.id === eu ? ' (tu)' : ''),
            equipaDe(j.id) ? el('span', { class: 'lado', title: equipaDe(j.id).nome, style: { background: equipaDe(j.id).cor ?? '#e5e7eb' } }) : null)),
        el('td', { class: 'mais', text: j.ronda ? `+${j.ronda}` : '0' }),
        el('td', { class: 'total-celula', text: String(j.total) }));
    }),
  );

  const espectadores = sala.jogadores.filter((j) => j.espectador && j.ligado).map((j) => j.nome);
  if (espectadores.length) {
    const resumo = $('#placar-resumo');
    resumo.textContent = `${resumo.textContent}${resumo.textContent ? ' ' : ''}A ver: ${espectadores.join(', ')}.`;
  }
  renderEstatisticas(sala, eu, terminou);

  const anfitriao = sala.anfitriao === eu;
  const ultima = p && p.numero >= p.total;
  const botao = $('#btn-proxima');
  const espera = $('#placar-espera');
  espera.hidden = true;
  if (sala.fase === 'final') {
    botao.hidden = false;
    botao.textContent = 'Ver classificação final';
    botao.onclick = () => mostrarFinal(true);
  } else if (sala.fase === 'ronda' && r?.onzeCompleto) {
    // Onze todo descoberto: pode terminar-se a ronda sem os suplentes e treinadores.
    const votos = r.votosTerminar ?? [];
    const ligados = sala.jogadores.filter((j) => j.ligado && !j.espectador);
    const votei = votos.includes(eu);
    botao.hidden = false;
    botao.textContent = sala.solo
      ? 'Terminar ronda'
      : votei
        ? `Cancelar · ${votos.length}/${ligados.length} confirmaram`
        : `Terminar ronda (${votos.length}/${ligados.length})`;
    botao.onclick = () => enviar({ t: 'terminar' });
    $('#placar-resumo').textContent = sala.solo
      ? 'Onze completo! Podes terminar já, sem os suplentes e os treinadores.'
      : 'Onze completo! Para terminar já, todos têm de confirmar.';
    const faltam = ligados.filter((j) => !votos.includes(j.id)).map((j) => j.nome);
    if (!sala.solo && votos.length && faltam.length) {
      espera.hidden = false;
      espera.textContent = `À espera de: ${faltam.join(', ')}`;
    }
  } else {
    botao.hidden = !(sala.fase === 'fim' && anfitriao);
    botao.textContent = ultima ? 'Ver classificação final' : 'Próxima ronda';
    botao.onclick = () => enviar({ t: 'proxima' });
    if (sala.fase === 'fim' && !anfitriao) {
      espera.hidden = false;
      espera.textContent = 'À espera do anfitrião…';
    }
  }
}

/**
 * Botão "Passar ronda": quando ninguém sabe mais, todos confirmam e a ronda acaba,
 * ficando cada um com metade dos pontos que fez nela. Com o onze completo, usa-se o "Terminar ronda".
 */
export function renderPassar(sala, eu, enviar) {
  const r = sala.ronda;
  const euJogo = sala.jogadores.find((j) => j.id === eu);
  const caixa = $('#passar');
  caixa.hidden = !(sala.fase === 'ronda' && r && !r.onzeCompleto && euJogo && !euJogo.espectador);
  if (caixa.hidden) return;
  const votos = r.votosPassar ?? [];
  const ligados = sala.jogadores.filter((j) => j.ligado && !j.espectador);
  const votei = votos.includes(eu);
  const botao = $('#btn-passar');
  botao.classList.toggle('ativo', votei);
  botao.textContent = sala.solo
    ? 'Passar ronda'
    : votei
      ? `Cancelar · ${votos.length}/${ligados.length} querem passar`
      : `Passar ronda (${votos.length}/${ligados.length})`;
  botao.onclick = () => enviar({ t: 'passar' });
  const faltam = ligados.filter((j) => !votos.includes(j.id)).map((j) => j.nome);
  $('#passar-nota').textContent =
    !sala.solo && votos.length && faltam.length
      ? `À espera de: ${faltam.join(', ')} · ao passar, ficas com metade dos pontos da ronda.`
      : sala.solo
        ? 'Não sabes mais? Ao passar, ficas com metade dos pontos desta ronda.'
        : 'Ninguém sabe mais? Todos têm de confirmar e cada um fica com metade dos pontos da ronda.';
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
  // A barra mostra quanto do tempo inicial já se gastou: recua quando um acerto dá +1 s.
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

// ---------------------------------------------------------------------------
// Estatísticas no fim da ronda
// ---------------------------------------------------------------------------

const precisao = (c, e) => (c + e ? `${Math.round((100 * c) / (c + e))}%` : '–');

function renderEstatisticas(sala, eu, terminou) {
  const bloco = $('#placar-stats');
  const r = sala.ronda;
  bloco.hidden = !terminou || !r;
  if (bloco.hidden) return;
  const final = sala.fase === 'final';
  const jogadores = sala.jogadores.filter((j) => !j.espectador);
  const st = (j) => (final ? { ...j.stats, primeiroMs: null } : r.stats?.[j.id] ?? { certos: 0, errados: 0, primeiroMs: null });
  const taxa = (x) => x.certos / Math.max(1, x.certos + x.errados);
  const linhas = [...jogadores].sort((a, b) => st(b).certos - st(a).certos || st(a).errados - st(b).errados);
  const destaques = [];
  const rapido = jogadores.filter((j) => st(j).primeiroMs != null).sort((a, b) => st(a).primeiroMs - st(b).primeiroMs)[0];
  if (rapido) destaques.push(el('li', {}, '⚡ Primeiro acerto: ', el('strong', { style: { color: rapido.cor }, text: rapido.nome }), ` (${formatarTempo(st(rapido).primeiroMs)})`));
  const certeiro = jogadores.filter((j) => st(j).certos >= 2).sort((a, b) => taxa(st(b)) - taxa(st(a)))[0];
  if (certeiro && jogadores.length > 1) destaques.push(el('li', {}, '🎯 Mais certeiro: ', el('strong', { style: { color: certeiro.cor }, text: certeiro.nome }), ` (${precisao(st(certeiro).certos, st(certeiro).errados)})`));
  bloco.replaceChildren(
    el('h3', { class: 'painel-subtitulo', text: final ? 'Estatísticas do jogo' : 'Estatísticas da ronda' }),
    destaques.length ? el('ul', { class: 'destaques' }, ...destaques) : null,
    el('table', { class: 'tabela tabela-stats' },
      el('thead', {}, el('tr', {},
        el('th', { text: 'Jogador' }), el('th', { title: 'Acertos', text: '✓' }), el('th', { title: 'Nomes errados', text: '✗' }),
        el('th', { title: 'Precisão', text: '%' }), el('th', { title: 'Tempo até ao primeiro acerto', text: '1.º' }))),
      el('tbody', {},
        ...linhas.map((j) => {
          const x = st(j);
          return el('tr', { class: j.id === eu ? 'eu' : null },
            el('td', {}, el('span', { class: 'celula-jogador' }, el('span', { class: 'ponto', style: { background: j.cor } }), el('span', { class: 'nome-jogador', text: j.nome }))),
            el('td', { text: String(x.certos ?? 0) }),
            el('td', { text: String(x.errados ?? 0) }),
            el('td', { text: precisao(x.certos ?? 0, x.errados ?? 0) }),
            el('td', { text: x.primeiroMs != null ? formatarTempo(x.primeiroMs) : '–' }));
        }))),
  );
}

// ---------------------------------------------------------------------------
// Marcador no fim da ronda (golos e entradas do banco, por minuto)
// ---------------------------------------------------------------------------

/** "90+2" → 90.02; 105 → 105. */
const valorMinuto = (m) => {
  const [a, b] = String(m).split('+').map(Number);
  return a + (b || 0) / 100;
};

export function eventosDoJogo(ronda) {
  const eventos = [];
  for (const e of ronda.equipas) {
    for (const l of [...e.onze, ...e.suplentes]) {
      for (const g of l.golos ?? []) {
        // Autogolo: conta para a outra equipa.
        const outra = ronda.equipas.find((x) => x.indice !== e.indice);
        const marca = g.autogolo && outra ? outra.indice : e.indice;
        eventos.push({ tipo: 'golo', minuto: g.minuto, equipa: marca, nome: l.curto ?? l.nome ?? '?', penalti: g.penalti, autogolo: g.autogolo });
      }
    }
    for (const l of e.suplentes) eventos.push({ tipo: 'entrada', minuto: l.minuto, equipa: e.indice, nome: l.curto ?? l.nome ?? '?' });
  }
  eventos.sort((a, b) => valorMinuto(a.minuto) - valorMinuto(b.minuto) || (a.tipo === 'golo' ? -1 : 1));
  const golos = Object.fromEntries(ronda.equipas.map((e) => [e.indice, 0]));
  for (const ev of eventos) {
    if (ev.tipo !== 'golo') continue;
    golos[ev.equipa] = (golos[ev.equipa] ?? 0) + 1;
    ev.marcador = ronda.equipas.map((e) => golos[e.indice]).join('–');
  }
  return eventos;
}

export function renderMarcador(sala) {
  const r = sala.ronda;
  const mostrar = Boolean(r) && (sala.fase === 'fim' || sala.fase === 'final');
  $('#marcador').hidden = !mostrar;
  $('#feed').hidden = mostrar;
  $('#feed-titulo').textContent = mostrar ? 'Marcador' : 'Acontecimentos';
  if (!mostrar) return;
  const cor = (i) => r.equipas.find((e) => e.indice === i)?.cor ?? '#e5e7eb';
  const eventos = eventosDoJogo(r);
  // Ronda passada: os cortes (metade dos pontos) ficam no topo, como no feed.
  const desdeRonda = sala.feed.slice(sala.feed.findLastIndex((ev) => ev.tipo === 'ronda') + 1);
  const porId = new Map(sala.jogadores.map((j) => [j.id, j]));
  const cortes = r.passada ? desdeRonda.filter((ev) => ev.tipo === 'fim' || ev.tipo === 'corte') : [];
  $('#marcador').replaceChildren(
    ...cortes.map((ev) => el('li', { class: 'marcador-corte' }, ...textoFeed(ev, (id) => porId.get(id)))),
    el('li', { class: 'marcador-topo', text: r.jogo.resultado }),
    ...(eventos.length
      ? eventos.map((ev) =>
          el('li', { class: `marcador-ev ${ev.tipo}` },
            el('span', { class: 'minuto', text: `${ev.minuto}'` }),
            el('span', { class: 'lado', style: { background: cor(ev.equipa) } }),
            ev.tipo === 'golo'
              ? el('span', {}, '⚽ ', el('strong', { text: ev.nome }), ev.penalti ? ' (g.p.)' : '', ev.autogolo ? ' (p.b.)' : '', el('span', { class: 'parcial', text: ` ${ev.marcador}` }))
              : el('span', { class: 'entrada' }, '⬆ ', ev.nome)))
      : [el('li', { class: 'nota', text: 'Sem golos nem substituições registadas.' })]),
  );
}

/** Aviso por baixo do relógio: a equipa no duelo, ou que estás a ver. */
export function renderPapel(sala, eu) {
  const papel = $('#papel');
  const euJogador = sala.jogadores.find((j) => j.id === eu);
  const r = sala.ronda;
  let texto = '';
  let cor = null;
  if (euJogador?.espectador) texto = sala.solo ? '👁 Estás a ver' : '👁 Estás a ver · jogas a partir da próxima ronda';
  else if (r?.lados && r.lados[eu] !== undefined) {
    const e = r.equipas.find((x) => x.indice === r.lados[eu]);
    if (e) {
      texto = `⚔ Duelo · a tua equipa: ${e.nome}`;
      cor = e.cor;
    }
  }
  papel.hidden = !texto;
  papel.textContent = texto;
  papel.style.setProperty('--cor-lado', cor ?? 'transparent');
}
