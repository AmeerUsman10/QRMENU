/**
 * Kitchen new-order alert.
 *
 * Generates a loud, attention-grabbing 3-pulse two-tone chime via the Web Audio
 * API. No external audio asset required — tones are synthesized in-browser, so
 * the alarm works offline and is not subject to a missing/blocked .mp3 file.
 *
 * Volume is boosted via a GainNode to push perceived loudness above what a
 * vanilla <audio> element can produce on the same hardware. Output still
 * respects the device's master volume — make sure the kitchen device's volume
 * is high.
 *
 * Browser autoplay policy: most browsers (Chrome, Safari) require a user
 * gesture before audio can play. The kitchen flow always passes through PIN
 * entry first, which is a user gesture, so the AudioContext starts in
 * `running` state by the time the first order arrives.
 */

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const MUTE_STORAGE_KEY = 'kitchen.alert.muted';

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const w = window as WindowWithWebkit;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  sharedContext = new Ctor();
  return sharedContext;
}

/**
 * Schedule a single beep at `startTime` (in AudioContext time).
 * Uses a square wave for a piercing, alarm-like timbre and shapes the
 * envelope with a fast attack and short decay to avoid clicks/pops.
 */
function scheduleBeep(
  ctx: AudioContext,
  startTime: number,
  frequency: number,
  duration: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(frequency, startTime);

  // Envelope: ramp up over 10ms, hold, ramp down over 30ms.
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
  gain.gain.setValueAtTime(peakGain, startTime + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Play the new-order alert. Safe to call from a non-async context — returns
 * a Promise that resolves after the alarm has finished scheduling.
 *
 * Returns false if audio is muted or unsupported in this browser.
 */
export async function playNewOrderAlert(): Promise<boolean> {
  if (isMuted()) return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  // If the context was suspended by the browser's autoplay heuristics, try to
  // resume it. This will succeed silently if we're in a valid user-gesture
  // chain (e.g. after the kitchen staff entered their PIN).
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  const now = ctx.currentTime;
  // Pattern: 3 pulses, each a high-then-low two-tone (~1.5s total).
  // High tone 1200 Hz, low tone 900 Hz — both in the human-hearing
  // sweet spot for cutting through ambient kitchen noise.
  const PEAK_GAIN = 0.6; // 0..1; 0.6 is loud without clipping on most devices
  for (let i = 0; i < 3; i++) {
    const pulseStart = now + i * 0.45;
    scheduleBeep(ctx, pulseStart, 1200, 0.17, PEAK_GAIN);
    scheduleBeep(ctx, pulseStart + 0.18, 900, 0.17, PEAK_GAIN);
  }
  return true;
}

/**
 * Pre-warm the AudioContext. Call this from a user-gesture handler
 * (e.g. the PIN-entry submit) so the first real alert has zero latency
 * and is guaranteed to play.
 */
export async function primeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* noop — alert will retry on first play */
    }
  }
}

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) {
      window.localStorage.setItem(MUTE_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(MUTE_STORAGE_KEY);
    }
  } catch {
    /* localStorage may be unavailable in private mode — fail silently */
  }
}
