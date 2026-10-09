// src/utils/audioFeedback.ts
// Efectos sonoros y hápticos sintetizados en el navegador vía Web Audio API (100% offline)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Sonido realista y táctil de obturador mecánico de cámara
 */
export function playShutterSound(): void {
  // Respuesta háptica táctil en dispositivos móviles
  triggerHaptic(50);

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;

    // Primer click del obturador
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(800, t);
    osc1.frequency.exponentialRampToValueAtTime(120, t + 0.04);
    gain1.gain.setValueAtTime(0.4, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.04);

    // Segundo click mecánico (cierre de cortinilla)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(600, t + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    gain2.gain.setValueAtTime(0.35, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.05);
    osc2.stop(t + 0.12);
  } catch (e) {
    // Silencioso si el navegador restringe audio
  }
}

/**
 * Tono sutil de bloqueo y enfoque de documento (cuando se estabiliza)
 */
export function playFocusLockTone(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, t); // C6 nota alta limpia
    osc.frequency.setValueAtTime(1318.5, t + 0.06); // E6
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch (e) {
    // Ignorar si suspendido
  }
}

/**
 * Vibración háptica en dispositivos móviles compatibles
 */
export function triggerHaptic(durationMs = 50): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch (e) {
    // Ignorar si no está soportado
  }
}
