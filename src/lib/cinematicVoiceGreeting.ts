/**
 * AKHAVAN CRM — Premium Enterprise Cinematic Audio & Voice Greeting System
 *
 * Implements a bulletproof Web Audio + SpeechSynthesis pipeline:
 * 1. Synchronous user-gesture unlocking for both AudioContext and SpeechSynthesis (Safari iOS & Chrome desktop).
 * 2. AudioContext lifecycle management (running, suspended, closed).
 * 3. Independent queue and collision prevention between crystal chime and voice speech.
 * 4. Automatic fallback to synthesized harmonic tones if SpeechSynthesis is unsupported or fails.
 * 5. Full telemetry/logging in development with '[AKHAVAN Audio]' prefix.
 * 6. Non-blocking execution ensuring authentication navigation is never stalled.
 * 7. Zero 55Hz drone, zero phone vibration, zero unwanted background hum.
 *
 * Script:
 * "System online…
 *  Welcome to the future of AKHAVAN CRM.
 *  Your intelligent business experience starts now."
 */

const SESSION_KEY = 'akhavan_ai_greeting_played_v1';

export interface AudioSystemStatus {
  isSupported: boolean;
  audioContextState: AudioContextState | 'unsupported';
  speechSynthesisSupported: boolean;
  voicesCount: number;
  unlocked: boolean;
  greetingPlayed: boolean;
}

class CinematicAudioEngine {
  private static ctx: AudioContext | null = null;
  private static isUnlocked = false;
  private static activeOscillators: OscillatorNode[] = [];

