/**
 * Kitchen new-order alert.
 *
 * Plays a loud 3-pulse two-tone alarm via an HTML5 <audio> element fed by an
 * inline WAV data URL synthesized at module load. No external audio asset is
 * shipped.
 *
 * Why HTML5 <audio> instead of Web Audio API:
 *   iOS Safari (iPads used as kitchen displays) suspends Web Audio
 *   AudioContexts aggressively after a few seconds of inactivity. Resuming
 *   them requires a fresh user gesture, but the order arrives via a Firebase
 *   listener (a background event), so resume silently fails and the alarm
 *   never plays. HTML5 <audio> elements, once "unlocked" by a single user
 *   gesture (we do this during PIN entry via play+pause), can be replayed
 *   programmatically at any time — including from background events on iOS.
 *
 * Mute state persists in localStorage so the kitchen staff's preference
 * survives page refreshes.
 */

const MUTE_STORAGE_KEY = 'kitchen.alert.muted';

// Lazily-initialized singleton. Created on first call to ensureAudioElement().
let audioElement: HTMLAudioElement | null = null;
// Tracks whether the unlock play+pause handshake succeeded.
let unlocked = false;
// Cached data URL — generated once per page load, not per alert.
let cachedDataUrl: string | null = null;

/**
 * Generate a 16-bit mono PCM WAV file containing a 3-pulse two-tone alarm
 * chime, return it as a base64 data URL.
 *
 * Pattern: high tone 1200 Hz, low tone 900 Hz, square wave for piercing
 * timbre that cuts through kitchen noise. Three pulses spaced ~0.45s apart,
 * each pulse being 0.17s of high then 0.17s of low. Total ~1.5s.
 *
 * 22050 Hz sample rate is enough headroom for the 1200 Hz fundamental and
 * its low-order harmonics; keeps the data URL around ~90 KB.
 */
function generateAlarmDataUrl(): string {
  const sampleRate = 22050;
  const durationSec = 1.5;
  const numSamples = Math.floor(sampleRate * durationSec);
  const amplitude = 0.7;
  const peak = Math.floor(amplitude * 32767);

  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let value = 0;

    // Three pulses, each a high-then-low two-tone.
    for (let p = 0; p < 3; p++) {
      const pulseStart = p * 0.45;
      const highStart = pulseStart;
      const lowStart = pulseStart + 0.18;

      if (t >= highStart && t < highStart + 0.17) {
        // Square wave at 1200 Hz: positive on first half of cycle, negative on second.
        const phase = (1200 * (t - highStart)) % 1;
        value = phase < 0.5 ? peak : -peak;
        break;
      }
      if (t >= lowStart && t < lowStart + 0.17) {
        const phase = (900 * (t - lowStart)) % 1;
        value = phase < 0.5 ? peak : -peak;
        break;
      }
    }

    samples[i] = value;
  }

  // Build the WAV file: 44-byte header + PCM data.
  const dataSize = samples.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // "RIFF" + chunk size + "WAVE"
  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // 'WAVE'

  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate = SR * channels * bytesPerSample
  view.setUint16(32, 2, true); // BlockAlign = channels * bytesPerSample
  view.setUint16(34, 16, true); // BitsPerSample

  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, dataSize, true);

  // Copy PCM samples (Int16Array writes as little-endian on all common platforms).
  new Int16Array(buffer, 44).set(samples);

  // Convert to base64. Chunk to avoid call-stack overflow on large arrays.
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function getDataUrl(): string {
  if (!cachedDataUrl) cachedDataUrl = generateAlarmDataUrl();
  return cachedDataUrl;
}

function ensureAudioElement(): HTMLAudioElement {
  if (audioElement) return audioElement;
  const el = new Audio(getDataUrl());
  el.preload = 'auto';
  // Helps iOS Safari treat it as inline (not full-screen) audio.
  el.setAttribute('playsinline', '');
  audioElement = el;
  return el;
}

/**
 * Unlock the audio element by playing it (muted) inside a user gesture, then
 * pausing. After this succeeds once, subsequent audio.play() calls work from
 * any context — including background Firebase event handlers on iOS Safari.
 *
 * Call from a user-gesture handler (PIN-submit). Safe to call multiple times.
 */
export async function primeAudioContext(): Promise<void> {
  const audio = ensureAudioElement();
  if (unlocked) return;
  try {
    audio.muted = true;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      await p;
    }
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    unlocked = true;
  } catch {
    // play() may reject outside a gesture or on browsers that disallow autoplay
    // even when muted — that's fine, we'll just retry on the next gesture.
  }
}

/**
 * Play the new-order alert. Fire-and-forget from the caller's perspective.
 * Returns true if the play call was issued, false if muted or unsupported.
 */
export async function playNewOrderAlert(): Promise<boolean> {
  if (isMuted()) return false;
  const audio = ensureAudioElement();
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      await p;
    }
    return true;
  } catch {
    return false;
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
    /* localStorage may be unavailable in private browsing — fail silently */
  }
}
