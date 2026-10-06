// Constantes do jogo (tempos, pontos, limites).
export const REGRAS = {
  fichaMs: 7_000,
  duracaoMs: { multi: 180_000, solo: 300_000 },
  extraPorAcertoMs: 5_000,
  /** Pistas em frações da duração base: número, bandeira, inicial do apelido. */
  pistas: [0.2, 0.35, 0.5],
  bloqueioMs: 1_000,
  intervaloMinimoMs: 150,
  pontosOnze: [5, 4, 3, 2],
  pontosSuplente: 3,
  pontosTreinador: 3,
  bonusFecho: 2,
  /** Duelo: cada jogador da equipa que fecha primeiro o seu onze (ou que descobriu mais) ganha este bónus. */
  bonusDuelo: 10,
  maxJogadores: 10,
  /** Espectadores para além dos jogadores (quem entra a meio de uma ronda, ou com a sala cheia). */
  maxEspectadores: 10,
  rondas: [3, 5, 10],
  rondasPorOmissao: 5,
  textoMin: 2,
  textoMax: 40,
  nomeMax: 16,
  feedMax: 30,
  anfitriaoAusenteMs: 20_000,
  limpezaSalaVaziaMs: 2 * 60 * 60 * 1000,
  minimoJogosEquipa: 3,
};

export const PALETA = ['#EF4444', '#F97316', '#FACC15', '#A3E635', '#22D3EE', '#3B82F6', '#A78BFA', '#F472B6', '#F5F5F4', '#D6A46B'];

export const CONTEUDOS = ['finais', 'classicos', 'equipa', 'aleatorio'];

/** normal: todos descobrem as duas equipas; duelo: cada jogador só descobre a sua equipa. */
export const MODOS = ['normal', 'duelo'];

/** Alfabeto dos códigos de sala: sem I nem O para não confundir com 1 e 0. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
