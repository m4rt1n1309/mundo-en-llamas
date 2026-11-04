/**
 * Generador pseudoaleatorio (mulberry32) cuya semilla vive dentro del estado
 * (`holder.rng`). Así la partida es reproducible y serializable a JSON.
 */
export function rngFrom(holder) {
  const rng = {
    next() {
      const t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
    int(n) {
      return Math.floor(rng.next() * n);
    },
    die() {
      return rng.int(6) + 1;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}
