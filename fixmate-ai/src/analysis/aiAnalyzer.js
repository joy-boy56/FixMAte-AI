/**
 * AI-Powered Code Analyzer
 * Uses NVIDIA Nemotron (or any OpenAI-compatible model) to detect errors
 * and provide explanations in a single call.
 *
 * Model selection is controlled by src/config/aiModels.js (env-driven).
 */

const crypto = require('crypto');
const { createCompletion, resolveMode, hasApiKey, sanitizeAiError } = require('../config/aiModels');

// Maximum number of diagnostics that get their own entry in the general
// analysis "priorities" / "quickWins" / "normalFixes" arrays. Keeps the
// response within the token budget on large projects.
const MAX_FOCUS_DIAGNOSTICS = 12;

// Maximum number of recurring patterns reported. Patterns are grouped by
// diagnostic code, so a project with many distinct codes would otherwise
// produce an unbounded array.
const MAX_PATTERNS = 25;

// Token budget for the general analysis call. Scaled with the number of
// focus diagnostics, but never exceeds the mode budget (a model may reject a
// larger request) and never exceeds 4096 (the largest budget the configured
// models reliably accept).
const GENERAL_ANALYSIS_MIN_TOKENS = 1200;
const GENERAL_ANALYSIS_MAX_TOKENS = 4096;
const TOKENS_PER_FOCUS_DIAGNOSTIC = 140;

// Severity ranking used to pick the diagnostics that get a dedicated fix.
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

/**
 * Normalise an AI-provided diagnostic type into one of error/warning/info.
 * The type is model-controlled, so an unexpected value must never throw.
 */
function normalizeDiagnosticType(type) {
  const t = String(type || '').toLowerCase().trim();
  if (t === 'error' || t === 'critical' || t === 'fatal') return 'error';
  if (t === 'warning' || t === 'warn') return 'warning';
  return 'info';
}

/**
 * Normalise an AI-provided severity into one of high/medium/low.
 * Severity is model-controlled and is used as an object key downstream, so
 * an unexpected value must never be able to poison the counters.
 */
function normalizeSeverity(severity) {
  const s = String(severity || '').toLowerCase().trim();
  if (s === 'high' || s === 'critical' || s === 'error') return 'high';
  if (s === 'low' || s === 'minor' || s === 'info') return 'low';
  return 'medium';
}

/**
 * Token budget for the general analysis call.
 *
 * Derived from the number of focus diagnostics but always clamped to the
 * mode's own budget - the configured models reject a request for more tokens
 * than they accept.
 */
function generalAnalysisMaxTokens(modeMaxTokens, focusCount) {
  const derived = focusCount * TOKENS_PER_FOCUS_DIAGNOSTIC + 600;
  return Math.min(
    modeMaxTokens,
    GENERAL_ANALYSIS_MAX_TOKENS,
    Math.max(GENERAL_ANALYSIS_MIN_TOKENS, derived)
  );
}

/**
 * How many diagnostics can get a dedicated fix within the mode's budget.
 *
 * Each focus diagnostic needs an entry in priorities, quickWins and
 * normalFixes, so the count has to be derived from the token budget -
 * otherwise a small budget truncates the JSON response.
 */
function focusDiagnosticLimit(modeMaxTokens) {
  const affordable = Math.floor(
    (modeMaxTokens - 600) / TOKENS_PER_FOCUS_DIAGNOSTIC
  );
  return Math.max(1, Math.min(MAX_FOCUS_DIAGNOSTICS, affordable));
}

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