  /**
   * Lazily initializes and returns the AudioContext instance,
   * properly recreating if previously closed.
   */
  public static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      // If previous context was closed, create a fresh one
      if (this.ctx && this.ctx.state === 'closed') {
        console.info('[AKHAVAN Audio] AudioContext was closed. Recreating fresh context.');
        this.ctx = null;
      }

      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          console.info(`[AKHAVAN Audio] Created AudioContext. Initial state: ${this.ctx.state}`);
        } else {
          console.warn('[AKHAVAN Audio] Web Audio API is not supported in this browser.');
        }
      }

      return this.ctx;
    } catch (err) {
      console.warn('[AKHAVAN Audio] Failed to get AudioContext:', err);
      return null;
    }
  }

  /**
   * Synchronously invoked inside a User Gesture (pointerdown, click, submit, keydown).
   * Unlocks both Web Audio and SpeechSynthesis before any async operations occur.
   */
  public static unlockAudioAndSpeech(): void {
    if (typeof window === 'undefined') return;

    console.info('[AKHAVAN Audio] Unlocking audio & speech pipeline via User Gesture...');

    // 1. Web Audio Unlocking (Safari iOS & Chrome requirement)
    try {
      const ctx = this.getContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.info(`[AKHAVAN Audio] AudioContext resumed successfully. State: ${ctx.state}`);
          }).catch(err => {
            console.warn('[AKHAVAN Audio] AudioContext resume rejected:', err);
          });
        }

        // Play 1-sample silent buffer to unlock iOS Safari Web Audio hardware output
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(ctx.destination);
        source.start(0);
        this.isUnlocked = true;
      }
    } catch (err) {
      console.warn('[AKHAVAN Audio] Web Audio unlock error (non-fatal):', err);
    }

    // 2. SpeechSynthesis Unlocking (iOS Safari & Chrome autoplay policy)
    try {
      if ('speechSynthesis' in window && window.speechSynthesis) {
        window.speechSynthesis.resume();

        // Warm up voice list
        const voices = window.speechSynthesis.getVoices();
        console.info(`[AKHAVAN Audio] SpeechSynthesis primed. Available voices: ${voices.length}`);

        // Prime iOS Safari by enqueueing a silent empty utterance in user gesture
        const primeUtterance = new SpeechSynthesisUtterance('');
        primeUtterance.volume = 0;
        primeUtterance.rate = 2.0;
        window.speechSynthesis.speak(primeUtterance);
        window.speechSynthesis.cancel();
      } else {
        console.warn('[AKHAVAN Audio] SpeechSynthesis is not supported on this platform.');
      }
    } catch (err) {
      console.warn('[AKHAVAN Audio] SpeechSynthesis prime warning (non-fatal):', err);
    }
  }

  /**
   * Plays the executive crystal welcome chime (D5, A5, D6, F#6).
   * Guarantees zero 55Hz low-frequency oscillation.
   */
  public static playLuxuryChime(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const ctx = this.getContext();
        if (!ctx) {
          console.warn('[AKHAVAN Audio] AudioContext unavailable for chime playback.');
          resolve();
          return;
        }

        const runChime = () => {
          try {
            const now = ctx.currentTime;
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0, now);
            masterGain.gain.linearRampToValueAtTime(0.26, now + 0.05);
            masterGain.gain.exponentialRampToValueAtTime(0.0008, now + 2.2);
            masterGain.connect(ctx.destination);

            // Dignified, deep, authoritative chime harmonics (warm D4 fundamental with stately gold overtones)
            const frequencies = [293.66, 440.0, 587.33, 880.0, 1174.66];
            frequencies.forEach((freq, idx) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = idx === 0 ? 'sine' : 'triangle';
              osc.frequency.setValueAtTime(freq, now + idx * 0.04);

              gain.gain.setValueAtTime(0, now);
              gain.gain.linearRampToValueAtTime(0.20 / (idx + 1), now + 0.04 + idx * 0.04);
              gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.6 + idx * 0.1);

              osc.connect(gain);
              gain.connect(masterGain);
              osc.start(now + idx * 0.04);
              osc.stop(now + 1.8 + idx * 0.1);

              this.activeOscillators.push(osc);
            });

            console.info('[AKHAVAN Audio] Dignified broadcast-grade chime started successfully.');

            // Resolve promise after chime attack finishes (~320ms) so speech follows cleanly
            setTimeout(() => {
              this.activeOscillators = [];
              resolve();
            }, 320);
          } catch (err) {
            console.warn('[AKHAVAN Audio] Error synthesizing chime:', err);
            resolve();
          }
        };

        if (ctx.state === 'suspended') {
          ctx.resume().then(runChime).catch(() => {
            runChime();
          });
        } else {
          runChime();
        }
      } catch (err) {
        console.warn('[AKHAVAN Audio] Unexpected chime error:', err);
        resolve();
      }
    });
  }

  /**
   * High-tech futuristic audio fallback played when SpeechSynthesis is unavailable or fails.
   * Synthesizes 3 distinct multi-harmonic futuristic chords representing the 3 greeting phases.
   */
  public static playSynthesizedAudioFallback(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const ctx = this.getContext();
        if (!ctx) {
          resolve();
          return;
        }

        console.info('[AKHAVAN Audio] Playing high-tech synthesized audio fallback sequence...');

        const now = ctx.currentTime;
        const chords = [
          { time: now + 0.05, notes: [659.25, 987.77, 1318.5], label: 'آماده‌به‌کار' },
          { time: now + 0.55, notes: [783.99, 1174.66, 1567.98], label: 'خوش‌آمدگویی' },
          { time: now + 1.15, notes: [880.0, 1318.51, 1760.0], label: 'آغاز تجربه' }
        ];

        chords.forEach((chord) => {
          chord.notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, chord.time);

            gain.gain.setValueAtTime(0, chord.time);
            gain.gain.linearRampToValueAtTime(0.12 / (i + 1), chord.time + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0005, chord.time + 0.45);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(chord.time);
            osc.stop(chord.time + 0.5);
          });
        });

        setTimeout(resolve, 1700);
      } catch {
        resolve();
      }
    });
  }

  public static getStatus(): AudioSystemStatus {
    const ctx = this.ctx;
    const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const voices = hasSpeech ? (window.speechSynthesis?.getVoices() || []) : [];

    return {
      isSupported: !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
      audioContextState: ctx ? ctx.state : 'unsupported',
      speechSynthesisSupported: hasSpeech,
      voicesCount: voices.length,
      unlocked: this.isUnlocked,
      greetingPlayed: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) === 'true' : false
    };
  }
}

/**
 * Finds a Persian (fa) speech voice. Returns null when the device has none, so the
 * greeting falls back to the silent-language chime sequence instead of speaking English.
 */
function findOptimalAIVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  const faVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith('fa'));
  return faVoices.find(v => v.localService) || faVoices[0] || null;
}

/**
 * Public export to synchronously unlock AudioContext & SpeechSynthesis on any user gesture.
 */
export function unlockAudioAndSpeech(): void {
  CinematicAudioEngine.unlockAudioAndSpeech();
}

/**
 * Returns current diagnostics of the audio and speech system.
 */
export function getAudioSystemStatus(): AudioSystemStatus {
  return CinematicAudioEngine.getStatus();
}

/**
 * Resets the greeting session flag (useful for testing or manual re-trigger).
 */
export function resetAudioGreetingSession(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    console.info('[AKHAVAN Audio] Session greeting flag cleared.');
  }
}

/**
 * Plays the premium cinematic AI robotic voice greeting.
 * Strictly once per session, only after successful authentication.
 *
 * Guarantees:
 * - Independent queue: Chime completes attack first, then speech starts cleanly.
 * - If SpeechSynthesis is unavailable or fails, invokes synthesized audio fallback.
 * - Non-blocking: Authentication never stalls on audio errors.
 */
