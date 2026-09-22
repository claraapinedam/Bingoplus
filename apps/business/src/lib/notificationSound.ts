'use client';

// Synthesized client-side (Web Audio API) instead of a fetched/bundled audio file — see the
// FASE brief for this task: no binary asset exists anywhere in apps/business/public, and adding
// one wasn't wanted. Two quick ascending tones read as a pleasant "new order" chime rather than a
// harsh alarm. Browsers block audio until a user gesture has happened on the page at least once;
// when that's the case `AudioContext` either throws or stays 'suspended' — both are swallowed here
// so a blocked chime never crashes the listener, it's just silently skipped that one time.
export function playNewOrderChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      // Autoplay is blocked — nothing we can do without a user gesture; skip this one silently
      // rather than leaving a dangling AudioContext around.
      void ctx.close().catch(() => undefined);
      return;
    }

    const playTone = (frequency: number, startOffset: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const startAt = ctx.currentTime + startOffset;
      // Quick fade in/out avoids an audible click at the start/end of each tone.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.2, startAt + 0.02);
      gain.gain.linearRampToValueAtTime(0, startAt + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    };

    playTone(880, 0, 0.14);
    playTone(1174.66, 0.16, 0.18);

    // Close the context once both tones have finished playing — nothing else uses it.
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 500);
  } catch {
    // Autoplay blocked, AudioContext unavailable, etc. — never let a sound failure break the
    // actual notification (the on-screen banner still shows regardless).
  }
}
