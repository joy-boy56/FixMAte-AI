/**
 * AI Model Configuration
 * Single source of truth for model selection.
 *
 * All model names, token budgets, and the API base URL are read from the
 * environment (.env), so switching models never requires a code change.
 *
 * Env vars:
 *   AI_BASE_URL          - OpenAI-compatible endpoint base
 *   AI_PROVIDER_NAME     - display name shown in /api/health
 *   AI_MODEL_FAST        - model used for "Fast" mode
 *   AI_MODEL_MAX         - model used for "Max" mode
 *   AI_MODEL_FALLBACK    - model tried when the primary model errors
 *   AI_MAX_TOKENS_FAST   - max output tokens for Fast mode
 *   AI_MAX_TOKENS_MAX    - max output tokens for Max mode
 *   AI_DEFAULT_MODE      - mode used when the client does not request one
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const OpenAI = require('openai');

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

function parseTokens(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Model names live in .env only. The defaults below are the last-resort
// values used when the corresponding env var is missing, so a misconfigured
// deployment still boots instead of crashing - but `warnMissingEnv()` reports
// it at startup. Switching models always means editing .env, never code.
const FALLBACK_MODEL = process.env.AI_MODEL_FALLBACK || 'minimaxai/minimax-m3.1-flash';

const MODES = Object.freeze({
  fast: Object.freeze({
    id: 'fast',
    label: 'Fast',
    model: process.env.AI_MODEL_FAST || 'nvidia/nemotron-3.5-bolt-e4b',
    maxTokens: parseTokens(process.env.AI_MAX_TOKENS_FAST, 2048),
    fallback: FALLBACK_MODEL,
    description: 'Fast, accurate issue detection',
  }),
  max: Object.freeze({
    id: 'max',
    label: 'Max',
    model: process.env.AI_MODEL_MAX || 'nvidia/nemotron-3-ultra-550b-a55b',
    maxTokens: parseTokens(process.env.AI_MAX_TOKENS_MAX, 4096),
    fallback: FALLBACK_MODEL,
    description: 'Deepest reasoning - slower',
  }),
});

const DEFAULT_MODE_ID = isValidMode(process.env.AI_DEFAULT_MODE)
  ? process.env.AI_DEFAULT_MODE
  : 'fast';

const PROVIDER_NAME = process.env.AI_PROVIDER_NAME || 'NVIDIA Nemotron';

/**
 * True only for a real, own key of MODES.
 * Uses hasOwnProperty so prototype-chain names ("constructor", "toString",
 * "__proto__") are never treated as valid modes.
 */
function isValidMode(modeId) {
  return (
    typeof modeId === 'string' &&
    Object.prototype.hasOwnProperty.call(MODES, modeId)
  );
}

/**
 * Resolve a mode id into its full configuration.
 * Unknown or malformed ids fall back to the default mode.
 */
function resolveMode(modeId) {
  if (isValidMode(modeId)) return MODES[modeId];
  return MODES[DEFAULT_MODE_ID];
}

/**
 * Public (frontend-safe) description of every available mode.
 * The frontend uses this so no model name is ever hardcoded in the browser.
 * Token budgets are intentionally NOT exposed.
 */
function getAvailableModes() {
  return Object.values(MODES).map((mode) => ({
    id: mode.id,
    label: mode.label,
    model: mode.model,
    description: mode.description,
  }));
}

function getDefaultModeId() {
  return DEFAULT_MODE_ID;
}

function getProviderName() {
  return PROVIDER_NAME;
}

/**
 * Read and validate a requested mode id from a request body.
 *
 * This is the single entry point used by every route that accepts a mode, so
 * the validation rules cannot drift between endpoints.
 *
 * Only strings are considered. Anything else (object, array, number, null)
 * falls back to the server default without ever being interpolated into a
 * log string - a hostile `{ toString: 1 }` must not be able to throw.
 */
function readMode(source) {
  const requested = source?.mode;
  if (typeof requested !== 'string' || requested === '') {
    return undefined;
  }
  if (!isValidMode(requested)) {
    return undefined;
  }
  return requested;
}

/**
 * Reduce an upstream AI error to a safe, non-leaking message.
 *
 * Raw OpenAI-compatible SDK errors embed the base URL, the model name and
 * provider request ids. Those must not reach the browser, so only a fixed
 * generic message is returned; the full error is logged server-side.
 */
function sanitizeAiError(err, fallbackMessage = 'AI request failed.') {
  console.error('[AI Models] Upstream AI error:', err?.message || err);
  return fallbackMessage;
}