export async function playCinematicLoginGreeting(soundEnabled: boolean = true): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Check sound settings
  if (!soundEnabled) {
    console.info('[AKHAVAN Audio] Sound is disabled by user setting. Skipping greeting.');
    return;
  }

  // 2. Guard against duplicate execution in same session
  if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    console.info('[AKHAVAN Audio] Greeting has already played in this session. Skipping.');
    return;
  }
  sessionStorage.setItem(SESSION_KEY, 'true');

  console.info('[AKHAVAN Audio] Initiating cinematic login greeting sequence...');

  try {
    // 3. Play luxury crystal chime first
    await CinematicAudioEngine.playLuxuryChime();

    // 4. Verify SpeechSynthesis availability
    if (!('speechSynthesis' in window) || !window.speechSynthesis) {
      console.warn('[AKHAVAN Audio] SpeechSynthesis unsupported. Engaging high-tech synthesized audio fallback.');
      await CinematicAudioEngine.playSynthesizedAudioFallback();
      return;
    }

    // Cancel any stuck utterances and ensure synthesis is in resumed state
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    // Ensure voices are available (Chrome often loads voices asynchronously)
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      console.info('[AKHAVAN Audio] Waiting for speech voices to load...');
      await new Promise<void>((resolve) => {
        const handler = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', handler);
          resolve();
        };
        window.speechSynthesis.addEventListener('voiceschanged', handler);
        setTimeout(resolve, 350);
      });
      voices = window.speechSynthesis.getVoices();
    }

    const selectedVoice = findOptimalAIVoice();

    if (!selectedVoice) {
      console.warn('[AKHAVAN Audio] No Persian TTS voice available. Engaging synthesized audio fallback.');
      await CinematicAudioEngine.playSynthesizedAudioFallback();
      return;
    }

    console.info(`[AKHAVAN Audio] Selected voice for greeting: ${selectedVoice?.name || 'Default System Voice'} (${selectedVoice?.lang || 'unknown'})`);

    // Script segments tuned to dignified, authoritative news-anchor (خبری و باوقار) cadence:
    // pitch 0.78-0.80 provides deep resonance; rate 0.85-0.87 provides solemn, measured broadcast delivery
    const segments = [
      { text: 'سامانه آماده است.', pauseAfterMs: 440, rate: 0.86, pitch: 0.78 },
      { text: 'به آینده سامانه اخوان خوش آمدید.', pauseAfterMs: 460, rate: 0.86, pitch: 0.80 },
      { text: 'تجربه هوشمند کسب‌وکار شما اکنون آغاز می‌شود.', pauseAfterMs: 300, rate: 0.86, pitch: 0.80 },
    ];

    let fallbackTriggered = false;

    // Independent sequential speech queue with per-segment timeout protection
    const speakSegment = (index: number): Promise<void> => {
      return new Promise((resolve) => {
        if (index >= segments.length) {
          console.info('[AKHAVAN Audio] Voice greeting speech sequence completed successfully.');
          resolve();
          return;
        }

        const item = segments[index];
        const utterance = new SpeechSynthesisUtterance(item.text);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.lang = 'fa-IR';
        utterance.rate = item.rate;
        utterance.pitch = item.pitch;
        utterance.volume = 1.0;

        let finished = false;
        const markDone = () => {
          if (!finished) {
            finished = true;
            clearTimeout(safetyTimeout);
            setTimeout(() => {
              speakSegment(index + 1).then(resolve);
            }, item.pauseAfterMs);
          }
        };

        // Safety timeout per segment to prevent browser SpeechSynthesis deadlocks
        const safetyTimeout = setTimeout(() => {
          if (!finished) {
            console.warn(`[AKHAVAN Audio] Segment ${index} timed out. Advancing queue.`);
            markDone();
          }
        }, 4000);

        utterance.onend = () => {
          markDone();
        };

        utterance.onerror = (event) => {
          console.warn(`[AKHAVAN Audio] Utterance error on segment ${index} (${event.error}).`);
          if (!fallbackTriggered) {
            fallbackTriggered = true;
            clearTimeout(safetyTimeout);
            console.info('[AKHAVAN Audio] Switched to high-tech synthesized audio fallback.');
            CinematicAudioEngine.playSynthesizedAudioFallback().then(resolve);
          } else {
            markDone();
          }
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          console.warn('[AKHAVAN Audio] Failed to execute speak():', err);
          if (!fallbackTriggered) {
            fallbackTriggered = true;
            CinematicAudioEngine.playSynthesizedAudioFallback().then(resolve);
          } else {
            resolve();
          }
        }
      });
    };

    await speakSegment(0);
  } catch (err) {
    console.warn('[AKHAVAN Audio] Non-fatal audio greeting error:', err);
    // Non-blocking: never rethrow or halt app navigation
  }
}
