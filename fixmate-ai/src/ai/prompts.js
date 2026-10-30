/**
 * AI Prompts Module
 * Builds prompts for diagnostic explanations
 */

/**
 * Build explanation prompt for a single diagnostic
 */
function buildExplanationPrompt(diagnostic, fileContext, projectContext = {}) {
  const { fileName, language, fullContent, errorLine, errorColumn, sourceLine } = fileContext;
  
  // Get context around the error
  const lines = fullContent.split('\n');
  const start = Math.max(0, errorLine - 4);
  const end = Math.min(lines.length, errorLine + 3);
  const contextLines = lines.slice(start, end).map((text, i) => ({
    number: start + i + 1,
    text,
    isErrorLine: start + i + 1 === errorLine,
  }));
  
  let prompt = `DIAGNOSTIC TO EXPLAIN:
- Error Type: ${diagnostic.type}
- Error Code: ${diagnostic.code}
- Parser Message: ${diagnostic.message}
- File: ${fileName}
- Language: ${language}
- Location: Line ${errorLine}, Column ${errorColumn}
- Source Line: ${sourceLine}

SOURCE CODE CONTEXT (lines ${start + 1}-${end}):
`;

  for (const cl of contextLines) {
    const marker = cl.isErrorLine ? '>>> ' : '    ';
    prompt += `${marker}${cl.number.toString().padStart(4)} | ${cl.text}\n`;
  }

  prompt += `
PROJECT CONTEXT:
- Total files: ${projectContext.totalFiles || 'unknown'}
- Languages: ${projectContext.languages?.join(', ') || 'unknown'}
- Other diagnostics in project: ${projectContext.totalDiagnostics || 'unknown'}

Please provide a structured explanation in this JSON format:
{
  "whatHappened": "Clear description of what the parser detected",
  "where": "Specific location reference (file:line:column)",
  "why": "Technical explanation of why this error occurs in this language",
  "likelyMistake": "What the developer most likely did wrong",
  "recommendedFix": {
    "code": "Corrected code snippet",
    "explanation": "Why this fix resolves the issue"
  },
  "concept": "The programming concept or rule being violated",
  "verification": "Steps to verify the fix works",
  "prevention": "Tips to avoid this mistake in the future",
  "confidence": "high|medium|low",
  "notes": "Any additional context or caveats"
}

IMPORTANT:
- "whatHappened" and "where" should be based on parser facts
- "why", "likelyMistake", "recommendedFix" are your inferences - use "likely", "probably"
- "recommendedFix.code" should be a minimal, focused correction
- Do not modify unrelated code
- If the fix is uncertain, note it in "notes"`;

  return prompt;
}

/**
 * Build batch explanation prompt for multiple diagnostics in same file
 */
function buildBatchPrompt(diagnostics, fileContext, projectContext = {}) {
  // Similar to single but for multiple diagnostics
  return buildExplanationPrompt(diagnostics[0], fileContext, projectContext);
}

module.exports = {
  buildExplanationPrompt,
  buildBatchPrompt,
};