import { createRng32 } from './rng';

export const MAX_EDGES = 256;

export const ZOBRIST_LO = new Int32Array(MAX_EDGES);
export const ZOBRIST_HI = new Int32Array(MAX_EDGES);

(() => {
  const next = createRng32(0x5eed1234);
  for (let e = 0; e < MAX_EDGES; e++) {
    ZOBRIST_LO[e] = next() | 0;
    ZOBRIST_HI[e] = next() | 0;
  }
})();