/**
 * Report env vars that are missing and therefore running on their built-in
 * default. Called once at startup so a misconfiguration is visible in the
 * server log instead of surfacing later as a confusing model error.
 */
function warnMissingEnv() {
  const missing = [];
  if (!process.env.AI_MODEL_FAST) missing.push('AI_MODEL_FAST');
  if (!process.env.AI_MODEL_MAX) missing.push('AI_MODEL_MAX');
  if (!process.env.AI_MODEL_FALLBACK) missing.push('AI_MODEL_FALLBACK');
  if (!process.env.AI_BASE_URL) missing.push('AI_BASE_URL');
  if (missing.length) {
    console.warn(
      `[AI Models] Using built-in defaults for: ${missing.join(', ')}. ` +
        'Set them in .env to control the models.'
    );
  }
}

/**
 * The API key is sent as a Bearer token to AI_BASE_URL, so the URL is
 * validated before it is used for anything.
 */
function resolveBaseUrl() {
  const raw = process.env.AI_BASE_URL || DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`AI_BASE_URL is not a valid URL: ${raw}`);
  }
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    // WHATWG URL keeps the brackets around an IPv6 literal.
    url.hostname === '[::1]' ||
    url.hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('AI_BASE_URL must use https:// (http:// is only allowed for localhost)');
  }
  return url.toString().replace(/\/$/, '');
}

/**
 * The API key is sent as a Bearer token to AI_BASE_URL.
 *
 * AI_API_KEY is the provider-neutral name and takes precedence; NVIDIA_API_KEY
 * is kept for backwards compatibility with the existing deployment.
 */
function getApiKey() {
  return process.env.AI_API_KEY || process.env.NVIDIA_API_KEY;
}

/**
 * Shared OpenAI-compatible client. Uses AI_BASE_URL from the environment.
 */
let sharedClient = null;
function getClient() {
  if (!sharedClient) {
    sharedClient = new OpenAI({
      baseURL: resolveBaseUrl(),
      apiKey: getApiKey(),
      timeout: 60000,
      maxRetries: 2,
    });
  }
  return sharedClient;
}

/**
 * HTTP statuses where trying the fallback model can plausibly help.
 *
 * A 401/403 means the credentials are wrong - the fallback would fail the
 * same way, so those fail fast instead of doubling the upstream requests.
 * A status-less error (network, timeout) is retryable.
 */
const RETRYABLE_STATUSES = new Set([404, 408, 409, 429, 500, 502, 503, 504]);

function isRetryableError(err) {
  if (!err) return false;
  if (!err.status) return true;
  return RETRYABLE_STATUSES.has(err.status);
}

/**
 * Create a chat completion for a given mode, transparently falling back to
 * the configured fallback model when the primary model fails.
 *
 * `validate` is an optional callback that receives the raw completion. It
 * should throw when the response is unusable (empty content, unparseable
 * JSON). Because it runs inside the attempt loop, a primary model that
 * answers with garbage also triggers the fallback - not just transport
 * errors.
 *
 * Returns { completion, modelUsed } so callers can surface which model
 * actually answered.
 */
async function createCompletion(modeId, payload = {}, validate) {
  const mode = resolveMode(modeId);
  const client = getClient();
  const { max_tokens: requestedTokens, ...rest } = payload;

  const candidates = [...new Set([mode.model, mode.fallback].filter(Boolean))];
  let lastError = null;

  for (const model of candidates) {
    try {
      const completion = await client.chat.completions.create({
        ...rest,
        model,
        max_tokens: requestedTokens || mode.maxTokens,
      });
      if (typeof validate === 'function') {
        validate(completion);
      }
      return { completion, modelUsed: model };
    } catch (err) {
      console.warn(`[AI Models] Model "${model}" failed: ${err.message}`);
      lastError = err;
      // A non-retryable status (401/403) will not improve with another
      // model, so stop instead of burning more upstream requests.
      if (!isRetryableError(err)) break;
    }
  }

  throw lastError || new Error(`All models failed for mode "${mode.id}"`);
}

function hasApiKey() {
  return Boolean(getApiKey());
}

module.exports = {
  MODES,
  DEFAULT_MODE_ID,
  PROVIDER_NAME,
  isValidMode,
  resolveMode,
  getAvailableModes,
  getDefaultModeId,
  getProviderName,
  getClient,
  createCompletion,
  hasApiKey,
  readMode,
  sanitizeAiError,
  warnMissingEnv,
  isRetryableError,
};
