/**
 * Sound effects for game events using Web Audio API.
 *
 * All sounds are synthesized to avoid loading external files.
 */

type AudioContextType = typeof AudioContext;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx: AudioContextType =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioContextType }).webkitAudioContext;
    if (!AudioCtx) return null;
    return new AudioCtx();
  } catch {
    return null;
  }
}

/** Nomination sound - attention-grabbing gavel strike */
export function playNominationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Sharp attack, quick decay - like a gavel
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);

  setTimeout(() => ctx.close().catch(() => {}), 500);
}

/** Slayer ability sound - dramatic sword slash */
export function playSlayerSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // White noise burst for "slash" effect
  const bufferSize = ctx.sampleRate * 0.3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(2000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.3);

  setTimeout(() => ctx.close().catch(() => {}), 500);
}

/** Death sound - somber low tone */
export function playDeathSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const partials = [
    { freq: 110, gain: 0.3 },
    { freq: 165, gain: 0.15 },
  ];

  partials.forEach(({ freq, gain: g }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(g, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.6);
  });

  setTimeout(() => ctx.close().catch(() => {}), 2000);
}

/** Vote yes sound - positive ding */
export function playVoteYesSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "sine";
  osc.frequency.value = 880; // High A

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.35);

  setTimeout(() => ctx.close().catch(() => {}), 500);
}

/** Vote no sound - lower tone */
export function playVoteNoSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = "sine";
  osc.frequency.value = 330; // Low E

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);

  setTimeout(() => ctx.close().catch(() => {}), 500);
}

/** Vote end sound - resolution chord */
export function playVoteEndSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [262, 330, 392]; // C major chord

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const t = ctx.currentTime + i * 0.05;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    osc.start(t);
    osc.stop(t + 0.9);
  });

  setTimeout(() => ctx.close().catch(() => {}), 1500);
}

/** Virgin triggered sound - dramatic stinger */
export function playVirginSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Dissonant chord for dramatic effect
  const notes = [220, 277, 330]; // A minor-ish

  notes.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sawtooth";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.7);
  });

  setTimeout(() => ctx.close().catch(() => {}), 1000);
}
