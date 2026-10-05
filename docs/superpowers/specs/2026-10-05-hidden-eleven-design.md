# Hidden Eleven — plano de implementação

## Contexto

A pasta `C:\AI Projects\HiddenEleven` está vazia; não há código para reaproveitar. O ambiente tem Node 24, npm 11 e git 2.54; o wrangler vai como dependência de desenvolvimento.

O objetivo é um jogo multiplayer em tempo real para jogar com amigos através de um link no Discord. Aparece o onze de um jogo real com os nomes escondidos, e quem escrever primeiro o nome certo fica com a posição. Tudo corre em Cloudflare Workers com Durable Objects, no plano gratuito, e a interface é em português de Portugal.

**Decisões fechadas contigo**
- A 2.ª versão da especificação prevalece nos números: ficha de 7 s, pistas aos 20/35/50 %, erro com 1 s de penalização e +5 s por acerto.
- Os modos organizam-se por **tipo + conteúdo**.
  - Tipo: *Multijogador* (botão "Criar sala", 3:00) ou *Solo* (botão "Jogar sozinho", 5:00). Ambos ganham +5 s por cada acerto.
  - Conteúdo, escolhido pelo anfitrião: *Finais*, *Clássicos*, *Equipa Mítica* ou *Aleatório*. Na Equipa Mítica só a equipa escolhida está em campo, ocupando o relvado inteiro.
- A base de dados é **completa**: 41 finais e cerca de 28 clássicos (cerca de 69 jogos), verificados nas fontes indicadas mais abaixo.
- Um nome errado **bloqueia a caixa durante 1 s**, só a quem errou. O servidor também impõe esse bloqueio.
- No fim, **publico na tua conta Cloudflare**. Tu corres `npx wrangler login`; eu faço o deploy para `*.workers.dev`.

**Sugestões minhas incluídas no plano** (se não quiseres alguma, diz e sai):
1. Apelido ambíguo (ex.: "Cole" na final da LC de 2008) responde "Há mais do que um — escreve o nome completo!", **sem** penalização.
2. Gralhas por troca de letras contam como 1 erro (distância de Damerau): "drogab" é aceite como Drogba.
3. Um nome real de outro jogo da base não é "corrigido" para outra pessoa. Se só o Ronaldo está em campo, escrever "Rivaldo" conta como erro, mesmo estando a distância 2 de "Ronaldo".
4. Se o teu nome descobriu a posição, a resposta é "Já é teu!". Se o anfitrião sair por mais de 20 s, o papel passa ao jogador seguinte.
5. O link da sala aparece no Discord com título "Hidden Eleven · Sala ABCD" e cor azul.
6. As bandeiras são SVG servidos pela app, porque no Windows os emojis de bandeiras não aparecem. As fontes Anton e Inter também são servidas pela app, sem Google Fonts.
7. As camisolas mostram um nome curto (ex.: "R. Carvalho"), que se pode substituir com o campo opcional `curto`.

## Regras implementadas (resumo)

| Item | Valor |
|---|---|
| Ficha do jogo | 7 s: competição/fase, data, estádio, resultado e formações; treinadores escondidos |
| Duração base | Multi 3:00 · Solo 5:00 · +5 s por cada descoberta nova |
| Pistas (só no onze por descobrir) | número aos 20 %, bandeira aos 35 %, inicial do apelido aos 50 % **da duração base**, sem efeito das extensões. Multi: 0:36, 1:03, 1:30. Solo: 1:00, 1:45, 2:30 |
| Pontos | onze 5/4/3/2 conforme as pistas já reveladas · suplente 3 · treinador 3 · +2 por fechar a última posição |
| Respostas | errado → bloqueio de 1 s · já descoberto → "Já é de Rui!" · suplente não utilizado → "Ficou no banco!" · ambíguo → pede o nome completo. Só o errado tem penalização |
| Fim da ronda | o tempo acaba ou tudo é descoberto; o que fica por descobrir aparece a cinzento; placar da ronda e acumulado; botão "Próxima ronda" para o anfitrião |
| Fim do jogo | pódio e botão "Novo jogo": mantém a sala e não repete os jogos já usados nela |
| Sala | código de 4 letras sem I nem O; `/sala/ABCD`; até 10 jogadores, um por cor da paleta; rondas 3/5/10, limitadas aos jogos ainda por usar |

