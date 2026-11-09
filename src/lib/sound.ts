let ctx: AudioContext | null = null;

/** Call from a click handler so the browser allows sound later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio not available */
  }
}

/** Little 8-bit chime. "up" for focus done, "down" for break over. */
export function playChime(kind: 'up' | 'down') {
  if (!ctx) return;
  const notes = kind === 'up' ? [523, 659, 784, 1047] : [784, 659, 523];
  const t0 = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const t = t0 + i * 0.13;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  });
}
