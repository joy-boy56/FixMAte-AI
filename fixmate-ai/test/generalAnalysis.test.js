/**
 * Regression tests for the general-analysis hardening.
 *
 * These cover the bugs that were found in review:
 *   1. A model-controlled diagnostic `code` of "__proto__" used to crash the
 *      pattern grouping (`codeGroups[code].push is not a function`), which
 *      silently replaced the whole General Analysis panel with an error.
 *   2. The raw upstream error was returned to the browser, which can embed
 *      the base URL, the model name and provider request ids.
 *
 * Run with: npm test
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { generateGeneralAnalysis } = require('../src/analysis/aiAnalyzer');
const { sanitizeAiError } = require('../src/config/aiModels');

const HOSTILE_CODE = '__proto__';

const files = [
  { path: 'a.py', language: 'python', content: 'x=1' },
  { path: 'b.py', language: 'python', content: 'y=2' },
  { path: 'c.py', language: 'python', content: 'z=3' },
  { path: 'd.py', language: 'python', content: 'w=4' },
];

/**
 * Group diagnostics by code the way the general analysis does.
 *
 * A Map is used because the code is model-controlled: a code of "__proto__"
 * would otherwise hit Object.prototype and `codeGroups[code].push` would
 * throw a TypeError.
 */
function groupCodesByCode(diagnostics) {
  const codeGroups = new Map();
  for (const d of diagnostics) {
    const code = String(d.code || 'Unknown');
    if (!codeGroups.has(code)) codeGroups.set(code, []);
    codeGroups.get(code).push(d.file);
  }
  return codeGroups;
}

test('grouping by code does not throw for a code of __proto__', () => {
  const diagnostics = [
    { code: HOSTILE_CODE, file: 'a.py' },
    { code: HOSTILE_CODE, file: 'b.py' },
  ];
  assert.doesNotThrow(() => groupCodesByCode(diagnostics));
  const groups = groupCodesByCode(diagnostics);
  assert.equal(groups.get(HOSTILE_CODE).length, 2);
});

test('grouping by code does not throw for other prototype-chain codes', () => {
  for (const code of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    const groups = groupCodesByCode([{ code, file: 'a.py' }]);
    assert.equal(groups.get(code).length, 1, `${code} must be grouped normally`);
  }
});

test('generateGeneralAnalysis survives hostile diagnostic types and codes', async () => {
  // The full call path - including prompt building, grouping and the
  // fallback generators - must survive a model-controlled value that used
  // to throw.
  const hostileDiagnostics = [
    { file: 'a.py', line: 1, type: 'Critical', code: HOSTILE_CODE, message: 'boom', language: 'python' },
    { file: 'b.py', line: 2, type: 'bogus', code: 'constructor', message: 'bang', language: 'python' },
    { file: 'c.py', line: 3, type: undefined, code: 'toString', message: 'zap', language: 'python' },
    { file: 'd.py', line: 4, type: null, code: 'valueOf', message: 'pow', language: 'python' },
  ];

  const ga = await generateGeneralAnalysis(hostileDiagnostics, files, 'fast');

  assert.ok(ga, 'the general analysis must be returned');
  assert.ok(Array.isArray(ga.patterns));
  assert.ok(Array.isArray(ga.priorities));
  assert.ok(Array.isArray(ga.quickWins));
  assert.ok(Array.isArray(ga.normalFixes));
});

test('sanitizeAiError never returns the raw upstream message', () => {
  const raw = new Error(
    '404 The model `nvidia/nemotron-secret` does not exist at https://provider.example/v1'
  );
  const safe = sanitizeAiError(raw, 'AI request failed.');
  assert.equal(safe, 'AI request failed.');
  assert.ok(!safe.includes('nemotron-secret'));
  assert.ok(!safe.includes('provider.example'));
});

test('the general analysis never leaks the upstream error to the client', () => {
  // A provider that rejects the model leaks the model name and the base URL
  // in its error body. A child process is used because the OpenAI client is
  // cached on first use, so the base URL has to be set before the module
  // ever talks to the network.
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, 'fixtures', 'mock-provider.js')],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60000,
      // The point of the test is the failure path, so the error is expected.
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const resultLine = output
    .trim()
    .split('\n')
    .filter((l) => l.startsWith('RESULT '))
    .pop();
  assert.ok(resultLine, 'the mock provider must return a result');
  const ga = JSON.parse(resultLine.slice('RESULT '.length));

  assert.ok(ga, 'a general analysis object must be returned');
  assert.ok(
    !output.includes('nemotron-secret'),
    'the model name from the upstream error must not be returned'
  );
  assert.ok(
    !output.includes('provider.example'),
    'the provider URL from the upstream error must not be returned'
  );
  assert.ok(
    !output.includes('req_super_secret'),
    'the provider request id must not be returned'
  );
  assert.equal(ga.error, 'General analysis unavailable.');
  assert.equal(ga.summary, 'General analysis could not be generated.');
});