## Arquitetura

```
Browser (HTML/CSS/JS, módulos ES, sem bundler)
   │  HTTP: /, /sala/ABCD, /api/salas      WebSocket: /ws/ABCD
   ▼
Worker  src/index.js ── rotas, cria salas, injeta meta OG em /sala/*, serve public/
   │  env.SALAS.idFromName(código)
   ▼
Durable Object "Sala" (SQLite, 1 por código) src/sala.js
   ├─ WebSockets com hibernação (acceptWebSocket, anexo com id do jogador, ping/pong automático)
   ├─ estado único persistido em ctx.storage a cada mudança, recarregado no construtor
   ├─ UM alarme: o próximo prazo (fim da ficha, pistas, fim da ronda, troca de anfitrião, limpeza após 2 h vazia)
   └─ delega toda a lógica em módulos puros e testáveis:
        motor.js (ronda/pontos/pistas)  nomes.js (matcher)  catalogo.js (jogos)  regras.js (constantes)
```

- **Dados**: os ficheiros `data/jogos/*.json` entram no bundle do Worker através de `src/dados.gen.js`. Esse ficheiro é gerado por `scripts/gerar-dados.mjs`, que o wrangler corre automaticamente (`build.command`). Os JSON **nunca** são servidos como ficheiros estáticos, por isso os nomes escondidos não chegam ao browser. O `estadoPublico()` só inclui o nome, número, país e inicial quando já foram revelados.
- **Plano gratuito**: o Durable Object usa SQLite (`new_sqlite_classes`), obrigatório no plano grátis. As mensagens WebSocket contam 1/20 de pedido e a hibernação evita custo de duração. A folga é enorme para um grupo de amigos.
- **Relógio**: o servidor envia `agora` em cada mensagem e o cliente calcula o desvio. O contador visível usa `fim - (Date.now() + desvio)`. Os pontos dependem do nível de pista calculado pela hora no servidor e não do momento em que o alarme dispara.
- Detalhes da API (hibernação, `run_worker_first`, data de compatibilidade) a confirmar na documentação atual da Cloudflare ao implementar.

## Estrutura de ficheiros

```
wrangler.jsonc   package.json   vitest.config.js   README.md   .gitignore
src/  index.js · sala.js · motor.js · nomes.js · catalogo.js · regras.js · dados.gen.js (gerado)
data/ jogos/*.json · equipas.json (slug → nome, destaque na lista da Equipa Mítica)
public/ index.html · css/app.css · js/{app,ligacao,relvado,formacao,ui,util}.js
        bandeiras/*.svg (flag-icons, MIT) · fontes/*.woff2 (Anton + Inter, OFL) · favicon.svg
scripts/ gerar-dados.mjs · importar-wikipedia.mjs · fontes.json · validar-dados.mjs · copiar-assets.mjs · e2e.mjs
test/ nomes.test.js · motor.test.js · formacao.test.js · dados.test.js
docs/superpowers/specs/2026-10-05-hidden-eleven-design.md (cópia deste plano)
```

## Formato dos dados

O formato é o teu. Acrescento apenas campos opcionais, todos verificados pelo validador:
- **jogo**:
  - `fase` ("Final", "Meia-final"…), `titulo` (ex.: "A Batalha de Nuremberga") e `fonte` (URL).
  - O `resultado` usa "(a.p.)" para prolongamento e "(5–3 g.p.)" para penáltis.
- **equipa**: `slug` (obrigatório se `modos` tiver `equipa:<slug>`) e `cor` do equipamento, usada como detalhe nas camisolas escondidas.
- **pessoa**:
  - `curto` substitui o rótulo da camisola; `inicial` substitui a pista 3, para casos como "van der Sar".
  - `pais` usa ISO 3166-1 alfa-2, mais GB-ENG/GB-SCT/GB-WLS/GB-NIR, e é a nacionalidade desportiva (Deco = PT).
