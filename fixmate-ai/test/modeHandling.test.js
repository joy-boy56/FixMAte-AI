/**
 * Regression tests for the mode-handling and diagnostic-normalisation fixes.
 *
 * These import the REAL production helpers - a copy of the logic in the test
 * file would still pass after a regression in the source, so it would not be
 * a regression test at all.
 *
 * Run with: npm test
 */

const { test } = require('node:test');
const assert = require('node:assert');

const {
  isValidMode,
  resolveMode,
  getDefaultModeId,
  readMode,
  isRetryableError,
} = require('../src/config/aiModels');

const {
  normalizeDiagnosticType,
  normalizeSeverity,
  generalAnalysisMaxTokens,
  focusDiagnosticLimit,
  MAX_FOCUS_DIAGNOSTICS,
  MAX_PATTERNS,
} = require('../src/analysis/aiAnalyzer');

// ---------------------------------------------------------------------------
// Mode validation
// ---------------------------------------------------------------------------

test('readMode accepts the known modes', () => {
  assert.equal(readMode({ mode: 'fast' }), 'fast');
  assert.equal(readMode({ mode: 'max' }), 'max');
});

test('readMode returns undefined for unknown string modes', () => {
  assert.equal(readMode({ mode: 'garbage' }), undefined);
  assert.equal(readMode({ mode: 'constructor' }), undefined);
  assert.equal(readMode({ mode: '__proto__' }), undefined);
  assert.equal(readMode({ mode: 'toString' }), undefined);
});

test('readMode returns undefined for missing or empty modes', () => {
  assert.equal(readMode({}), undefined);
  assert.equal(readMode({ mode: '' }), undefined);
  assert.equal(readMode({ mode: null }), undefined);
  assert.equal(readMode({ mode: undefined }), undefined);
  assert.equal(readMode(undefined), undefined);
});

test('readMode never throws for a non-string mode', () => {
  // Regression test: a mode object with a non-callable own toString used to
  // throw while being interpolated into the log message, producing a 500.
  const hostile = { toString: 1 };
  assert.doesNotThrow(() => readMode({ mode: hostile }));
  assert.equal(readMode({ mode: hostile }), undefined);

  assert.doesNotThrow(() => readMode({ mode: { toString: null } }));
  assert.equal(readMode({ mode: { toString: null } }), undefined);

  assert.doesNotThrow(() => readMode({ mode: [] }));
  assert.equal(readMode({ mode: [] }), undefined);

  assert.doesNotThrow(() => readMode({ mode: 42 }));
  assert.equal(readMode({ mode: 42 }), undefined);

  assert.doesNotThrow(() => readMode({ mode: true }));
  assert.equal(readMode({ mode: true }), undefined);
});

test('an invalid mode always resolves to the default mode with a model', () => {
  for (const bad of ['garbage', 'constructor', '', null, undefined, 42, {}, []]) {
    const mode = resolveMode(bad);
    assert.equal(mode.id, getDefaultModeId());
    assert.ok(mode.model, `mode for ${String(bad)} must have a model`);
  }
});

test('isValidMode rejects every prototype-chain key', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.equal(isValidMode(key), false, `${key} must not be a valid mode`);
  }
});

// ---------------------------------------------------------------------------
// Fallback error classification
// ---------------------------------------------------------------------------

test('non-retryable statuses fail fast instead of burning the fallback', () => {
  // A 401/403 means the credentials are wrong - the fallback model would
  // fail the same way, so trying it only doubles the upstream requests.
  assert.equal(isRetryableError({ status: 401 }), false);
  assert.equal(isRetryableError({ status: 403 }), false);
});

test('retryable statuses do trigger the fallback', () => {
  for (const status of [404, 408, 409, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableError({ status }), true, `status ${status} must be retryable`);
  }
});

test('a status-less error is retryable', () => {
  assert.equal(isRetryableError(new Error('socket hang up')), true);
  assert.equal(isRetryableError(null), false);
});

// ---------------------------------------------------------------------------
// Diagnostic type normalisation
// ---------------------------------------------------------------------------

test('normalizeDiagnosticType maps known types', () => {
  assert.equal(normalizeDiagnosticType('error'), 'error');
  assert.equal(normalizeDiagnosticType('warning'), 'warning');
  assert.equal(normalizeDiagnosticType('info'), 'info');
});

test('normalizeDiagnosticType maps aliases to the right bucket', () => {
  assert.equal(normalizeDiagnosticType('critical'), 'error');
  assert.equal(normalizeDiagnosticType('fatal'), 'error');
  assert.equal(normalizeDiagnosticType('warn'), 'warning');
});

test('normalizeDiagnosticType is case and whitespace insensitive', () => {
  assert.equal(normalizeDiagnosticType('ERROR'), 'error');
  assert.equal(normalizeDiagnosticType(' Warning '), 'warning');
  assert.equal(normalizeDiagnosticType('Critical'), 'error');
});

