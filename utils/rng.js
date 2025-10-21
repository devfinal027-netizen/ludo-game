'use strict';

const crypto = require('crypto');

// Deterministic PRNG based on xoshiro128** seeded from a cryptographic seed.
// We use HMAC-SHA256(seed, 'rng:'+gameId) to derive a 128-bit state.

function deriveSeed128(seed) {
  const h = crypto.createHash('sha256').update(seed).digest();
  // take first 16 bytes as 128-bit seed
  return [0, 4, 8, 12].map((o) => h.readUInt32BE(o));
}

function xoshiro128ss(state) {
  // returns next integer in [0, 2^32)
  let [a, b, c, d] = state;
  const t = b << 9;
  let result = Math.imul(a, 5);
  result = ((result << 7) | (result >>> 25)) >>> 0;
  result = Math.imul(result, 9) >>> 0;

  c ^= a;
  d ^= b;
  b ^= c;
  a ^= d;
  c ^= t;
  d = ((d << 11) | (d >>> 21)) >>> 0;

  state[0] = a >>> 0;
  state[1] = b >>> 0;
  state[2] = c >>> 0;
  state[3] = d >>> 0;

  return result >>> 0;
}

function createDeterministicRng(seedInput) {
  const state = deriveSeed128(Buffer.isBuffer(seedInput) ? seedInput : Buffer.from(String(seedInput)));
  return {
    nextUint32() {
      return xoshiro128ss(state);
    },
    nextFloat() {
      // in [0,1)
      const x = xoshiro128ss(state) >>> 0;
      return (x >>> 8) / 16777216; // 24-bit precision
    },
    nextInt(minInclusive, maxInclusive) {
      const r = this.nextFloat();
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + Math.floor(r * span);
    },
    // For fair dice 1..6
    rollDie() {
      return this.nextInt(1, 6);
    },
  };
}

function generateGameSeed() {
  // 32 bytes hex string
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { createDeterministicRng, generateGameSeed };
