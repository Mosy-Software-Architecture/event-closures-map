import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipLine } from '../scripts/lib/geo.js';

const box = [0, 0, 10, 10];

test('clipLine keeps a line that is inside', () => {
  assert.deepEqual(clipLine([[1, 1], [5, 5], [9, 1]], box), [[[1, 1], [5, 5], [9, 1]]]);
});
test('clipLine cuts where the line leaves', () => {
  assert.deepEqual(clipLine([[5, 5], [15, 5]], box), [[[5, 5], [10, 5]]]);
});
test('clipLine splits a line that leaves and comes back', () => {
  assert.deepEqual(clipLine([[2, 5], [2, 15], [8, 15], [8, 5]], box), [[[2, 5], [2, 10]], [[8, 10], [8, 5]]]);
});
test('clipLine drops a line that is outside', () => {
  assert.deepEqual(clipLine([[20, 20], [30, 30]], box), []);
});
