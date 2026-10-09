/** Injectable RNG so the sim can be replayed. The default is Math.random. */

export interface Rng {
  random(): number;
}

export function defaultRng(): Rng {
  return { random: () => Math.random() };
}

/** Deterministic RNG for tests and future lockstep. Seed is a uint32. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    random() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
