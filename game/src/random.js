// random.js — deterministic randomness for Solmar Bay.
//
// The whole game draws from one seeded stream so that a staged screenshot
// or a self-test run can be reproduced exactly by passing the same ?seed=.
// The generator is mulberry32: tiny, fast, and good enough for placement
// scatter and AI coin flips (it is not used for anything security-shaped).

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextValue() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience wrapper used across the codebase. Each method consumes draws
// from the same underlying stream, in call order — that ordering is what
// makes a seed fully determine a generated city.
export class RNG {
  constructor(seed = 1) {
    this.seed = seed;
    this.next = mulberry32(seed);
  }

  // Uniform float in [a, b).
  range(a, b) {
    return a + this.next() * (b - a);
  }

  // Uniform integer in [a, b] inclusive.
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  chance(probability) {
    return this.next() < probability;
  }

  // Percentage-flavoured chance (chancePct(30) === chance(0.30)) for call
  // sites that read better in whole numbers.
  chancePct(percent) {
    return this.next() * 100 < percent;
  }

  sign() {
    return this.chance(0.5) ? -1 : 1;
  }

  // Random heading, used for spawns and particle bursts.
  angle() {
    return this.next() * Math.PI * 2;
  }

  // centre ± spread — handy for scattering decoration around a anchor.
  jitter(centre, spread) {
    return centre + this.range(-spread, spread);
  }

  // Draw in [a, b) and then clamp the result into [lo, hi].
  clampedRange(a, b, lo, hi) {
    const v = this.range(a, b);
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Pick from [value, weight] pairs. Entries with no positive weight are
  // ignored entirely; if every weight is dead we fall back to the raw list
  // so a misconfigured table still returns something sane.
  weighted(pairs) {
    const usable = pairs.filter((entry) => entry[1] > 0);
    const table = usable.length > 0 ? usable : pairs;
    let totalWeight = 0;
    for (const entry of table) totalWeight += entry[1];
    let roll = this.next() * totalWeight;
    for (const entry of table) {
      roll -= entry[1];
      if (roll < 0) return entry[0];
    }
    return table[table.length - 1][0];
  }

  // Spawn an independent stream derived from this seed. Subsystems that
  // want private randomness (so they cannot perturb staged scenes) fork.
  fork(salt = 1) {
    return new RNG((this.seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
  }

  // Fisher–Yates on a copy; the input array is left untouched.
  shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
}
