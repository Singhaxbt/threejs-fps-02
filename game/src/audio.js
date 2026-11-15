// All sound is synthesized with WebAudio — no audio files, no network. A short
// noise buffer and a few oscillators cover shots, reloads, hits, the bomb's beeps,
// the explosion and the round jingles. The context is created on the first user
// gesture; every call before that is a silent no-op.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterFreq, gain, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gain, type = 'sine', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(id) {
      if (id === 'dmr') {
        noise(0.22, 900, 0.5);
        tone(90, 0.16, 0.3, 'sawtooth');
      } else if (id === 'pistol') {
        noise(0.09, 2400, 0.32);
      } else {
        noise(0.12, 1600, 0.4);
      }
    },
    dryClick() {
      tone(1400, 0.04, 0.12, 'square');
    },
    reload() {
      tone(900, 0.05, 0.15, 'square', 0);
      tone(700, 0.05, 0.15, 'square', 0.35);
    },
    hit(kill) {
      tone(kill ? 1560 : 1180, 0.07, 0.2, 'sine');
      if (kill) tone(2080, 0.1, 0.18, 'sine', 0.07);
    },
    hurt() {
      noise(0.15, 500, 0.25);
    },
    footstep() {
      noise(0.05, 300, 0.06);
    },
    beep(plant) {
      tone(plant ? 980 : 740, 0.09, 0.2, 'sine');
    },
    explode() {
      noise(1.1, 320, 0.9);
      tone(55, 0.9, 0.5, 'sine');
    },
    round(won) {
      if (won) {
        tone(523, 0.12, 0.2, 'sine', 0);
        tone(659, 0.12, 0.2, 'sine', 0.12);
        tone(784, 0.22, 0.22, 'sine', 0.24);
      } else {
        tone(392, 0.16, 0.2, 'sine', 0);
        tone(311, 0.28, 0.2, 'sine', 0.16);
      }
    },
    buy() {
      tone(880, 0.06, 0.15, 'sine');
      tone(1174, 0.08, 0.15, 'sine', 0.06);
    },
  };
}
