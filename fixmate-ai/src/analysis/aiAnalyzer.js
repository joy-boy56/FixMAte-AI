/**
 * AI-Powered Code Analyzer
 * Uses NVIDIA Nemotron to detect errors and provide explanations in a single call
 */

const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
  timeout: 60000,
  maxRetries: 2,
});

/**
 * System prompt for AI code analysis
 */
function getAnalysisSystemPrompt() {
  return `You are FixMate AI, an expert code analyzer and debugging assistant.

Analyze the provided code file and identify ALL issues including:
1. Syntax errors (parse errors, missing brackets, invalid syntax)
2. Runtime errors (undefined variables, type errors, null references)
3. Logic errors (infinite loops, incorrect conditions, off-by-one)
4. Best practice violations (unused variables, deprecated patterns)
5. Security issues (eval, SQL injection, XSS vulnerabilities)
6. Performance issues (inefficient algorithms, memory leaks)

For each issue found, provide a detailed explanation.

Return ONLY valid JSON in this exact format:
{
  "issues": [
    {
      "id": "unique-uuid-v4",
      "type": "error|warning|info",
      "code": "ErrorCodeOrCategory",
      "message": "Human-readable description of the issue",
      "line": 1,
      "column": 1,
      "sourceLine": "the problematic line of code",
      "severity": "high|medium|low",
      "explanation": {
        "whatHappened": "What specific error/issue occurred",
        "where": "file:line:column",
        "why": "Why this issue occurred in plain language",
        "likelyMistake": "What the developer likely did wrong",
        "recommendedFix": {
          "code": "Corrected code snippet",
          "explanation": "Why this fix works"
        },
        "concept": "The programming concept being misunderstood",
        "verification": "How to verify the fix works",
        "prevention": "How to avoid this mistake in the future",
        "confidence": "high|medium|low",
        "notes": "Additional context if needed"
      }
    }
  ],
  "summary": {
    "totalIssues": 0,
    "errors": 0,
    "warnings": 0,
    "info": 0
  }
}

IMPORTANT RULES:
- Return ONLY the JSON object, no markdown, no extra text
- If no issues found, return {"issues": [], "summary": {"totalIssues": 0, "errors": 0, "warnings": 0, "info": 0}}
- Use "high" for syntax/runtime errors that prevent execution
- Use "medium" for logic errors, best practice violations
- Use "low" for style, optimization suggestions
- Generate valid UUID v4 for each issue id
- The sourceLine should be the exact line from the code
- Be thorough but don't hallucinate issues that don't exist
- Distinguish between parser-reported facts and your inferences
- Use "likely" or "probably" for inferred causes`;
}

/**
 * Build the analysis prompt for a file
 */
function buildAnalysisPrompt(filePath, language, content) {
  return `Analyze this ${language} file for errors and issues:

File: ${filePath}
Language: ${language}

\`\`\`${language.toLowerCase()}
${content}
\`\`\``;
}

/**
 * Analyze a single file using AI
 */
async function analyzeFileWithAI(filePath, language, content) {
  console.log(`[AI Analyzer] Starting analysis for ${filePath} (${language}, ${content.length} chars)`);
  
  if (!process.env.NVIDIA_API_KEY) {
    console.error('[AI Analyzer] NVIDIA_API_KEY not set!');
    return {
      success: false,
      issues: [],
      error: 'AI service not configured. Set NVIDIA_API_KEY environment variable.',
    };
  }
  console.log('[AI Analyzer] API key present, length:', process.env.NVIDIA_API_KEY.length);

  // Skip empty files
  if (!content || content.trim().length === 0) {
    console.log('[AI Analyzer] Empty file, skipping');
    return { success: true, issues: [], summary: { totalIssues: 0, errors: 0, warnings: 0, info: 0 } };
  }

  try {
    const prompt = buildAnalysisPrompt(filePath, language, content);
    console.log('[AI Analyzer] Sending request to Nemotron...');

    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        { role: 'system', content: getAnalysisSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    console.log('[AI Analyzer] Received response from Nemotron');
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }

    console.log('[AI Analyzer] Response content length:', responseContent.length);

    let parsed;
    try {
      parsed = JSON.parse(responseContent);
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
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

    console.log('[AI Analyzer] Parsed response, issues found:', (parsed.issues || []).length);

    // Validate and sanitize response
    const issues = (parsed.issues || []).map(issue => ({
      id: issue.id || crypto.randomUUID(),
      file: filePath,
      language,
      type: issue.type || 'error',
      code: issue.code || 'Unknown',
      message: issue.message || 'Unknown issue',
      line: issue.line || 1,
      column: issue.column || 0,
      sourceLine: issue.sourceLine || '',
      severity: issue.severity || 'medium',
      explanation: issue.explanation || null,
      source: 'ai',
      timestamp: new Date().toISOString(),
    }));

    const summary = parsed.summary || {
      totalIssues: issues.length,
      errors: issues.filter(i => i.type === 'error').length,
      warnings: issues.filter(i => i.type === 'warning').length,
      info: issues.filter(i => i.type === 'info').length,
    };

    return {
      success: true,
      issues,
      summary,
    };
  } catch (err) {
    console.error(`[AI Analyzer] Error for ${filePath}:`, err);
    return {
      success: false,
      issues: [],
      error: err.message,
    };
  }
}

/**
 * Analyze multiple files in parallel (with concurrency limit)
 */
async function analyzeFilesWithAI(files, options = {}) {
  const concurrency = options.concurrency || 3;
  const results = [];
  
  // Process in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(file => 
      analyzeFileWithAI(file.path, file.language, file.content)
    );
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

module.exports = {
  analyzeFileWithAI,
  analyzeFilesWithAI,
};