test('normalizeDiagnosticType never returns an unknown bucket', () => {
  // Regression test: an unexpected type used to make byType[diag.type].push
  // throw, which 500-ed the entire scan.
  for (const bad of ['Critical', 'bogus', '', null, undefined, 0, {}, []]) {
    const result = normalizeDiagnosticType(bad);
    assert.ok(
      ['error', 'warning', 'info'].includes(result),
      `type ${String(bad)} must map to a known bucket, got ${result}`
    );
  }
});

test('every diagnostic type buckets without throwing', () => {
  const byType = { error: [], warning: [], info: [] };
  const diagnostics = [
    { type: 'error' },
    { type: 'Critical' },
    { type: 'bogus' },
    { type: undefined },
    { type: null },
    { type: 123 },
  ];
  for (const diag of diagnostics) {
    assert.doesNotThrow(() => {
      byType[normalizeDiagnosticType(diag.type)].push(diag);
    });
  }
  assert.equal(byType.error.length, 2);
  assert.equal(byType.info.length, 4);
});

// ---------------------------------------------------------------------------
// Severity normalisation
// ---------------------------------------------------------------------------

test('normalizeSeverity maps known severities', () => {
  assert.equal(normalizeSeverity('high'), 'high');
  assert.equal(normalizeSeverity('medium'), 'medium');
  assert.equal(normalizeSeverity('low'), 'low');
});

test('normalizeSeverity maps aliases', () => {
  assert.equal(normalizeSeverity('critical'), 'high');
  assert.equal(normalizeSeverity('error'), 'high');
  assert.equal(normalizeSeverity('minor'), 'low');
  assert.equal(normalizeSeverity('info'), 'low');
});

test('normalizeSeverity never returns an unknown bucket', () => {
  // Severity is used as an object key in the scan summary, so an unexpected
  // value must never be able to poison the counters.
  for (const bad of ['constructor', '__proto__', 'bogus', '', null, undefined, 0, {}]) {
    const result = normalizeSeverity(bad);
    assert.ok(
      ['high', 'medium', 'low'].includes(result),
      `severity ${String(bad)} must map to a known bucket, got ${result}`
    );
  }
});

test('a severity of __proto__ cannot poison an object counter', () => {
  const counter = { high: 0, medium: 0, low: 0 };
  const severity = normalizeSeverity('__proto__');
  counter[severity] = (counter[severity] || 0) + 1;
  assert.deepEqual(Object.keys(counter).sort(), ['high', 'low', 'medium']);
  assert.equal(counter.medium, 1);
});

// ---------------------------------------------------------------------------
// General analysis token budget
// ---------------------------------------------------------------------------

test('the general analysis budget never exceeds the mode budget', () => {
  // Regression test: the derived budget used to exceed the mode budget
  // (fast mode asked for 2280 tokens with a 2048 budget).
  assert.equal(generalAnalysisMaxTokens(2048, 12), 2048);
  assert.equal(generalAnalysisMaxTokens(2048, 100), 2048);
  assert.equal(generalAnalysisMaxTokens(1024, 12), 1024);
  for (const focus of [1, 5, 12, 50, 1000]) {
    for (const budget of [1024, 2048, 4096]) {
      assert.ok(
        generalAnalysisMaxTokens(budget, focus) <= budget,
        `budget for mode=${budget} focus=${focus} must not exceed the mode budget`
      );
    }
  }
});

test('the general analysis budget never exceeds the hard cap', () => {
  assert.equal(generalAnalysisMaxTokens(4096, 1000), 4096);
});

test('the general analysis budget has a floor', () => {
  assert.equal(generalAnalysisMaxTokens(2048, 1), 1200);
  assert.equal(generalAnalysisMaxTokens(4096, 1), 1200);
});

test('the general analysis budget scales with the focus set', () => {
  assert.ok(generalAnalysisMaxTokens(4096, 12) > generalAnalysisMaxTokens(4096, 2));
});

test('the focus count is derived from the token budget', () => {
  // A 2048-token budget cannot fit 12 focus diagnostics (each needs three
  // array entries), so the count has to be reduced or the JSON gets
  // truncated.
  assert.ok(
    focusDiagnosticLimit(2048) < MAX_FOCUS_DIAGNOSTICS,
    `a 2048-token budget must fit fewer than ${MAX_FOCUS_DIAGNOSTICS} focus diagnostics`
  );
  assert.equal(focusDiagnosticLimit(4096), MAX_FOCUS_DIAGNOSTICS);
});

test('the focus count is always at least one', () => {
  assert.equal(focusDiagnosticLimit(64), 1);
  assert.equal(focusDiagnosticLimit(0), 1);
  assert.equal(focusDiagnosticLimit(1024), 3);
});

test('the focus count never exceeds the hard cap', () => {
  assert.equal(focusDiagnosticLimit(100000), MAX_FOCUS_DIAGNOSTICS);
});

test('the patterns cap is bounded', () => {
  assert.ok(MAX_PATTERNS > 0 && MAX_PATTERNS <= 50);
});
