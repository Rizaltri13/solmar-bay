// audio.js — the Solmar Bay soundscape, synthesised live.
//
// There are no audio assets in this game. Every sound — engine, siren,
// horns, gunfire, gulls, surf — is built from oscillators and shaped noise
// at the moment it is needed. All entry points are defensive: if WebAudio
// is unavailable the game simply plays silently.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    // Looping voices (engine / siren / ambience) keep their nodes so they
    // can be retuned per frame or torn down on mute.
    this._engine = null;
    this._siren = null;
    this._ambience = null;
    // Back-compat handles: older code paths poked these field names.
    this.sirenOsc = null;
    this.sirenGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.ambienceNodes = null;
    this._engineOn = false;
  }

  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      this.ctx = null;
    }
  }

  // Silence every looping voice at once (mute, busted/wasted screens).
  stopAllLoops() {
    this.stopSiren();
    this.stopEngine();
    if (this._ambience) this._ambience.gain.gain.value = 0;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopAllLoops();
    else if (this._ambience) this._ambience.gain.gain.value = 0.05;
    return this.muted;
  }

  // ---- one-shot voices ---------------------------------------------------

  tone(freq, dur, type = 'square', vol = 0.12, slideTo = null) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
      }
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch (err) { /* a failed blip must never break the loop */ }
  }

  noise(dur = 0.15, vol = 0.15, cutoff = 400) {
    if (!this.ctx || this.muted) return;
    try {
      const now = this.ctx.currentTime;
      const frameCount = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, frameCount, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      source.start(now);
    } catch (err) { /* ignore */ }
  }

  shoot() {
    this.noise(0.09, 0.22, 1800);
    this.tone(180, 0.07, 'square', 0.1, 60);
  }

  officerShot() {
    this.noise(0.07, 0.1, 1500);
    this.tone(150, 0.06, 'square', 0.06, 70);
  }

  hit() { this.tone(220, 0.08, 'triangle', 0.12, 110); }

  punch() { this.noise(0.08, 0.18, 700); }

  crash() {
    this.noise(0.25, 0.25, 500);
    this.tone(90, 0.2, 'sawtooth', 0.12, 40);
  }

  honk() { this.tone(340, 0.16, 'square', 0.06, 300); }

  // A blocked driver's honk is pitched per driver so a traffic jam sounds
  // like several impatient people rather than one stuck horn sample.
  honkBlocked(seed = 0) {
    const base = 285 + ((seed * 37) % 55);
    this.tone(base, 0.22, 'square', 0.055, base - 28);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.12);
    setTimeout(() => this.tone(990, 0.12, 'sine', 0.12), 80);
  }

  mission() {
    [523, 659, 784].forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.14, 'sine', 0.13), i * 110);
    });
  }

  busted() {
    [392, 330, 262].forEach((freq, i) => {
      setTimeout(() => this.tone(freq, 0.2, 'triangle', 0.14), i * 160);
    });
  }

  gull() { this.tone(1180, 0.28, 'sine', 0.035, 760); }

  dayChime() {
    this.tone(784, 0.16, 'sine', 0.05);
    setTimeout(() => this.tone(587, 0.22, 'sine', 0.045), 130);
  }

  // ---- engine loop ---------------------------------------------------------

  updateEngine(speedRatio, driving) {
    if (!this.ctx || this.muted) {
      if (this._engineOn) this.stopEngine();
      return;
    }
    try {
      if (driving && !this._engineOn) this.#startEngine();
      if (driving && this._engine) {
        const now = this.ctx.currentTime;
        const load = Math.abs(speedRatio);
        this._engine.osc.frequency.setTargetAtTime(52 + load * 130, now, 0.08);
        this._engine.gain.gain.setTargetAtTime(0.014 + load * 0.02, now, 0.1);
        this._engine.filter.frequency.setTargetAtTime(420 + load * 900, now, 0.12);
      }
      if (!driving && this._engineOn) this.stopEngine();
    } catch (err) { /* ignore */ }
  }

  #startEngine() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.018;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    this._engine = { osc, filter, gain };
    this.engineOsc = osc;
    this.engineGain = gain;
    this._engineFilter = filter;
    this._engineOn = true;
  }

  stopEngine() {
    try { if (this._engine) this._engine.osc.stop(); } catch (err) { /* already stopped */ }
    this._engine = null;
    this.engineOsc = null;
    this._engineOn = false;
  }

  // ---- ambience loop -------------------------------------------------------

  // Slowly evolving brown-ish noise through a low filter reads as surf and
  // wind at very low volume; gulls are scheduled separately by main.js.
  startAmbience() {
    if (!this.ctx || this.muted || this._ambience) return;
    try {
      const length = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let level = 0;
      for (let i = 0; i < length; i++) {
        level = level * 0.98 + (Math.random() * 2 - 1) * 0.02;
        data[i] = level * 3;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      source.start();
      this._ambience = { src: source, g: gain, gain };
      this.ambienceNodes = this._ambience;
    } catch (err) { /* ignore */ }
  }

  // ---- siren loop ------------------------------------------------------------

  startSiren() {
    if (!this.ctx || this.muted || this._siren) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.035;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 350;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      lfo.start();
      this._siren = { osc, lfo, gain };
      this.sirenOsc = osc;
      this.sirenGain = gain;
      this._sirenLfo = lfo;
    } catch (err) { /* ignore */ }
  }

  stopSiren() {
    try {
      if (this._siren) {
        this._siren.osc.stop();
        this._siren.lfo.stop();
      }
    } catch (err) { /* already stopped */ }
    this._siren = null;
    this.sirenOsc = null;
    this._sirenLfo = null;
  }
}
