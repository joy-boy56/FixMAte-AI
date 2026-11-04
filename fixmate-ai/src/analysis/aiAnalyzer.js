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

    // Try ultra model first, fall back to super model if it fails
    const models = [
      'nvidia/nemotron-3-ultra-550b-a55b',
      'nvidia/nemotron-3.5-super-vl-120b-a12b'
    ];
    
    let completion;
    let lastError;
    
    for (const model of models) {
      try {
        console.log(`[AI Analyzer] Trying model: ${model}`);
        completion = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: getAnalysisSystemPrompt() },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        });
        console.log(`[AI Analyzer] Success with model: ${model}`);
        break;
      } catch (modelErr) {
        console.warn(`[AI Analyzer] Model ${model} failed:`, modelErr.message);
        lastError = modelErr;
        continue;
      }
    }
    
    if (!completion) {
      throw lastError || new Error('All models failed');
    }

    console.log('[AI Analyzer] Received response from Nemotron');
    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('Empty response from AI model');
    }

    console.log('[AI Analyzer] Response content length:', responseContent.length);
    console.log('[AI Analyzer] Response preview:', responseContent.slice(0, 500));

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
        console.error('[AI Analyzer] Raw response:', responseContent);
        throw new Error('Failed to parse AI response as JSON: ' + e.message);
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

/**
 * Generate a general/comprehensive analysis from all diagnostics
 */
async function generateGeneralAnalysis(diagnostics, files) {
  if (!diagnostics || diagnostics.length === 0) {
    return {
      summary: 'No issues found in the codebase.',
      patterns: [],
      priorities: [],
      quickWins: [],
    };
  }

  console.log('[AI Analyzer] Generating general analysis for', diagnostics.length, 'diagnostics');

  if (!process.env.NVIDIA_API_KEY) {
    return {
      summary: 'AI service not configured. Set NVIDIA_API_KEY environment variable.',
      patterns: [],
      priorities: [],
      quickWins: [],
    };
  }

  // Group diagnostics by file and type
  const byFile = {};
  const byType = { error: [], warning: [], info: [] };
  
  for (const diag of diagnostics) {
    if (!byFile[diag.file]) byFile[diag.file] = [];
    byFile[diag.file].push(diag);
    byType[diag.type].push(diag);
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
${fc.diagnostics.map(d => `  Line ${d.line}: [${d.type.toUpperCase()}] ${d.code} - ${d.message}`).join('\n')}
Content preview:
\`\`\`${fc.language.toLowerCase()}
${fc.contentPreview}
\`\`\`
`).join('\n')}

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
2. priorities: List EACH diagnostic as a priority item with file, line, diagnostic code, priority level, and reason
3. quickWins: For EACH diagnostic, provide a QUICK FIX with corrected code snippet and line number (effort: "low")
4. normalFixes: For EACH diagnostic, provide a DETAILED FIX with corrected code example and explanation (effort: "low|medium|high")

EXAMPLE for a Python NameError on line 1: print(hello + world)
- quickWins: {"file": "test.py", "line": 1, "fix": "Define variables before use: hello = 'Hello'; world = 'World'; print(hello + world)", "effort": "low"}
- normalFixes: {"file": "test.py", "line": 1, "issue": "NameError", "fix": "hello = 'Hello'\\nworld = 'World'\\nprint(hello + world)", "effort": "low", "explanation": "Variables must be defined before use. This fixes the NameError by initializing both variables."}

Return COMPLETE valid JSON. Do NOT leave any array empty. Every diagnostic MUST have corresponding entries in quickWins and normalFixes.`;

  try {
    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [
        { role: 'system', content: 'You are FixMate AI, providing comprehensive code health analysis. Return ONLY complete valid JSON with all required fields. Do not truncate.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

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

    // Validate required fields exist
    if (!parsed.summary || typeof parsed.summary !== 'string') {
      parsed.summary = 'Analysis completed with issues found.';
    }
    if (!Array.isArray(parsed.patterns)) parsed.patterns = [];
    if (!Array.isArray(parsed.priorities)) parsed.priorities = [];
    if (!Array.isArray(parsed.quickWins)) parsed.quickWins = [];
    if (!Array.isArray(parsed.normalFixes)) parsed.normalFixes = [];

    // Clean up summary if it appears truncated
    if (parsed.summary.endsWith('{') || parsed.summary.endsWith('[')) {
      parsed.summary = parsed.summary.slice(0, -1).trim() + '.';
    }

    // FALLBACK: If AI didn't provide quickWins/normalFixes, generate from diagnostics
    if (parsed.quickWins.length === 0 && diagnostics.length > 0) {
      parsed.quickWins = diagnostics.map(d => ({
        file: d.file,
        line: d.line,
        fix: `Fix ${d.code}: ${d.message}`,
        effort: 'low'
      }));
    }
    if (parsed.normalFixes.length === 0 && diagnostics.length > 0) {
      parsed.normalFixes = diagnostics.map(d => ({
        file: d.file,
        line: d.line,
        issue: d.code,
        fix: `Resolve ${d.code} at line ${d.line}: ${d.message}`,
        effort: 'low',
        explanation: `This fixes the ${d.type}: ${d.message} by addressing the root cause at line ${d.line}.`
      }));
    }
    if (parsed.patterns.length === 0 && diagnostics.length > 0) {
      // Group diagnostics by code to find patterns
      const codeGroups = {};
      diagnostics.forEach(d => {
        if (!codeGroups[d.code]) codeGroups[d.code] = [];
        codeGroups[d.code].push(d.file);
      });
      parsed.patterns = Object.entries(codeGroups).map(([code, files]) => ({
        pattern: code,
        description: `Multiple occurrences of ${code} across files`,
        affectedFiles: [...new Set(files)],
        severity: 'medium'
      }));
    }
    if (parsed.priorities.length === 0 && diagnostics.length > 0) {
      parsed.priorities = diagnostics.map(d => ({
        file: d.file,
        line: d.line,
        diagnostic: d.code,
        priority: d.type === 'error' ? 'critical' : d.type === 'warning' ? 'high' : 'medium',
        reason: `${d.type.toUpperCase()}: ${d.message} at line ${d.line}`
      }));
    }

    console.log('[AI Analyzer] General analysis generated successfully');
    return {
      summary: parsed.summary || 'Analysis completed.',
      patterns: parsed.patterns || [],
      priorities: parsed.priorities || [],
      quickWins: parsed.quickWins || [],
      normalFixes: parsed.normalFixes || [],
    };
  } catch (err) {
    console.error('[AI Analyzer] General analysis failed:', err);
    return {
      summary: 'General analysis could not be generated: ' + err.message,
      patterns: [],
      priorities: [],
      quickWins: [],
      normalFixes: [],
    };
  }
}

module.exports = {
  analyzeFileWithAI,
  analyzeFilesWithAI,
  generateGeneralAnalysis,
};