For each issue found, provide a concise explanation.

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
      "explanation": "Concise explanation of the issue and the fix in one sentence"
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
- Use "likely" or "probably" for inferred causes
- Keep explanation to ONE concise sentence per issue`;
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
async function analyzeFileWithAI(filePath, language, content, modeId) {
  console.log(`[AI Analyzer] Starting analysis for ${filePath} (${language}, ${content.length} chars)`);
  
  if (!hasApiKey()) {
    console.error('[AI Analyzer] No AI API key configured!');
    return {
      success: false,
      issues: [],
      error: 'AI service not configured. Set AI_API_KEY (or NVIDIA_API_KEY) in .env.',
    };
  }
  console.log('[AI Analyzer] API key present');

  // Skip empty files
  if (!content || content.trim().length === 0) {
    console.log('[AI Analyzer] Empty file, skipping');
    return { success: true, issues: [], summary: { totalIssues: 0, errors: 0, warnings: 0, info: 0 } };
  }

  const mode = resolveMode(modeId);

  try {
    const prompt = buildAnalysisPrompt(filePath, language, content);
    console.log(`[AI Analyzer] Sending request (mode=${mode.id}, model=${mode.model})...`);

    // createCompletion tries the mode's primary model, then its fallback.
    // The validate callback runs inside that loop, so a primary model that
    // answers with empty content also triggers the fallback.
    const { completion, modelUsed } = await createCompletion(
      modeId,
      {
        messages: [
          { role: 'system', content: getAnalysisSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      },
      (c) => {
        if (!c?.choices?.[0]?.message?.content) {
          throw new Error('Empty response from AI model');
        }
      }
    );

    console.log(`[AI Analyzer] Response from model: ${modelUsed}`);
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }

    console.log('[AI Analyzer] Response content length:', responseContent.length);

    // Extract JSON from response (handle markdown code fences, extra text, etc.)
    let jsonStr = responseContent.trim();
    
    // Remove markdown code fences if present
    const codeFenceMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeFenceMatch) {
      jsonStr = codeFenceMatch[1];
    } else {
      // Find the first complete JSON object
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('[AI Analyzer] JSON parse failed, trying recovery:', e.message);
      
      // Try to fix common truncation issues
      let fixed = jsonStr;
      
      // Fix unclosed strings by finding last complete key-value
      const openQuotes = (fixed.match(/"/g) || []).length;
      if (openQuotes % 2 !== 0) {
        const lastCompletePair = fixed.lastIndexOf('",');
        if (lastCompletePair > 0) {
          fixed = fixed.slice(0, lastCompletePair + 1) + '}';
        }
      }
      
      // Fix unclosed arrays/objects
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
      }
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        fixed += ']'.repeat(openBrackets - closeBrackets);
      }
      
      try {
        parsed = JSON.parse(fixed);
        console.log('[AI Analyzer] JSON recovered successfully');
      } catch (e2) {
        console.error('[AI Analyzer] Failed to parse JSON even after recovery');
        console.error(
          '[AI Analyzer] Failed to parse AI response as JSON (length=' +
            responseContent.length +
            ')'
        );
        throw new Error('Failed to parse AI response as JSON: ' + e.message);
      }
    }

    console.log('[AI Analyzer] Parsed response, issues found:', (parsed.issues || []).length);

    // Validate and sanitize response.
    // line/column are coerced to numbers because the model controls them and
    // they are rendered back into the UI.
    const toPos = (value, fallback, minimum) => {
      if (typeof value === 'boolean') return fallback;
      const n = Number(value);
      if (!Number.isFinite(n) || n < minimum) return fallback;
      return Math.floor(n);
    };
    const issues = (parsed.issues || []).map(issue => ({
      id: issue.id || crypto.randomUUID(),
      file: filePath,
      language,
      type: normalizeDiagnosticType(issue.type),
      code: String(issue.code || 'Unknown'),
      message: issue.message || 'Unknown issue',
      // Lines are 1-based; columns are 0-based.
      line: toPos(issue.line, 1, 1),
      column: toPos(issue.column, 0, 0),
      sourceLine: issue.sourceLine || '',
      severity: normalizeSeverity(issue.severity),
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
      modelUsed,
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
  const mode = options.mode;
  const results = [];
  
  // Process in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchPromises = batch.map(file => 
      analyzeFileWithAI(file.path, file.language, file.content, mode)
    );
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Generate a general/comprehensive analysis from all diagnostics
 */
async function generateGeneralAnalysis(diagnostics, files, modeId) {
  if (!diagnostics || diagnostics.length === 0) {
    return {
      summary: 'No issues found in the codebase.',
      patterns: [],
      priorities: [],
      quickWins: [],
      normalFixes: [],
    };
  }

  console.log('[AI Analyzer] Generating general analysis for', diagnostics.length, 'diagnostics');

  if (!hasApiKey()) {
    return {
      summary: 'AI service not configured. Set AI_API_KEY (or NVIDIA_API_KEY) in .env.',
      patterns: [],
      priorities: [],
      quickWins: [],
      normalFixes: [],
    };
  }

  const mode = resolveMode(modeId);

  // The per-diagnostic arrays scale the response size linearly. On a large
  // project an entry for every diagnostic overflows the token budget and the
  // response gets truncated, so only the most severe diagnostics get a
  // dedicated fix. The rest are covered by the summary and by the
  // diagnostic-derived fallback.
  //
  // The count is derived from the mode's token budget: each focus diagnostic
  // needs three array entries, so a small budget must not be asked for more
  // focus diagnostics than it can fit.
  const focusDiagnostics = [...diagnostics]
    .sort(
      (a, b) =>
        SEVERITY_RANK[normalizeDiagnosticType(a.type)] -
        SEVERITY_RANK[normalizeDiagnosticType(b.type)]
    )
    .slice(0, focusDiagnosticLimit(mode.maxTokens));

  // Group diagnostics by file and type.
  // Both the file name and the type come from the AI response, so they are
  // normalised and bucketed defensively - an unexpected value must not throw.
  // A null-prototype object is used for the file map because a file name of
  // "__proto__" would otherwise hit Object.prototype.
  const byFile = Object.create(null);
  const byType = { error: [], warning: [], info: [] };

  for (const diag of diagnostics) {
    const file = diag.file || 'unknown';
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(diag);

    const type = normalizeDiagnosticType(diag.type);
    byType[type].push(diag);
  }

  // Build context for AI
  const fileContexts = Object.entries(byFile).map(([file, diags]) => {
    const fileObj = files.find(f => f.path === file);
    const content = fileObj?.content || '';
    return {
      file,
      language: fileObj?.language || 'Unknown',
      diagnostics: diags,
      contentPreview: content.slice(0, 500), // Reduced context size to prevent truncation
    };
  });

  const prompt = `You are FixMate AI, providing a comprehensive code health analysis.

