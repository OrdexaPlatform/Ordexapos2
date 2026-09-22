/**
 * Audio feedback utility for POS scanner and checkout
 * Generates an authentic supermarket barcode scanner "beep" (تيت) using Web Audio API
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a crisp barcode scanner confirmation beep (similar to Carrefour / retail scanners)
 */
export function playScannerBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 1950 Hz - authentic crisp retail scanner tone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1950, ctx.currentTime);

    // Fast envelope: 80ms duration
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.085);
  } catch (err) {
    // Ignore audio autoplay restrictions gracefully
    console.debug('[Audio] Scanner beep muted or restricted by browser:', err);
  }
}
