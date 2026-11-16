// Worker: cria salas, encaminha WebSockets para o Durable Object da sala e serve o frontend.
import { ALFABETO_CODIGO } from './regras.js';

export { Sala } from './sala.js';

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function gerarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
}

async function criarSala(request, env) {
  let corpo = {};
  try {
    corpo = await request.json();
  } catch {
    // corpo vazio: sala multijogador sem token de anfitrião
  }
  const solo = corpo.solo === true;
  const anfitriaoToken = typeof corpo.token === 'string' && corpo.token.length <= 64 ? corpo.token : null;
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const codigo = gerarCodigo();
    const { ok } = await env.SALAS.getByName(codigo).criar({ codigo, solo, anfitriaoToken });
    if (ok) return json({ codigo });
  }
  return json({ erro: 'Não foi possível criar a sala. Tenta outra vez.' }, 503);
}

/** A página da sala é o mesmo index.html, com o título da pré-visualização do Discord adaptado. */
async function paginaSala(request, env, codigo) {
  const pagina = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  // A pré-visualização (Discord…) segue a língua de quem pede; sem português, fica em inglês.
  const pt = /^pt\b/i.test(request.headers.get('accept-language') ?? '');
  const titulo = pt ? `Hidden Eleven · Sala ${codigo}` : `Hidden Eleven · Room ${codigo}`;
  const descricao = pt
    ? `Entra na sala ${codigo} e descobre o onze escondido com os teus amigos.`
    : `Join room ${codigo} and uncover the hidden line-up with your friends.`;
  return new HTMLRewriter()
    .on('meta[property="og:title"]', { element: (el) => el.setAttribute('content', titulo) })
    .on('meta[property="og:description"]', { element: (el) => el.setAttribute('content', descricao) })
    .on('meta[name="description"]', { element: (el) => el.setAttribute('content', descricao) })
    .transform(pagina);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/salas' && request.method === 'POST') return criarSala(request, env);

    const info = pathname.match(/^\/api\/salas\/([A-Za-z]{4})$/);
    if (info && request.method === 'GET') return json(await env.SALAS.getByName(info[1].toUpperCase()).info());

    const ws = pathname.match(/^\/ws\/([A-Za-z]{4})$/);
    if (ws) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Esperava um WebSocket.', { status: 426 });
      return env.SALAS.getByName(ws[1].toUpperCase()).fetch(request);
    }

    const sala = pathname.match(/^\/sala\/([A-Za-z]{4})\/?$/);
    if (sala) return paginaSala(request, env, sala[1].toUpperCase());

    if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return json({ erro: 'Não encontrado.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
