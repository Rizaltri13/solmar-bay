// All sound is synthesized live with WebAudio — no audio files, no network.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.sirenOsc = null; this.sirenGain = null;
    this.engineOsc = null; this.engineGain = null;
  }
  ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) { /* audio unavailable: game stays silent */ }
  }
  toggleMute() { this.muted = !this.muted; if (this.muted) this.stopSiren(); return this.muted; }
  tone(freq, dur, type = 'square', vol = 0.12, slideTo = null) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  noise(dur = 0.15, vol = 0.15, low = 400) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime; const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start(t);
    } catch (e) { /* ignore */ }
  }
  shoot() { this.noise(0.09, 0.22, 1800); this.tone(180, 0.07, 'square', 0.1, 60); }
  hit() { this.tone(220, 0.08, 'triangle', 0.12, 110); }
  punch() { this.noise(0.08, 0.18, 700); }
  crash() { this.noise(0.25, 0.25, 500); this.tone(90, 0.2, 'sawtooth', 0.12, 40); }
  pickup() { this.tone(660, 0.09, 'sine', 0.12); setTimeout(() => this.tone(990, 0.12, 'sine', 0.12), 80); }
  mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'sine', 0.13), i * 110)); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.14), i * 160)); }
  startSiren() {
    if (!this.ctx || this.muted || this.sirenOsc) return;
    try {
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'sine';
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0.035;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
      const lg = this.ctx.createGain(); lg.gain.value = 350;
      lfo.connect(lg); lg.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 800;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start(); lfo.start(); this._sirenLfo = lfo;
    } catch (e) { /* ignore */ }
  }
  stopSiren() {
    try { if (this.sirenOsc) this.sirenOsc.stop(); if (this._sirenLfo) this._sirenLfo.stop(); } catch (e) {}
    this.sirenOsc = null; this._sirenLfo = null;
  }
}
