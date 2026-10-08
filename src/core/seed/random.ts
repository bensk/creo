// Seeded randomness so `pnpm db:seed` produces identical data (and identical
// ids, so dev URLs stay stable) on every run.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  uuid(): string;
  /** ISO date between from and to, inclusive. */
  date(from: string, to: string): string;
}

export function createRng(seed: number): Rng {
  // mulberry32
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from an empty list");
      return items[int(0, items.length - 1)]!;
    },
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    uuid: () => {
      const hex = Array.from({ length: 32 }, () => int(0, 15).toString(16));
      hex[12] = "4";
      hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
      const s = hex.join("");
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
    date: (from, to) => {
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Date.parse(`${to}T00:00:00Z`);
      const day = int(0, Math.round((end - start) / 86_400_000));
      return new Date(start + day * 86_400_000).toISOString().slice(0, 10);
    },
  };
}
