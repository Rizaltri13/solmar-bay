// All sound is synthesized live with WebAudio — no audio files, no network.
export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.sirenOsc = null; this.sirenGain = null;
    this.engineOsc = null; this.engineGain = null;
    this.ambienceNodes = null; this._engineOn = false;
  }
  // Continuous engine hum while driving: pitch follows speed.
  updateEngine(speedRatio, driving) {
    if (!this.ctx || this.muted) { if (this._engineOn) this.stopEngine(); return; }
    try {
      if (driving && !this._engineOn) {
        this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.018;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start(); this._engineOn = true; this._engineFilter = f;
      }
      if (driving && this._engineOn) {
        const t = this.ctx.currentTime;
        this.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 130, t, 0.08);
        this.engineGain.gain.setTargetAtTime(0.014 + Math.abs(speedRatio) * 0.02, t, 0.1);
        // The lowpass opens up with speed too, so a fast car sounds
        // brighter — not just higher — than a crawling one.
        if (this._engineFilter) this._engineFilter.frequency.setTargetAtTime(420 + Math.abs(speedRatio) * 900, t, 0.12);
      }
      if (!driving && this._engineOn) this.stopEngine();
    } catch (e) { /* ignore */ }
  }
  stopEngine() {
    try { if (this.engineOsc) this.engineOsc.stop(); } catch (e) {}
    this.engineOsc = null; this._engineOn = false;
  }
  // City ambience: soft filtered surf/wind noise loop + a distant gull cry
  // every so often (scheduled from updateEngine's caller via ambienceTick).
  startAmbience() {
    if (!this.ctx || this.muted || this.ambienceNodes) return;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) { v = v * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = v * 3; }
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start();
      this.ambienceNodes = { src, g };
    } catch (e) { /* ignore */ }
  }
  gull() { this.tone(1180, 0.28, 'sine', 0.035, 760); }
  honk() { this.tone(340, 0.16, 'square', 0.06, 300); }
  // Blocked-traffic honk (v3): a touch lower and longer than the crash
  // honk, with a per-driver pitch so a jam does not sound like one horn.
  honkBlocked(seed = 0) {
    const base = 285 + ((seed * 37) % 55);
    this.tone(base, 0.22, 'square', 0.055, base - 28);
  }
  // Soft two-note chime when the day phase changes (golden hour, dusk…).
  dayChime() { this.tone(784, 0.16, 'sine', 0.05); setTimeout(() => this.tone(587, 0.22, 'sine', 0.045), 130); }
  officerShot() { this.noise(0.07, 0.1, 1500); this.tone(150, 0.06, 'square', 0.06, 70); }
  ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) { /* audio unavailable: game stays silent */ }
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) { // silence EVERY loop, not just the siren
      this.stopSiren(); this.stopEngine();
      if (this.ambienceNodes) this.ambienceNodes.g.gain.value = 0;
    } else if (this.ambienceNodes) this.ambienceNodes.g.gain.value = 0.05;
    return this.muted;
  }
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
