// The walk's sound, made the way its world is made: noise, oscillators and filters shaped by where the walker stands. No recordings.
import { mix, noise, smooth } from "./land.ts";

export interface Hearing {
  s: number;            // distance walked
  pace: number;         // 0 standing … 1 walking … ~2.3 running
  fed: number;          // 0–3 logs added to the fire
  fireGap: number;      // metres from the walker to the campfire
  night: number;        // 1 full night … 0 day (the stars value)
  dusk: number;         // 0 … 1 after the monolith is touched
}
export interface Sound {
  frame(hearing: Hearing, dt: number): void;
  cue(what: "feed" | "sow" | "touch"): void;
  setMuted(muted: boolean): void;
  close(): void;
}

const LOUD = .5;
/** An owl far off: [start, length, pitch] of each hoot. */
const HOOTS = [[0, .42, 1], [.78, .15, 1.05], [1.0, .15, 1.05], [1.26, .6, .98]] as const;

/** Starts the walk's sound. Call from the click that starts the walk (browsers only allow audio after a gesture). */
export function startSound(muted: boolean): Sound {
  if (typeof AudioContext === "undefined") return { frame() {}, cue() {}, setMuted() {}, close() {} };
  const ctx = new AudioContext(), rate = ctx.sampleRate, rand = Math.random, held: AudioNode[] = [], sources: AudioScheduledSourceNode[] = [];
  const keep = <T extends AudioNode>(node: T) => { held.push(node); return node; };
  const ease = (param: AudioParam, value: number, tau: number) => param.setTargetAtTime(value, ctx.currentTime, tau);
  const gain = (value: number, to: AudioNode) => { const node = keep(ctx.createGain()); node.gain.value = value; node.connect(to); return node; };
  const filter = (type: BiquadFilterType, frequency: number, q: number, to: AudioNode) => { const node = keep(ctx.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = q; node.connect(to); return node; };
  const pan = (value: number, to: AudioNode) => { const node = keep(ctx.createStereoPanner()); node.pan.value = value; node.connect(to); return node; };
  const tone = (frequency: number, to: AudioNode) => { const node = keep(ctx.createOscillator()); node.frequency.value = frequency; node.connect(to); node.start(); sources.push(node); return node; };
  const lfo = (frequency: number, depth: number, param: AudioParam) => { const node = keep(ctx.createGain()); node.gain.value = depth; node.connect(param); tone(frequency, node); };
  const loop = (buffer: AudioBuffer, to: AudioNode) => { const node = keep(ctx.createBufferSource()); node.buffer = buffer; node.loop = true; node.connect(to); node.start(0, rand() * buffer.duration); sources.push(node); };
  /** Plays a one-shot and lets it and the nodes after it go when it ends. */
  const once = (source: AudioScheduledSourceNode, at: number, until: number | null, ...after: AudioNode[]) => {
    source.start(at); if (until !== null) source.stop(until);
    source.onended = () => { source.disconnect(); for (const node of after) node.disconnect(); };
  };
  /** A buffer filled in code and scaled to a peak of 1. */
  function bake(seconds: number, channels: number, fill: (data: Float32Array) => void) {
    const buffer = ctx.createBuffer(channels, Math.ceil(seconds * rate), rate);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c); fill(data);
      let peak = 0; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
      if (peak) for (let i = 0; i < data.length; i++) data[i] = data[i]! / peak;
    }
    return buffer;
  }
  const attack = (t: number, over: number) => t <= 0 ? 0 : Math.min(1, t / over);

  // ---------- material: noise and short sounds, baked once ----------
  const brown = bake(4, 2, d => { // low, soft noise; run twice round the loop so its end meets its start
    const white = d.map(() => rand() * 2 - 1); let v = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < d.length; i++) { v = v * .985 + white[i]! * .015; if (pass) d[i] = v; }
  });
  const rustle = bake(4, 2, d => { // dry ticks and scrapes, dense enough to be a texture; grains wrap round so it loops clean
    for (let k = 0; k < 4 * 420; k++) {
      const at = Math.floor(rand() * d.length), length = Math.floor((.002 + rand() * .01) * rate), amp = rand() * rand();
      for (let j = 0; j < length; j++) { const i = (at + j) % d.length; d[i] = d[i]! + (rand() * 2 - 1) * amp * Math.sin(Math.PI * j / length); }
    }
  });
  const crackles = [0, 1, 2, 3, 4, 5].map(k => bake(.09, 1, d => { // one pop of a burning log each, a little longer each
    let low = 0; for (let i = 0; i < d.length; i++) { const t = i / rate; low += (rand() * 2 - 1 - low) * .5; d[i] = low * attack(t, .002) * Math.exp(-t / (.006 + k * .003)); }
  }));
  const steps = [0, 1, 2, 3].map(() => bake(.24, 1, d => { // heel then toe: a soft thump under a little grit
    let low = 0; for (let i = 0; i < d.length; i++) {
      const t = i / rate, toe = t - .055; low += ((rand() * 2 - 1) * (rand() < .03 ? 3 : 1) - low) * .35;
      const env = attack(t, .006) * Math.exp(-t / .04) + (toe > 0 ? .6 * attack(toe, .008) * Math.exp(-toe / .05) : 0);
      d[i] = low * .65 * env + Math.sin(t * 2 * Math.PI * 85) * .7 * attack(t, .006) * Math.exp(-t / .03);
    }
  }));
  const scatter = bake(1.3, 2, d => { // a handful of grain falling on soil: tiny ticks over a short hiss
    let low = 0; for (let i = 0; i < d.length; i++) { const t = i / rate; low += (rand() * 2 - 1 - low) * .2; d[i] = low * .08 * attack(t, .06) * Math.exp(-t / .35); }
    for (let k = 0; k < 70; k++) {
      const at = Math.floor(Math.pow(rand(), 1.6) * 1.1 * rate), f = 2500 + rand() * 4000, amp = .2 + rand() * .4;
      for (let j = 0; j < .008 * rate && at + j < d.length; j++) { const t = j / rate; d[at + j] = d[at + j]! + amp * Math.sin(2 * Math.PI * f * t) * attack(t, .0004) * Math.exp(-t / .0012); }
    }
  });

  // ---------- the mix ----------
  const squeeze = keep(ctx.createDynamicsCompressor()); squeeze.connect(ctx.destination);
  squeeze.threshold.value = -20; squeeze.knee.value = 18; squeeze.ratio.value = 4; squeeze.attack.value = .005; squeeze.release.value = .3;
  const master = gain(0, squeeze);
  const far = keep(ctx.createDelay(1)); far.delayTime.value = .23; // a far-off echo for calls across the land
  const farTone = filter("lowpass", 1600, .5, gain(.5, master)); far.connect(farTone); farTone.connect(gain(.3, far));
  const cues = gain(.8, filter("lowpass", 5000, .5, master));

  // the campfire and the village fire: pops of burning wood over a soft low roar
  const fire = gain(0, master), crackleIn = filter("lowpass", 3800, .5, fire), roar = gain(.5, fire); loop(brown, filter("lowpass", 420, .6, roar));
  // crickets: three detuned high tones, each pulsing fast inside chirps that come in runs
  const crickets = gain(0, master);
  const chirpers = ([[4410, -.55, 29], [4535, .3, 33], [4690, .7, 25]] as const).map(([f, side, pulse]) => {
    const out = gain(0, pan(side, crickets)), body = gain(.5, out); tone(f, body); lfo(pulse, .5, body.gain);
    return { out, next: 0, left: 0 };
  });
  const calls = gain(.035, master); calls.connect(far); // the owl, dry and echoed
  const wind = gain(0, master), windBand = filter("bandpass", 420, .7, wind); loop(brown, windBand);
  const wheat = gain(0, master); loop(rustle, filter("highpass", 1800, .5, filter("lowpass", 6500, .5, wheat)));
  const birds = gain(0, master); birds.connect(gain(.25, far));
  // water: a low wash and bubbles, each a sine that rises as it closes, played on four reusable voices
  const water = gain(0, master); loop(brown, filter("bandpass", 600, .9, gain(.5, water)));
  const drops = [0, 1, 2, 3].map(() => { const g = gain(0, water); return { g, o: tone(600, g), free: 0 }; });
  // the village quern: grit under a stone rubbed back and forth
  const grind = gain(0, master), stroke = gain(.5, grind); loop(rustle, filter("bandpass", 1050, 1.3, stroke)); lfo(1.2, .5, stroke.gain);
  const mill = gain(0, filter("lowpass", 1800, .5, master));
  const hum = gain(0, master); for (const [f, level] of [[100, .6], [150, .25], [200, .35], [300, .12]] as const) tone(f, gain(level, hum)); // mains hum off the wires
  const drone = gain(0, master); for (const [f, level] of [[55, .5], [55.35, .4], [110.2, .45], [164.9, .25], [220.6, .12]] as const) tone(f, gain(level, drone)); // the stone's low tone, beating slowly
  const tread = filter("lowpass", 2600, .6, master);

  // ---------- one-shots ----------
  function crackle(at: number, loud: number, slow = 1) {
    const source = ctx.createBufferSource(), level = ctx.createGain();
    source.buffer = crackles[Math.floor(rand() * crackles.length)]!; source.playbackRate.value = (.55 + rand() * 1.1) * slow; level.gain.value = loud;
    source.connect(level).connect(crackleIn); once(source, at, null, level);
  }
  let left = false;
  function step(at: number, pace: number, field: number) {
    const source = ctx.createBufferSource(), level = ctx.createGain();
    source.buffer = steps[Math.floor(rand() * steps.length)]!; source.playbackRate.value = (left ? 1 : .92) * (.96 + rand() * .08) * (pace > 1.5 ? 1.06 : 1);
    level.gain.value = mix(.11, .07, field) * Math.min(1.3, .55 + pace * .45);
    source.connect(level).connect(tread); once(source, at, null, level);
  }
  function chirp(at: number, warble: boolean) {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(), loud = .5 + rand() * .5;
    const base = (warble ? 2500 : 3500) * (.9 + rand() * .25), notes = warble ? 6 + Math.floor(rand() * 7) : 2 + Math.floor(rand() * 4);
    g.gain.value = 0; p.pan.value = rand() * 1.4 - .7; o.connect(g).connect(p).connect(birds);
    let t = at;
    for (let i = 0; i < notes; i++) {
      const length = warble ? .04 + rand() * .02 : .05 + rand() * .04, high = warble ? base * (i % 2 ? 1.22 : 1) * (1 + i * .015) : base * 1.25;
      o.frequency.setValueAtTime(high, t); o.frequency.exponentialRampToValueAtTime(warble ? high * .9 : base * .72, t + length);
      g.gain.setTargetAtTime(loud, t, .006); g.gain.setTargetAtTime(0, t + length * .65, .01);
      t += length + (warble ? .025 + rand() * .02 : .08 + rand() * .09);
    }
    once(o, at, t + .1, g, p);
  }
  function hoot(at: number) {
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(), f0 = 300 + rand() * 70;
    g.gain.value = 0; p.pan.value = rand() * 1.2 - .6; o.connect(g).connect(p).connect(calls);
    for (const [start, length, pitch] of HOOTS) {
      const t = at + start; o.frequency.setValueAtTime(f0 * pitch, t); o.frequency.linearRampToValueAtTime(f0 * pitch * .93, t + length);
      g.gain.setTargetAtTime(1, t, .04); g.gain.setTargetAtTime(0, t + length - .08, .05);
    }
    once(o, at, at + 2.4, g, p);
  }
  function bubble(at: number, loud: number) {
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i]!; if (drop.free > at) continue;
      const f = 420 + rand() * rand() * 1400, length = .025 + rand() * .05;
      drop.o.frequency.setValueAtTime(f, at); drop.o.frequency.exponentialRampToValueAtTime(f * (1.5 + rand() * .7), at + length);
      drop.g.gain.setValueAtTime(0, at); drop.g.gain.linearRampToValueAtTime(loud, at + .004); drop.g.gain.setTargetAtTime(0, at + .004, length * .4);
      drop.free = at + length * 2.2; return;
    }
  }
  function creak(at: number) { // stick-slip: a slow buzz rung through a narrow wooden resonance
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), base = 34 + rand() * 12, length = .7 + rand() * .5;
    o.type = "sawtooth"; f.type = "bandpass"; f.frequency.value = 620 + rand() * 260; f.Q.value = 6; g.gain.value = 0;
    o.frequency.setValueAtTime(base, at);
    for (let k = 1; k <= 8; k++) o.frequency.linearRampToValueAtTime(base * (1 + Math.sin(k / 8 * Math.PI) * .6) * (.9 + rand() * .2), at + length * k / 8);
    g.gain.setTargetAtTime(1, at, .1); g.gain.setTargetAtTime(0, at + length * .75, .1);
    o.connect(f).connect(g).connect(mill); once(o, at, at + length + .6, f, g);
  }
  function knock(at: number, f: number) { // a log set down on the others
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * .82, at + .1);
    g.gain.value = 0; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.3, at + .004); g.gain.setTargetAtTime(0, at + .004, .03);
    o.connect(g).connect(cues); once(o, at, at + .3, g);
  }
  function swell(at: number) { // the stone answers: a deep chord and a breath of low noise
    const g = ctx.createGain(), f = ctx.createBiquadFilter(), air = ctx.createBufferSource();
    f.type = "lowpass"; f.frequency.value = 420; g.gain.value = 0; f.connect(g).connect(master);
    g.gain.setTargetAtTime(.16, at, .7); g.gain.setTargetAtTime(0, at + 2.4, 1.3);
    const chord = [55, 82.4, 110.3, 164.6].map(frequency => { const o = ctx.createOscillator(); o.frequency.value = frequency; o.connect(f); o.start(at); o.stop(at + 9); return o; });
    air.buffer = brown; air.loop = true; air.connect(f); once(air, at, at + 9, ...chord, f, g);
  }

  // ---------- running ----------
  let stride = .7, wait = 0, touchedAt = -1, feedHeat = 0, nextCrackle = 0, nextBubble = 0, nextBird = 0, nextOwl = 0, nextCreak = 0, closed = false, sleeper = 0;
  function settle() { // hidden: stop the clock at once; muted: let the fade finish first
    clearTimeout(sleeper);
    if (document.hidden) void ctx.suspend();
    else if (muted) sleeper = window.setTimeout(() => void ctx.suspend(), 400);
    else void ctx.resume();
  }
  document.addEventListener("visibilitychange", settle);
  ease(master.gain, muted ? 0 : LOUD, .6); settle();

  return {
    frame(h, dt) {
      if (closed) return;
      const now = ctx.currentTime, field = smooth(240, 275, h.s), nature = 1 - .75 * smooth(590, 636, h.s), day = 1 - h.dusk;
      if (touchedAt >= 0 && h.dusk === 0 && now - touchedAt > 12) touchedAt = -1; // walking again from the start
      const tail = touchedAt < 0 ? 1 : 1 - smooth(5, 8.5, now - touchedAt);
      feedHeat *= Math.exp(-dt / 2.5);
      const heat = Math.pow(1 - smooth(4, 35, h.fireGap), 2) * (.6 + .4 * h.fed / 3 + feedHeat * .5) + (1 - smooth(2, 16, Math.abs(h.s - 334))) * .3;
      const flow = Math.max(smooth(358, 368, h.s) * (1 - smooth(440, 452, h.s)) * .45, 1 - smooth(2, 16, Math.abs(h.s - 361)));
      const birdsNow = smooth(236, 262, h.s) * mix(1, .3, smooth(300, 470, h.s)) * nature * day, turning = smooth(462, 474, h.s) * (1 - smooth(498, 510, h.s)) * day;

      if (h.pace > .05) { stride += dt * 2.1 * Math.sqrt(h.pace); if (stride >= 1) { stride -= 1; left = !left; if (!muted) step(now, h.pace, field); } }
      else stride = .7; // the first step comes soon after setting off
      if (!muted) {
        if (nextCrackle < now) nextCrackle = now;
        while (nextCrackle < now + .12) {
          if (heat > .01) crackle(nextCrackle, .3 + rand() * rand() * .7);
          nextCrackle += rand() < .18 ? .012 + rand() * .03 : -Math.log(1 - rand()) * .2 / (1 + h.fed * .35 + feedHeat * 3);
        }
        if (nextBubble < now) nextBubble = now;
        while (nextBubble < now + .1) { if (flow > .02) bubble(nextBubble, .3 + rand() * .7); nextBubble += -Math.log(1 - rand()) / 16; }
        if (now >= nextBird) { if (birdsNow > .03 && rand() < birdsNow) chirp(now + .05, rand() < .55); nextBird = now + 1.2 + rand() * 3.5; }
        if (now >= nextOwl) { if (nextOwl > 0 && h.night * nature > .6) hoot(now + .05); nextOwl = now + 14 + rand() * 22; }
        if (now >= nextCreak) { if (turning > .05) creak(now + .05); nextCreak = now + 2.6 + rand() * 1.6; }
      }
      for (let i = 0; i < chirpers.length; i++) { // runs of chirps, then a rest
        const c = chirpers[i]!; if (c.next < now) c.next = now;
        while (c.next < now + .1) {
          if (c.left > 0) { const length = .07 + rand() * .05; c.out.gain.setTargetAtTime(1, c.next, .008); c.out.gain.setTargetAtTime(0, c.next + length, .012); c.next += length + .18 + rand() * .12; c.left--; }
          else { c.left = 3 + Math.floor(rand() * 10); c.next += .6 + rand() * 3; }
        }
      }

      if ((wait -= dt) > 0) return; // the levels follow the walker fifteen times a second
      wait = 1 / 15;
      const gust = smooth(.28, .8, noise(now * .09, 7.3));
      ease(fire.gain, heat * .5, .15); ease(roar.gain, .5 + .35 * noise(now * 1.7, 2.2), .08);
      ease(crickets.gain, Math.max(h.night * nature, h.dusk * .6) * .025, .4);
      ease(wind.gain, mix(.05, .13, field) * (.3 + .9 * gust) * nature * mix(1, .35, h.dusk), .3); ease(windBand.frequency, 280 + 520 * gust, .3);
      ease(wheat.gain, smooth(258, 420, h.s) * nature * day * (.2 + .8 * Math.pow(gust, 1.5)) * .07, .15);
      ease(birds.gain, .05 * nature * day, .3);
      ease(water.gain, flow * .06, .3);
      ease(grind.gain, smooth(315, 322, h.s) * (1 - smooth(345, 352, h.s)) * .03, .3);
      ease(mill.gain, turning * .028, .3);
      ease(hum.gain, smooth(503, 515, h.s) * (1 - smooth(550, 562, h.s)) * .01 * day, .4);
      ease(drone.gain, smooth(588, 634, h.s) * .065 * tail, .6);
      ease(tread.frequency, mix(2600, 1250, field), .3);
    },
    cue(what) {
      if (closed) return;
      const now = ctx.currentTime;
      if (what === "touch") { touchedAt = now; if (!muted) swell(now + .02); return; }
      if (muted) return;
      if (what === "feed") {
        feedHeat = 1; knock(now + .02, 180); knock(now + .17, 235); crackle(now + .02, .8, .4);
        for (let i = 0; i < 10; i++) crackle(now + .2 + rand() * .9, .5 + rand() * .5);
      } else {
        const source = ctx.createBufferSource(), level = ctx.createGain();
        source.buffer = scatter; source.playbackRate.value = .9 + rand() * .2; level.gain.value = .5;
        source.connect(level).connect(cues); once(source, now + .02, null, level);
      }
    },
    setMuted(next) {
      if (closed) return;
      muted = next; settle(); ease(master.gain, muted ? 0 : LOUD, muted ? .1 : .25);
    },
    close() {
      if (closed) return;
      closed = true; clearTimeout(sleeper); document.removeEventListener("visibilitychange", settle);
      for (const source of sources) source.stop();
      for (const node of held) node.disconnect();
      void ctx.close();
    },
  };
}
