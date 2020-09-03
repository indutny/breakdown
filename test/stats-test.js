/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const stats = require('../tools/stats');

describe('stats', () => {
  describe('computeOverlap()', () => {
    const computeOverlap = stats.computeOverlap;

    it('should combine overlapping intervals', () => {
      assert.strictEqual(computeOverlap([
        { start: 0, end: 2 },
        { start: 1, end: 3 },
        { start: 2, end: 2.2 },
        { start: 4, end: 5 },
      ]), 4);
    });
  });
});
