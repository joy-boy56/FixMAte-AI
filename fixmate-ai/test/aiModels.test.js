/**
 * Tests for the env-driven AI model configuration.
 *
 * Run with: npm test
 * Uses the built-in node:test runner (Node 18+), no extra dependencies.
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  isValidMode,
  resolveMode,
  getAvailableModes,
  getDefaultModeId,
  getProviderName,
  MODES,
} = require('../src/config/aiModels');

test('resolveMode returns the requested mode', () => {
  assert.equal(resolveMode('fast').id, 'fast');
  assert.equal(resolveMode('max').id, 'max');
});

test('resolveMode returns the mode config, not just the id', () => {
  const max = resolveMode('max');
  assert.strictEqual(max, MODES.max);
  assert.ok(max.model, 'mode must expose a model');
  assert.ok(max.maxTokens > 0, 'mode must expose a positive token budget');
});

test('resolveMode falls back to the default mode for unknown ids', () => {
  assert.equal(resolveMode('garbage').id, getDefaultModeId());
  assert.equal(resolveMode(undefined).id, getDefaultModeId());
  assert.equal(resolveMode(null).id, getDefaultModeId());
  assert.equal(resolveMode('').id, getDefaultModeId());
  assert.equal(resolveMode(42).id, getDefaultModeId());
});

test('resolveMode rejects prototype-chain keys', () => {
  // Regression test: MODES['constructor'] used to return Object's
  // constructor, which produced `model: undefined` and made scans silently
  // report zero findings.
  for (const bad of [
    'constructor',
    'toString',
    '__proto__',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
  ]) {
    assert.equal(
      resolveMode(bad).id,
      getDefaultModeId(),
      `mode "${bad}" must not resolve to a prototype member`
    );
    assert.ok(
      resolveMode(bad).model,
      `mode "${bad}" must resolve to a mode with a model`
    );
  }
});

test('isValidMode only accepts own keys of MODES', () => {
  assert.equal(isValidMode('fast'), true);
  assert.equal(isValidMode('max'), true);
  assert.equal(isValidMode('constructor'), false);
  assert.equal(isValidMode('__proto__'), false);
  assert.equal(isValidMode('toString'), false);
  assert.equal(isValidMode(''), false);
  assert.equal(isValidMode(undefined), false);
  assert.equal(isValidMode(null), false);
  assert.equal(isValidMode(123), false);
  assert.equal(isValidMode({}), false);
});

test('every mode exposes a model, a label and a fallback', () => {
  const modes = getAvailableModes();
  assert.ok(modes.length >= 2, 'at least fast and max modes must exist');
  for (const mode of modes) {
    assert.ok(mode.id, 'mode must have an id');
    assert.ok(mode.label, 'mode must have a label');
    assert.ok(mode.model, 'mode must have a model');
    assert.ok(mode.description, 'mode must have a description');
  }
});

test('the public mode projection does not leak internal config', () => {
  for (const mode of getAvailableModes()) {
    assert.equal(mode.maxTokens, undefined, 'token budgets must stay server-side');
    assert.equal(mode.fallback, undefined, 'the fallback model must stay server-side');
  }
});

test('MODES cannot be mutated', () => {
  assert.throws(() => {
    'use strict';
    MODES.fast = { id: 'hacked' };
  });
  assert.equal(MODES.fast.id, 'fast');
});

test('the default mode is always a valid mode', () => {
  assert.ok(isValidMode(getDefaultModeId()));
  assert.equal(resolveMode(undefined).id, getDefaultModeId());
});

test('provider name is configurable and non-empty', () => {
  assert.ok(getProviderName(), 'provider name must not be empty');
});