PROJECT OVERVIEW:
- Total files: ${Object.keys(byFile).length}
- Total diagnostics: ${diagnostics.length}
- Errors: ${byType.error.length}
- Warnings: ${byType.warning.length}
- Info: ${byType.info.length}

FILES WITH ISSUES:
${fileContexts.map(fc => `
=== ${fc.file} (${fc.language}) ===
Diagnostics: ${fc.diagnostics.length}
${fc.diagnostics.map(d => `  Line ${d.line}: [${normalizeDiagnosticType(d.type).toUpperCase()}] ${d.code} - ${d.message}`).join('\n')}
Content preview:
\`\`\`${fc.language.toLowerCase()}
${fc.contentPreview}
\`\`\`
`).join('\n')}

FOCUS DIAGNOSTICS (give each one a priorities, quickWins and normalFixes entry):
${focusDiagnostics.map(d => `  ${d.file}:${d.line} [${normalizeDiagnosticType(d.type).toUpperCase()}] ${d.code} - ${d.message}`).join('\n')}

Provide a comprehensive analysis in this JSON format:
{
  "summary": "2-3 sentence overall health assessment",
  "patterns": [
    {"pattern": "Pattern name", "description": "What this pattern means", "affectedFiles": ["file1", "file2"], "severity": "high|medium|low"}
  ],
  "priorities": [
    {"file": "file.js", "line": 10, "diagnostic": "ErrorCode", "priority": "critical|high|medium|low", "reason": "Why this should be fixed first"}
  ],
  "quickWins": [
    {"file": "file.js", "line": 5, "fix": "Quick fix description with corrected code snippet", "effort": "low|medium|high"}
  ],
  "normalFixes": [
    {"file": "file.js", "line": 10, "issue": "ErrorCode", "fix": "Detailed fix description with corrected code example", "effort": "low|medium|high", "explanation": "Why this fix works and prevents the issue"}
  ]
}

CRITICAL REQUIREMENTS - YOU MUST POPULATE ALL ARRAYS:
1. patterns: Identify at least 1 recurring pattern across files (e.g., "Undefined Variable Usage", "Missing Error Handling", "Hardcoded Secrets")
2. priorities: List each FOCUS diagnostic as a priority item with file, line, diagnostic code, priority level, and reason
3. quickWins: For each FOCUS diagnostic, provide a QUICK FIX with corrected code snippet and line number (effort: "low")
4. normalFixes: For each FOCUS diagnostic, provide a DETAILED FIX with corrected code example and explanation (effort: "low|medium|high")

The FOCUS diagnostics are the ${focusDiagnostics.length} most severe issues listed above. Any remaining diagnostics must be mentioned in the summary text (count and type), but do NOT create array entries for them.

EXAMPLE for a Python NameError on line 1: print(hello + world)
- quickWins: {"file": "test.py", "line": 1, "fix": "Define variables before use: hello = 'Hello'; world = 'World'; print(hello + world)", "effort": "low"}
- normalFixes: {"file": "test.py", "line": 1, "issue": "NameError", "fix": "hello = 'Hello'\\nworld = 'World'\\nprint(hello + world)", "effort": "low", "explanation": "Variables must be defined before use. This fixes the NameError by initializing both variables."}

