// Tiny vitest-style facade over node:test so the suite runs with zero native dependencies.
import { describe as nodeDescribe, it as nodeIt } from 'node:test';
import assert from 'node:assert/strict';

export const describe = nodeDescribe;

export function it(name, fn, timeout) {
  return nodeIt(name, timeout ? { timeout } : {}, fn);
}

const normalize = (v) => (ArrayBuffer.isView(v) ? Array.from(v) : v);

export function expect(actual) {
  const m = {
    toBe: (exp) => assert.equal(actual, exp),
    toEqual: (exp) => assert.deepEqual(normalize(actual), normalize(exp)),
    toBeNull: () => assert.equal(actual, null),
    toBeGreaterThan: (n) => assert.ok(actual > n, `expected ${actual} > ${n}`),
    toBeGreaterThanOrEqual: (n) => assert.ok(actual >= n, `expected ${actual} >= ${n}`),
    toBeLessThan: (n) => assert.ok(actual < n, `expected ${actual} < ${n}`),
    toHaveLength: (n) => assert.equal(actual.length, n),
    toThrow: () => assert.throws(actual),
  };
  m.not = {
    toThrow: () => assert.doesNotThrow(actual),
    toBe: (exp) => assert.notEqual(actual, exp),
  };
  return m;
}
