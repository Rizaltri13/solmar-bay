// Seeded RNG (mulberry32) so staged scenes and self-tests are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.next = mulberry32(seed); this.seed = seed; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  // A full-turn angle — spawns and sweeps used to inline range(0, 2π)
  // in five places; one named helper keeps those call sites readable.
  angle() { return this.next() * Math.PI * 2; }
  // Symmetric jitter around a centre value (decoration scatter, spawns).
  jitter(centre, spread) { return centre + this.range(-spread, spread); }
  // Clamp a drawn value into [lo, hi] without consuming extra draws.
  clampedRange(a, b, lo, hi) { return Math.max(lo, Math.min(hi, this.range(a, b))); }
  // Weighted pick over [value, weight] pairs — district dressing + spawns.
  weighted(pairs) {
    // Zero/negative weights must never win: the old loop could return a
    // zero-weight entry when the roll landed exactly on a boundary.
    const live = pairs.filter(([, w]) => w > 0);
    const table = live.length ? live : pairs;
    let total = 0;
    for (const [, w] of table) total += w;
    let roll = this.next() * total;
    for (const [v, w] of table) { roll -= w; if (roll < 0) return v; }
    return table[table.length - 1][0];
  }
  // A child stream with its own seed — subsystems can draw randomness
  // without perturbing the parent sequence the staging relies on.
  fork(salt = 1) { return new RNG((this.seed ^ (salt * 0x9e3779b9)) >>> 0); }
  shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