Return COMPLETE valid JSON. Do NOT leave any array empty. Every FOCUS diagnostic MUST have corresponding entries in priorities, quickWins and normalFixes. Do NOT add entries for diagnostics that are not in the FOCUS list.`;

  try {
    // Token budget for this call. It never exceeds the mode's configured
    // budget (a model may reject a larger request), and scales down from
    // there when the focus set is small.
    const maxTokens = generalAnalysisMaxTokens(mode.maxTokens, focusDiagnostics.length);

    const { completion, modelUsed } = await createCompletion(
      modeId,
      {
        messages: [
          { role: 'system', content: 'You are FixMate AI, providing comprehensive code health analysis. Return ONLY complete valid JSON with all required fields. Do not truncate.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      },
      (c) => {
        if (!c?.choices?.[0]?.message?.content) {
          throw new Error('Empty response from AI model');
        }
      }
    );

    console.log(`[AI Analyzer] General analysis from model: ${modelUsed}`);

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }

    // Check for truncated response (common issue with token limits)
    const trimmed = responseContent.trim();
    if (!trimmed.endsWith('}') || trimmed.split('{').length !== trimmed.split('}').length) {
      console.warn('[AI Analyzer] Response appears truncated, attempting to recover...');
    }

    // Try to parse with multiple recovery strategies
    let parsed;
    try {
      parsed = JSON.parse(responseContent);
    } catch (e) {
      console.warn('[AI Analyzer] Initial JSON parse failed, trying recovery:', e.message);
      
      // Strategy 1: Find the largest valid JSON object
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Strategy 2: Fix truncated string values by finding the last complete key-value pair
        // If the string ends mid-value, truncate to the last complete entry
        const lastBrace = jsonStr.lastIndexOf('}');
        const lastBracket = jsonStr.lastIndexOf(']');
        const lastComplete = Math.max(lastBrace, lastBracket);
        
        if (lastComplete > 0 && lastComplete < jsonStr.length - 1) {
          jsonStr = jsonStr.slice(0, lastComplete + 1);
        }
        
        // Strategy 3: Fix unclosed strings
        const openQuotes = (jsonStr.match(/"/g) || []).length;
        if (openQuotes % 2 !== 0) {
          // Find the last complete key-value pair and truncate there
          const lastCompletePair = jsonStr.lastIndexOf('",');
          if (lastCompletePair > 0) {
            jsonStr = jsonStr.slice(0, lastCompletePair + 1) + '}';
          }
        }
        
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e2) {
          console.warn('[AI Analyzer] Recovery strategy failed:', e2.message);
          
          // Strategy 4: Build minimal valid response from what we have
          parsed = {
            summary: 'Analysis completed but response was truncated.',
            patterns: [],
            priorities: [],
            quickWins: [],
            normalFixes: []
          };
          
          // Try to extract summary if present
          const summaryMatch = responseContent.match(/"summary"\s*:\s*"([^"]*)/);
          if (summaryMatch) {
            parsed.summary = summaryMatch[1];
          }
          
          // Try to extract quickWins if present
          const quickWinsMatch = responseContent.match(/"quickWins"\s*:\s*(\[[^\]]*\])/);
          if (quickWinsMatch) {
            try {
              parsed.quickWins = JSON.parse(quickWinsMatch[1]);
            } catch {}
          }
          
          // Try to extract normalFixes if present
          const normalFixesMatch = responseContent.match(/"normalFixes"\s*:\s*(\[[^\]]*\])/);
          if (normalFixesMatch) {
            try {
              parsed.normalFixes = JSON.parse(normalFixesMatch[1]);
            } catch {}
          }
          
          // Try to extract patterns if present
          const patternsMatch = responseContent.match(/"patterns"\s*:\s*(\[[^\]]*\])/);
          if (patternsMatch) {
            try {
              parsed.patterns = JSON.parse(patternsMatch[1]);
            } catch {}
          }
          
          // Try to extract priorities if present
          const prioritiesMatch = responseContent.match(/"priorities"\s*:\s*(\[[^\]]*\])/);
          if (prioritiesMatch) {
            try {
              parsed.priorities = JSON.parse(prioritiesMatch[1]);
            } catch {}
          }
        }
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    // Validate required fields exist.
    // The arrays are clamped server-side as well: the cap has to hold for
    // what the model actually returns, not just for what was sent to it,
    // otherwise one long response can blow up the payload.
    if (!parsed.summary || typeof parsed.summary !== 'string') {
      parsed.summary = 'Analysis completed with issues found.';
    }
    parsed.patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    parsed.priorities = Array.isArray(parsed.priorities) ? parsed.priorities : [];
    parsed.quickWins = Array.isArray(parsed.quickWins) ? parsed.quickWins : [];
    parsed.normalFixes = Array.isArray(parsed.normalFixes) ? parsed.normalFixes : [];

    // Drop non-object entries - the frontend reads properties off them.
    const onlyObjects = (arr) => arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    parsed.patterns = onlyObjects(parsed.patterns).slice(0, MAX_PATTERNS);
    parsed.priorities = onlyObjects(parsed.priorities).slice(0, MAX_FOCUS_DIAGNOSTICS);
    parsed.quickWins = onlyObjects(parsed.quickWins).slice(0, MAX_FOCUS_DIAGNOSTICS);
    parsed.normalFixes = onlyObjects(parsed.normalFixes).slice(0, MAX_FOCUS_DIAGNOSTICS);

    // Clean up summary if it appears truncated
    if (parsed.summary.endsWith('{') || parsed.summary.endsWith('[')) {
      parsed.summary = parsed.summary.slice(0, -1).trim() + '.';
    }

    // FALLBACK: If AI didn't provide quickWins/normalFixes, generate from the
    // focus diagnostics (not every diagnostic - the cap exists to keep the
    // payload bounded).
    if (parsed.quickWins.length === 0 && focusDiagnostics.length > 0) {
      parsed.quickWins = focusDiagnostics.map(d => ({
        file: d.file,
        line: d.line,
        fix: `Fix ${d.code}: ${d.message}`,
        effort: 'low'
      }));
    }
    if (parsed.normalFixes.length === 0 && focusDiagnostics.length > 0) {
      parsed.normalFixes = focusDiagnostics.map(d => ({
        file: d.file,
        line: d.line,
        issue: d.code,
        fix: `Resolve ${d.code} at line ${d.line}: ${d.message}`,
        effort: 'low',
        explanation: `This fixes the ${normalizeDiagnosticType(d.type)}: ${d.message} by addressing the root cause at line ${d.line}.`
      }));
    }
    if (parsed.patterns.length === 0 && diagnostics.length > 0) {
      // Group diagnostics by code to find patterns.
      // A Map is used because the code is model-controlled: a code of
      // "__proto__" would otherwise hit Object.prototype and throw.
      const codeGroups = new Map();
      for (const d of diagnostics) {
        const code = String(d.code || 'Unknown');
        if (!codeGroups.has(code)) codeGroups.set(code, []);
        codeGroups.get(code).push(d.file);
      }
      parsed.patterns = [...codeGroups.entries()]
        .slice(0, MAX_PATTERNS)
        .map(([code, files]) => ({
          pattern: code,
          description: `Multiple occurrences of ${code} across files`,
          affectedFiles: [...new Set(files)],
          severity: 'medium'
        }));
    }
    if (parsed.priorities.length === 0 && focusDiagnostics.length > 0) {
      parsed.priorities = focusDiagnostics.map(d => {
        const type = normalizeDiagnosticType(d.type);
        return {
          file: d.file,
          line: d.line,
          diagnostic: d.code,
          priority: type === 'error' ? 'critical' : type === 'warning' ? 'high' : 'medium',
          reason: `${type.toUpperCase()}: ${d.message} at line ${d.line}`
        };
      });
    }

    console.log('[AI Analyzer] General analysis generated successfully');
    return {
      summary: parsed.summary || 'Analysis completed.',
      patterns: parsed.patterns || [],
      priorities: parsed.priorities || [],
      quickWins: parsed.quickWins || [],
      normalFixes: parsed.normalFixes || [],
      modelUsed,
    };
  } catch (err) {
    // The raw error can embed the base URL, the model name and provider
    // request ids, so it is logged but never returned to the browser.
    const safeMessage = sanitizeAiError(err, 'General analysis unavailable.');
    return {
      summary: 'General analysis could not be generated.',
      patterns: [],
      priorities: [],
      quickWins: [],
      normalFixes: [],
      error: safeMessage,
    };
  }
}

module.exports = {
  analyzeFileWithAI,
  analyzeFilesWithAI,
  generateGeneralAnalysis,
  // Exported so the regression tests exercise the production code rather
  // than a copy of it.
  normalizeDiagnosticType,
  normalizeSeverity,
  generalAnalysisMaxTokens,
  focusDiagnosticLimit,
  MAX_FOCUS_DIAGNOSTICS,
  MAX_PATTERNS,
};