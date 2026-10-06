// Sons (sintetizados com Web Audio, sem ficheiros) e vibração no telemóvel.
// O browser só deixa tocar depois de um gesto do utilizador: o contexto abre-se no primeiro clique ou tecla.
import { ler, guardar } from './util.js';

const CHAVE = 'he.som';
let ligado = ler(CHAVE) !== 'nao';
let contexto = null;

function abrir() {
  if (!contexto) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    contexto = new Ctx();
  }
  if (contexto.state === 'suspended') contexto.resume();
  return contexto;
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, abrir, { once: false, passive: true });

/** Uma sequência de notas: [frequência Hz, duração s, tipo de onda?]. */
function tocar(notas, volume = 0.12) {
  if (!ligado) return;
  const ctx = abrir();
  if (!ctx || ctx.state !== 'running') return;
  let t = ctx.currentTime;
  for (const [freq, dur, onda = 'sine'] of notas) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = onda;
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur * 0.85;
  }
}

function vibrar(padrao) {
  // Sem um toque prévio na página o browser recusa (e queixa-se na consola).
  if (ligado && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(padrao);
}

export const sons = {
  /** Acertaste. */
  acerto() {
    tocar([[660, 0.09], [880, 0.09], [1320, 0.16]]);
    vibrar(30);
  },
  /** Nome errado (bloqueio de 1 s). */
  erro() {
    tocar([[200, 0.18, 'square']], 0.06);
    vibrar([60, 40, 60]);
  },
  /** Outro jogador descobriu uma posição. */
  outro() {
    tocar([[520, 0.07, 'triangle']], 0.05);
  },
  /** Respostas sem penalização ("Já é de…", "Ficou no banco!"). */
  aviso() {
    tocar([[440, 0.08, 'triangle'], [440, 0.08, 'triangle']], 0.05);
  },
  pista() {
    tocar([[988, 0.12], [1319, 0.2]], 0.07);
    vibrar(20);
  },
  /** Últimos 10 segundos. */
  tique() {
    tocar([[1200, 0.04, 'square']], 0.03);
  },
  /** Apito do árbitro. */
  fim() {
    tocar([[2093, 0.18, 'triangle'], [2093, 0.18, 'triangle'], [2093, 0.45, 'triangle']], 0.08);
    vibrar([100, 60, 100, 60, 250]);
  },
  vitoria() {
    tocar([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.35]], 0.1);
    vibrar([60, 40, 60, 40, 160]);
  },
  derrota() {
    tocar([[392, 0.18], [330, 0.18], [262, 0.4]], 0.08);
  },
};

export const somLigado = () => ligado;

export function alternarSom() {
  ligado = !ligado;
  guardar(CHAVE, ligado ? 'sim' : 'nao');
  if (ligado) sons.acerto();
  return ligado;
}
