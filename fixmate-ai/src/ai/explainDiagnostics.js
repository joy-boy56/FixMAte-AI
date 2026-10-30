/**
 * AI Explanation Module
 * Uses NVIDIA Nemotron to generate educational explanations for diagnostics
 */

const OpenAI = require('openai');
const { buildExplanationPrompt } = require('./prompts');

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
  timeout: 60000,
  maxRetries: 2,
});

/**
 * Generate AI explanation for a diagnostic
 */
async function explainDiagnostic(diagnostic, fileContext, projectContext = {}) {
  if (!process.env.NVIDIA_API_KEY) {
    return {
      success: false,
      explanation: null,
      error: 'AI service not configured. Set NVIDIA_API_KEY environment variable.',
    };
  }
  
  try {
    const prompt = buildExplanationPrompt(diagnostic, fileContext, projectContext);
    
    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });
    
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }
    
    const explanation = parseExplanationResponse(responseContent);
    
    return {
      success: true,
      explanation,
    };
  } catch (err) {
    console.error('AI explanation error:', err);
    return {
      success: false,
      explanation: null,
      error: err.message,
    };
  }
}

/**
 * Explain multiple diagnostics (batched for efficiency)
 */
async function explainDiagnostics(diagnostics, files, projectContext = {}) {
  if (!process.env.NVIDIA_API_KEY) {
    return diagnostics.map(d => ({
      diagnosticId: d.id,
      success: false,
      explanation: null,
      error: 'AI service not configured',
    }));
  }
  
  // Group by file to provide better context
  const byFile = new Map();
  for (const diag of diagnostics) {
    if (!byFile.has(diag.file)) {
      byFile.set(diag.file, []);
    }
    byFile.get(diag.file).push(diag);
  }
  
  const results = [];
  
  // Process each file's diagnostics
  for (const [filePath, fileDiagnostics] of byFile) {
    const file = files.find(f => f.path === filePath);
    if (!file) continue;
    
    // For now, explain each diagnostic individually
    // In future, could batch related diagnostics
    for (const diag of fileDiagnostics) {
      const fileContext = {
        fileName: filePath,
        language: diag.language,
        fullContent: file.content,
        errorLine: diag.line,
        errorColumn: diag.column,
        sourceLine: diag.sourceLine,
      };
      
      const result = await explainDiagnostic(diag, fileContext, projectContext);
      results.push({
        diagnosticId: diag.id,
        ...result,
      });
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  return results;
}

/**
 * System prompt for AI explanations
 */
function getSystemPrompt() {
  return `You are FixMate AI, an expert programming educator and debugging assistant.

Your role is to explain programming errors to developers in a clear, educational manner.

When explaining a diagnostic:

1. IDENTIFY: What specific error occurred (referencing the parser's finding)
2. LOCATE: Where in the code it happened (file, line, column)
3. EXPLAIN: Why this error occurred in plain language
4. MISTAKE: What the developer likely did wrong
5. FIX: The recommended correction with code example
6. CONCEPT: The programming concept being misunderstood
7. VERIFICATION: How to verify the fix works
8. PREVENTION: How to avoid this mistake in the future

IMPORTANT RULES:
- Distinguish between parser-reported facts and your inferences
- Use "likely" or "probably" for inferred causes
- Never claim to have executed the code
- Do not fabricate library functions or language features
- If context is insufficient, state what additional info is needed
- Adapt explanation depth to the error complexity
- Be encouraging and educational, not condescending

Return valid JSON only. No markdown code fences.`;
}

/**
 * Parse AI explanation response
 */
function parseExplanationResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown
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
  
  // Validate and sanitize
  return {
    whatHappened: parsed.whatHappened || '',
    where: parsed.where || '',
    why: parsed.why || '',
    likelyMistake: parsed.likelyMistake || '',
    recommendedFix: parsed.recommendedFix || { code: '', explanation: '' },
    concept: parsed.concept || '',
    verification: parsed.verification || '',
    prevention: parsed.prevention || '',
    confidence: parsed.confidence || 'medium',
    notes: parsed.notes || '',
  };
}

/**
 * Get explanation for a single diagnostic (with caching potential)
 */
async function getExplanation(diagnosticId, diagnostics, files, projectContext) {
  const diagnostic = diagnostics.find(d => d.id === diagnosticId);
  if (!diagnostic) {
    return { success: false, error: 'Diagnostic not found' };
  }
  
  const file = files.find(f => f.path === diagnostic.file);
  if (!file) {
    return { success: false, error: 'Source file not found' };
  }
  
  const fileContext = {
    fileName: diagnostic.file,
    language: diagnostic.language,
    fullContent: file.content,
    errorLine: diagnostic.line,
    errorColumn: diagnostic.column,
    sourceLine: diagnostic.sourceLine,
  };
  
  return explainDiagnostic(diagnostic, fileContext, projectContext);
}

module.exports = {
  explainDiagnostic,
  explainDiagnostics,
  getExplanation,
  parseExplanationResponse,
};