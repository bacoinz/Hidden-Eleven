# Hidden Eleven

Jogo de futebol multijogador em tempo real para jogar com amigos (partilha o link no Discord).
Aparece o onze de um jogo real com os nomes escondidos; quem escrever primeiro o nome certo fica com a posição.

Corre em **Cloudflare Workers + Durable Objects** (uma instância por sala, WebSockets com hibernação) e cabe no plano gratuito.
O frontend é HTML/CSS/JS simples, servido pelo próprio Worker.

## Como se joga

- **Criar sala** (multijogador, rondas de 3:00) ou **Jogar sozinho** (rondas de 5:00). Cada acerto acrescenta 1 s.
- O anfitrião escolhe o conteúdo — **Finais** (Liga dos Campeões, Mundial e Euro desde 2000), **Clássicos**
  (dérbis, rivais e jogos míticos), **Equipa Mítica** (só a equipa escolhida em campo) ou **Aleatório** — e o número de rondas.
- Ficha do jogo durante 7 s; depois toda a gente escreve nomes na mesma caixa. O servidor decide a posição:
  onze, suplentes que entraram (com o minuto visível) ou treinadores.
- Pistas no onze e nos suplentes por descobrir quando o relógio desce a 80 %, 65 % e 50 % do tempo inicial (2:24, 1:57 e 1:30
  em multijogador): número, bandeira, inicial do apelido; o treinador só recebe a inicial. A posição dos suplentes
  (a de quem substituíram) vê-se desde o início. Cada acerto dá +1 s e atrasa as pistas outro tanto.
  Nos jogos entre seleções não há a pista da bandeira.
- Pontos: 5 sem pistas, depois 4, 3 e 2; suplentes e treinadores 3; quem fecha a última posição +2.
- Nome errado bloqueia a caixa 1 s. "Já é de …!" e "Ficou no banco!" não penalizam.
- Com o onze todo descoberto aparece **Terminar ronda**, para não ter de esperar pelo relógio nem adivinhar os
  suplentes. Em multijogador, todos os jogadores ligados têm de confirmar.
- Antes disso há **Passar ronda** (solo e multijogador, também com todos a confirmar): a ronda acaba já e cada
  jogador fica só com metade dos pontos que fez nela (arredondada para cima). O corte aparece nos acontecimentos.
  No duelo, passar não dá vitória a ninguém.

## Correr localmente

```bash
npm install
npm run dev        # http://127.0.0.1:8787
```

Para testar com dois jogadores no mesmo computador, abre um separador em `http://localhost:8787` e outro em
`http://127.0.0.1:8787` (origens diferentes têm identidades diferentes).

> No Windows, o `wrangler dev` nem sempre deteta ficheiros novos ou alterados em `public/`; se o browser
> continuar com a versão antiga, reinicia o `npm run dev`.

## Testes

```bash
npm test           # matcher de nomes, motor, sala, formações e validação de todos os jogos
npm run validar    # relatório dos dados (contagens por conteúdo/equipa, apelidos partilhados)
npm run e2e        # com o dev a correr: dois clientes jogam uma ronda inteira contra o servidor
BASE=https://hidden-eleven.<conta>.workers.dev npm run e2e   # o mesmo contra a versão publicada
```

## Acrescentar jogos

Cada jogo é um ficheiro em `data/jogos/<id>.json` (formato descrito em `docs/superpowers/specs/`).

1. Junta uma entrada a `scripts/fontes.json` com o artigo da Wikipédia (em inglês) que tem a ficha do jogo:
   ```json
   { "id": "ucl-2004-final", "artigo": "2004 UEFA Champions League final", "competicao": "Liga dos Campeões",
     "fase": "Final", "modos": ["final", "equipa:porto"], "slugs": ["", "porto"] }
   ```
   - `procurar`: nomes das equipas, quando a página tem vários jogos (ex.: "UEFA Euro 2004 knockout stage").
   - `plantel`: artigo e secções dos convocados, para seleções (a Wikipédia só lista as substituições feitas).
2. `npm run importar -- <id>` escreve o rascunho (posições, números, nacionalidades, minutos, golos, bancos,
   treinadores). As páginas ficam em `.cache/` para se poder reimportar sem as voltar a pedir (`--fresco` ignora a cache).
3. Correções manuais vão para `scripts/curadoria.json`, para não se perderem quando se reimporta:
   `nomes` (renomear, o nome antigo passa a alcunha aceite), `pos` (onze ou suplentes), `onze` (onze completo, nome → sigla, pela ordem
   no relvado), `formacao`, `aceites`, `golos`, `curto`, `ordem`, `cor`, `remover` (convocados que não estavam no banco),
   `numeros` e `estadio`. `npm run importar -- <id> --forcar` volta a aplicar tudo.
   A posição de cada suplente é a de quem ele substituiu (`scripts/suplentes.mjs`, pelo minuto da troca).
   Se for um defesa a entrar para o lugar de um médio ou avançado (ou o contrário), fica a posição da fonte.
4. `npm run resumo -- <filtro>` mostra cada jogo numa linha por equipa, para rever.
5. `npm run validar` tem de dizer "Tudo válido."

**Jogos sem ficha na Wikipédia** (dérbis, jornadas de campeonato): a entrada leva `"zerozero": <id da ficha>` em
vez de `artigo` e importa-se com `npm run importar:zerozero -- <id>`. O zerozero dá os nomes como se escrevem em
Portugal, os suplentes, os golos e os treinadores; a formação e as posições vêm do FotMob (`"fotmob": <id do jogo>`,
cruzado pelo número da camisola). O FotMob só tem jogos a partir de 2010; para os mais antigos, ou quando as posições
dele não batem certo com os relatos, o `onze` e a `formacao` escrevem-se na curadoria.

As equipas da Equipa Mítica estão em `data/equipas.json` (aparecem a partir de 3 jogos).

## Publicar

```bash
npx wrangler login    # uma vez: autoriza a tua conta Cloudflare no browser
npm run deploy
```

O link fica `https://hidden-eleven.<subdominio>.workers.dev`; cada sala é `/sala/ABCD`.

## Estrutura

```
src/        Worker (index.js), Durable Object (sala.js) e lógica pura: sala-logica.js, motor.js, nomes.js, catalogo.js, regras.js
public/     frontend (index.html, css/, js/), bandeiras e fontes
data/       jogos/*.json e equipas.json
scripts/    importadores (Wikipédia; zerozero + FotMob), curadoria, validador, resumo, gerador do índice de dados, e2e
test/       testes Vitest
```

## Créditos

Bandeiras: [flag-icons](https://github.com/lipis/flag-icons) (MIT). Fontes: Anton e Inter (SIL OFL), via Fontsource.
As licenças estão em `public/LICENCAS.txt`.
Onzes, suplentes e minutos: Wikipédia e, nos jogos sem ficha lá, zerozero.pt (com as posições do FotMob);
cada jogo guarda a página de origem no campo `fonte`.
