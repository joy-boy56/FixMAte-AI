const OpenAI = require('openai');
const { buildSystemPrompt, buildUserPrompt } = require('../prompts/debugPrompt');

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
  timeout: 60000,
  maxRetries: 2
});

async function diagnoseError({ language, runtime, code, error, expected, actual, mode }) {
  const systemPrompt = buildSystemPrompt(mode);
  const userPrompt = buildUserPrompt({ language, runtime, code, error, expected, actual, mode });

  try {
    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }

    return parseDiagnosisResponse(responseContent);
  } catch (err) {
    if (err.status === 401) {
      throw new Error('Invalid NVIDIA API key. Please check your .env configuration.');
    }
    if (err.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      throw new Error('Request timed out. The AI service took too long to respond.');
    }
    throw err;
  }
}

function parseDiagnosisResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown code fences if present
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        throw new Error('Failed to parse AI response as JSON');
      }
    } else {
      throw new Error('Failed to parse AI response as JSON');
    }
  }

  // Validate and sanitize the response structure
  return sanitizeDiagnosis(parsed);
}

function sanitizeDiagnosis(data) {
  const result = {
    error_name: data.error_name || null,
    error_category: data.error_category || null,
    summary: data.summary || '',
    severity: validateEnum(data.severity, ['Low', 'Medium', 'High']) ? data.severity : null,
    confidence: validateEnum(data.confidence, ['High', 'Medium', 'Low']) ? data.confidence : null,
    possible_causes: Array.isArray(data.possible_causes) ? data.possible_causes.map(sanitizeCause).filter(Boolean) : [],
    recommended_fix: sanitizeFix(data.recommended_fix),
    code_changes: Array.isArray(data.code_changes) ? data.code_changes.map(sanitizeChange).filter(Boolean) : [],
    explanation: data.explanation || '',
    alternative_fixes: Array.isArray(data.alternative_fixes) ? data.alternative_fixes.map(sanitizeAlternative).filter(Boolean) : [],
    verification_steps: Array.isArray(data.verification_steps) ? data.verification_steps.map(sanitizeVerification).filter(Boolean) : [],
    prevention_tips: Array.isArray(data.prevention_tips) ? data.prevention_tips.filter(t => typeof t === 'string' && t.trim()) : [],
    missing_information: Array.isArray(data.missing_information) ? data.missing_information.filter(t => typeof t === 'string' && t.trim()) : []
  };

  return result;
}

function validateEnum(value, allowed) {
  return value && allowed.includes(value);
}

function sanitizeCause(cause) {
  if (!cause || typeof cause !== 'object') return null;
  return {
    cause: typeof cause.cause === 'string' ? cause.cause : '',
    likelihood: validateEnum(cause.likelihood, ['High', 'Medium', 'Low']) ? cause.likelihood : 'Medium',
    evidence: typeof cause.evidence === 'string' ? cause.evidence : '',
    verification: typeof cause.verification === 'string' ? cause.verification : ''
  };
}

function sanitizeFix(fix) {
  if (!fix || typeof fix !== 'object') return { explanation: '', corrected_code: '' };
  return {
    explanation: typeof fix.explanation === 'string' ? fix.explanation : '',
    corrected_code: typeof fix.corrected_code === 'string' ? fix.corrected_code : ''
  };
}

function sanitizeChange(change) {
  if (!change || typeof change !== 'object') return null;
  return {
    original: typeof change.original === 'string' ? change.original : '',
    replacement: typeof change.replacement === 'string' ? change.replacement : '',
    reason: typeof change.reason === 'string' ? change.reason : ''
  };
}

function sanitizeAlternative(alt) {
  if (!alt || typeof alt !== 'object') return null;
  return {
    solution: typeof alt.solution === 'string' ? alt.solution : '',
    tradeoff: typeof alt.tradeoff === 'string' ? alt.tradeoff : ''
  };
}

function sanitizeVerification(step) {
  if (!step || typeof step !== 'object') return null;
  return {
    step: typeof step.step === 'string' ? step.step : '',
    expected_result: typeof step.expected_result === 'string' ? step.expected_result : ''
  };
}

module.exports = { diagnoseError };