- **suplentes**: `numero` opcional; `minuto` aceita número ou texto ("90+2").
- `nao_utilizados` aceita texto ou `{nome, aceites}`.
- `modos` aceita `final` (só finais da LC, do Mundial e do Euro), `classico` (todos os outros jogos) e `equipa:<slug>`.
- A ordem dentro de cada linha do onze vai da direita para a esquerda, como na Wikipédia.

## Validação de nomes — `src/nomes.js` (módulo isolado, TDD)

- **`normalizar`**:
  - Passa a minúsculas e retira acentos com NFD.
  - Converte letras especiais: ø→o, ł→l, ß→ss, æ→ae, œ→oe, đ→d e ı→i.
  - Apaga apóstrofos (n'golo → ngolo).
  - Troca restante pontuação e hífenes por espaço e simplifica os espaços.
- **Chaves de cada pessoa**, com prioridade: nome completo (3) > `aceites` (2) > apelido automático (1).
  - O apelido automático é o último termo, com e sem partículas (van, der, de, di, da, dos, del…): "van der sar" e "sar".
- **Índice por ronda**: uma chave aponta para uma pessoa se só essa pessoa a tiver no nível de prioridade mais alto; se várias a tiverem, a chave é **ambígua**.
  - Exemplos: "cole" fica ambígua; "ronaldo" vai para o Ronaldo brasileiro e não para o apelido do Cristiano.
- **Procura**:
  - Primeiro tenta a correspondência exata.
  - Depois aplica Damerau-Levenshtein com tolerância medida pelo tamanho da chave: até 6 letras aceita 1 erro, acima disso aceita 2.
  - Se duas pessoas diferentes empatarem, o resultado é ambíguo.
  - Se o texto for exatamente o nome de alguém de outro jogo, não é corrigido.
- **Resultado**: `{tipo:'unico', id} | {tipo:'ambiguo'} | {tipo:'nenhum'}`. Quem decide o que fazer é o motor.
  - A procura inclui toda a gente do jogo, incluindo já descobertos e suplentes não utilizados. Assim, "rivaldo" já descoberto devolve "Já é de…" e nunca cai no Ronaldo por aproximação.
- **Testes com casos reais**:
  - Acentos e partículas: Vítor Baía ("baia"), Modrić, Błaszczykowski/"kuba", Ødegaard, Gündoğan, N'Golo Kanté, van der Sar.
  - Alcunhas: Cristiano Ronaldo ("cr7", "ronaldo").
  - Nomes parecidos no mesmo jogo:
    - Xavi vs Xabi Alonso (final do Mundial 2010)
    - Ronaldo vs Ronaldinho vs Rivaldo (final do Mundial 2002)
  - Apelidos repetidos:
    - Ashley Cole vs Joe Cole (final da LC 2008)
    - Thiago Silva vs Bernardo Silva (final da LC 2021)
  - Gralhas: "iniessta", "casilas", "drogab".
  - Nomes curtos: Deco, Pepe.

## Motor da ronda — `src/motor.js` (puro, tempo injetado, TDD)

- **`criarRonda(jogo, {equipa, duracaoBase, agora})`** cria os lugares:
  - um por jogador do onze, um por suplente utilizado e um por treinador;
  - na Equipa Mítica, só os da equipa escolhida.
  - Também monta o índice de nomes, que inclui os não utilizados.
- **`palpite(ronda, jogadorId, texto, agora)`** aplica as validações por esta ordem:
  - bloqueio e limite de frequência (≤ 1 palpite a cada 150 ms; textos com 2 a 40 caracteres);
  - matcher;
  - resultado: ganha o lugar, "Já é de X", "Ficou no banco" ou ambíguo.
  - Depois calcula os pontos (5 − nível de pista; 3 para suplente ou treinador; +2 na última posição), acrescenta +5 s e regista no feed.
- **`nivelPista(ronda, agora)`**, **`proximoPrazo(ronda)`** e **`terminar(ronda)`**, que revela tudo.
- **`estadoPublico(ronda, agora)`**: lugares escondidos só levam a posição, o minuto de entrada e as pistas já reveladas.
  - Teste dedicado: o JSON público, durante a ronda, não contém nenhum nome nem chave escondida.
- **Sala** (`sala.js`):
  - fases `lobby → ficha → ronda → fim → (próxima | final)`;
  - entrada e reconexão por token privado em localStorage (o id público é outro, para ninguém se fazer passar por outro jogador);
  - nomes duplicados ganham sufixo "Rui (2)"; cores atribuídas da paleta; sala solo recusa entradas;
  - os jogos usados guardam-se por sala.

## Protocolo WebSocket (JSON)

- **Cliente → servidor**:
  - `entrar{token,nome}`, `palpite{texto}`;
  - só o anfitrião: `config{conteudo,equipa,rondas}`, `comecar`, `proxima`, `novo_jogo`;
  - texto `ping` com resposta automática `pong`.
- **Servidor → cliente**:
  - `bemvindo{eu, catalogo:{equipas, contagens}}`;
  - `estado{sala, agora}`, enviado a todos em cada mudança, com o feed numerado (`seq`) para as animações;
  - `resposta{r:'certo'|'errado'|'ja'|'banco'|'ambiguo'|'bloqueado', ...}`, só a quem escreveu;
  - `erro{msg}` (sala cheia, sala solo, sala inexistente).

## Interface

**Linguagem visual**: a mesma família do FC Intel e do Footstop, com azul no lugar do amarelo e do vermelho.
- Fundo verde-escuro `#06140d` com riscas de relva, brilho radial e círculo central decorativo.
- Painéis translúcidos `#0c2016cc` com borda `#ffffff1a` e cantos de 14 px.
- Títulos em **Anton** e texto em **Inter**. "HIDDEN" a branco e "ELEVEN" em gradiente azul com brilho.
- Botão principal em gradiente `#3b82f6 → #1d4ed8` com sombra azul. "Jogar sozinho" é branco com texto azul-escuro. Inputs escuros com código em Anton espaçado.
- Logótipo: camisola azul com "?".
- Paleta de jogadores: vermelho #EF4444, laranja #F97316, amarelo #FACC15, lima #A3E635, ciano #22D3EE, azul #3B82F6, violeta #A78BFA, rosa #F472B6, branco #F5F5F4 e bronze #D6A46B.

**Ecrãs**
- Início: nome, "Criar sala", "Jogar sozinho", código + "Entrar" e "Como jogar". Quem abre `/sala/ABCD` sem nome guardado escreve só o nome.
- Lobby:
  - Código grande e "Copiar link". Jogadores com cor e coroa do anfitrião.
  - Configuração: conteúdo (4 opções), equipa (só na Equipa Mítica, com as equipas que têm ≥ 3 jogos e as tuas favoritas primeiro) e rondas.
  - Os outros jogadores veem a configuração só em leitura.
- Jogo, em computador:
  - Relvado na horizontal, com a equipa A na metade esquerda e a B na direita. Os bancos e os treinadores ficam por baixo de cada metade.
  - Barra lateral: relógio grande (Anton), barra de tempo com os marcadores das 3 pistas, caixa de texto, classificação ao vivo (total e +ronda) e feed.
- Jogo, em telemóvel:
  - Relógio e caixa de texto fixos no topo, para continuarem visíveis com o teclado aberto.
  - Banco B, relvado na vertical (B em cima, A em baixo) e banco A.
  - Classificação e feed por baixo.
- Sobreposições: ficha do jogo com contagem de 7 s; fim da ronda; pódio final.

**Relvado** (`relvado.js` + `formacao.js`, que é puro e testado)
- SVG com as medidas de um campo de 105×68 m.
- A formação dá as linhas: "4-2-3-1" → [4,2,3,1], "4-4-2 losango" → [4,1,2,1,2]; outras formações funcionam pela mesma regra.
- Os jogadores são ordenados pela profundidade da sigla (DD/DC/DE < MDC < MD/MC/ME < MO < ED/EE < PL) e cortados pelas linhas.
- Dentro de cada linha ficam do lado direito para o esquerdo e são espaçados de forma uniforme, com pequenos ajustes (MDC um pouco mais recuado, MO um pouco mais avançado).
- As coordenadas são relativas à equipa e depois convertidas para a orientação e o lado do relvado.
- **Camisola escondida**: escura, contorno tracejado, detalhe na cor do equipamento e "?" (ou o número, com a pista 1). Por baixo, a bandeira e a inicial quando são reveladas.
- **Camisola descoberta**: preenchida com a cor de quem descobriu, com o nome curto e, em pequeno, o nome de quem a descobriu.
- **No fim**: o que ficou por descobrir aparece a cinzento.
- **Animação ao conquistar uma posição**: a camisola cresce e volta ao tamanho normal, sai um anel na cor do jogador e sobe um "+5" a flutuar. Há também "+5s" junto ao relógio e a linha nova a entrar no feed. Tudo respeita `prefers-reduced-motion`.

## Dados: recolha e verificação

1. **`scripts/importar-wikipedia.mjs`** lê o wikitext bruto (`?action=raw`) de cada artigo listado em `scripts/fontes.json`.
   - Nas páginas com vários jogos, encontra o jogo certo pelos nomes das equipas.
   - Faz o parse da *Football box* (data, equipas, resultado, estádio) e das tabelas de onzes: `|CB ||'''4'''||{{flagicon|POR}} [[Ricardo Carvalho]] || || {{suboff|72}}`, substituições com `{{subon|85}}` e treinador.
   - Mapeia as posições da Wikipédia para as nossas siglas (GK→GR, RB→DD, DM→MDC, AM→MO, RW→ED, CF→PL…).
   - Converte códigos FIFA em ISO (POR→PT, ENG→GB-ENG). Nas finais de seleções, sem bandeiras na tabela, usa o país da equipa.
   - Deduz a formação e escreve um rascunho JSON.
   - Já confirmei este formato em 2004, 2026 (LC e Mundial), Euro 2004, Taça UEFA 2005, Liga Europa 2013 e Man Utd 1–6 Man City.
2. **Curadoria manual de cada jogo**:
   - textos em pt-PT ("Mónaco 0–3 FC Porto", "26 de maio de 2004");
   - formação confirmada;
   - `aceites` com alcunhas e primeiros nomes usados;
   - `curto`, `slug` e `modos`.
3. **Jogos sem tabela na Wikipédia**, sobretudo dérbis portugueses: transcrição manual da ficha do zerozero.pt a partir do HTML bruto, porque o resumo automático baralha os dados. Os jogos europeus são cruzados com uma segunda fonte, como a UEFA.com. **Se não houver uma fonte fiável, o jogo fica de fora.**
4. **As finais de 2026 são posteriores ao meu conhecimento fiável**: entram só com os dados da Wikipédia (Mundial: Espanha 1–0 Argentina; LC: PSG 1–1 Arsenal).
5. **`npm run validar`** (também corre nos testes) verifica:
   - esquema e siglas válidas;
   - formação com 10 jogadores de campo e linhas coerentes com as siglas;
   - números únicos por equipa;
   - bandeira existente para cada `pais`;
   - minutos válidos;
   - `slug` coerente com `modos`.
   - Também lista os apelidos partilhados e as contagens por conteúdo e por equipa.

**41 finais**: LC 2000–2026 (27), Mundial 2002–2026 (7) e Euro 2000–2024 (7).

**Clássicos (proposta, 28; um jogo sem fonte fiável sai da lista)**

| Grupo | Jogos |
|---|---|
| Portugal | 2–2 Inglaterra e 2–1 Holanda (Euro 2004) · 1–0 Holanda (Mundial 2006, Nuremberga) · 3–3 Espanha (Mundial 2018) · finais da Liga das Nações de 2019 (1–0 Holanda) e 2025 (2–2 Espanha, g.p.) |
| Benfica | finais da Liga Europa de 2013 (1–2 Chelsea) e 2014 (Sevilha, g.p.) · Sporting 0–1 Benfica (2005, Luisão) · Liverpool 0–2 Benfica (2006) |
| Porto | 5–0 Benfica (2010) · 2–1 Benfica (2013, Kelvin) · final da Taça UEFA de 2003 (Celtic) · final da Liga Europa de 2011 (Braga) |
| Sporting | final da Taça UEFA de 2005 (CSKA) · 4–1 Man City (2024) · finais da Taça de Portugal de 2008 e 2019 contra o Porto |
| Espanha | Barcelona 5–0 Real (2010) · Real 2–6 Barcelona (2009) · final da Taça do Rei de 2011 · Barcelona 6–1 PSG (2017) |
| Inglaterra | Man Utd 1–6 Man City (2011) · City 3–2 QPR (2012) · Man Utd 8–2 Arsenal (2011) · Liverpool 4–0 Barcelona (2019) |
| Míticos | Brasil 1–7 Alemanha (2014) · Alemanha 0–2 Itália (2006) |

Assim, Benfica, Porto, Sporting, Portugal (2004–atual), Real Madrid, Barcelona, Man Utd e Man City ficam todos com ≥ 4 jogos na Equipa Mítica.

## Ordem de implementação

Para cada marco: testes primeiro onde houver lógica, depois commit.

1. **Base**:
   - `git init`, `.gitignore`, `package.json` (wrangler, vitest, flag-icons, @fontsource/anton, @fontsource-variable/inter);
   - `wrangler.jsonc` com assets, SPA, `run_worker_first` para `/api/*`, `/ws/*` e `/sala/*`, o Durable Object SQLite e `build.command`;
   - `copiar-assets.mjs`;
   - cópia deste plano em `docs/`.
2. `nomes.js` com os testes reais.
3. Formato dos dados, importador, validador e 5 jogos semente: finais da LC de 2004, 2008 e 2021, Euro 2016 e Mundial 2010.
4. `motor.js` + `regras.js` + `catalogo.js` com testes, incluindo tempo simulado e a ausência de fugas de nomes.
5. `formacao.js` com testes das 7 formações e de sobreposições.
6. Worker + Durable Object: salas, WebSocket, alarmes, persistência, reconexão, troca de anfitrião, limpeza e meta OG.
7. Frontend: início, lobby, ficha, jogo (relvado, bancos, treinador, caixa, relógio, pistas, classificação, feed, animações), fim da ronda, pódio; versão para telemóvel.
8. `e2e.mjs` e teste manual no browser.
9. Restantes cerca de 64 jogos: importar, curar e validar, em lotes por competição.
10. README (como jogar, correr, acrescentar jogos, publicar) e deploy.

## Verificação

- **`npm test`** (Vitest) cobre:
  - o matcher, com os casos reais;
  - o motor: pontos 5/4/3/2, suplentes e treinadores a 3, +2 na última posição, +5 s, pistas às horas certas, fim por tempo e por estar tudo descoberto, bloqueio de 1 s, "Já é de", "Ficou no banco", ambíguo e nenhum nome escondido no estado público;
  - o layout das formações;
  - todos os JSON passam no validador.
- **`npm run dev` + `npm run e2e`**:
  - cria uma sala, liga 2 clientes WebSocket e o anfitrião começa;
  - espera a ficha e testa errado → bloqueado → desbloqueado;
  - testa um acerto com +5 e o "Já é de…", e um suplente não utilizado;
  - descobre tudo e confirma o fim, a revelação e o +2;
  - reconecta com o mesmo token e confirma os mesmos pontos;
  - durante toda a ronda, procura nomes escondidos nas mensagens recebidas.
- **Browser** (painel integrado):
  - anfitrião em `localhost:8787` e convidado em `127.0.0.1:8787`, que são origens diferentes e por isso têm identidades diferentes;
  - jogar uma ronda completa e recarregar a meio;
  - capturas de ecrã em computador e com o preset de telemóvel 375×812.
- **Deploy**:
  - tu corres `npx wrangler login`; eu corro `npm run deploy`;
  - se a conta ainda não tiver subdomínio workers.dev, crias um no painel;
  - no fim, teste rápido do URL público, com o e2e apontado para ele e uma ronda no browser.
