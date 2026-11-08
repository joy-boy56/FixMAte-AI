/**
 * Scan Project Orchestrator
 * Coordinates the complete project scanning pipeline
 */

const { processFiles, processFolderFiles } = require('../upload/fileHandler');
const { analyzeFilesWithAI, generateGeneralAnalysis } = require('./aiAnalyzer');
const { sortDiagnostics } = require('./diagnosticNormalizer');
const crypto = require('crypto');

/**
 * Main scan function for uploaded files
 */
async function scanProject(files, options = {}) {
  const startTime = Date.now();
  
  try {
    // Step 1: Process uploaded files (handle ZIP, folders, etc.)
    const processed = await processFiles(files);
    
    // Step 2: Filter to supported files with content
    const supportedFiles = processed.files.filter(f => f.status === 'supported' && f.content);
    
    // Step 3: Run AI analyzer on all supported files
    const aiResults = await analyzeFilesWithAI(supportedFiles, { concurrency: 3, mode: options.mode });
    
    // Step 4: Collect all diagnostics from AI results
    const allDiagnostics = [];
    const aiFailures = [];
    const modelsUsed = new Set();
    
    for (const result of aiResults) {
      if (result.success && result.issues && result.issues.length > 0) {
        allDiagnostics.push(...result.issues);
      } else if (!result.success) {
        console.warn(`AI analysis failed for file: ${result.error}`);
        // Sanitized: the raw upstream error can contain the base URL, model
        // name and request IDs, so it is logged but not returned.
        aiFailures.push('AI analysis failed for one or more files.');
      }
      if (result.modelUsed) {
        modelsUsed.add(result.modelUsed);
      }
    }
    
    // Step 5: Sort diagnostics
    const sorted = sortDiagnostics(allDiagnostics);
    
    // Step 6: Generate summary.
    // The grouping maps use null prototypes: the keys come from file names
    // and language tags, and a key of "__proto__" would otherwise hit
    // Object.prototype.
    const summary = {
      total: sorted.length,
      errors: sorted.filter(d => d.type === 'error').length,
      warnings: sorted.filter(d => d.type === 'warning').length,
      info: sorted.filter(d => d.type === 'info').length,
      byFile: Object.create(null),
      byLanguage: Object.create(null),
      bySeverity: {
        high: sorted.filter(d => d.severity === 'high').length,
        medium: sorted.filter(d => d.severity === 'medium').length,
        low: sorted.filter(d => d.severity === 'low').length,
      },
      scanTimeMs: Date.now() - startTime,
    };
    
    // Group by file and language
    for (const diag of sorted) {
      summary.byFile[diag.file] = (summary.byFile[diag.file] || 0) + 1;
      summary.byLanguage[diag.language] = (summary.byLanguage[diag.language] || 0) + 1;
    }
    
    // Step 7: Generate general analysis
    const generalAnalysis = await generateGeneralAnalysis(sorted, processed.files, options.mode);
    
    // Step 8: Prepare response
    const scanTime = Date.now() - startTime;
    
    return {
      success: true,
      project: {
        name: options.projectName || 'Untitled Project',
        files: processed.files,
        summary: {
          ...processed.summary,
          ...summary,
          scanTimeMs: scanTime,
        },
      },
      diagnostics: sorted,
      generalAnalysis,
      // Surfaced so the client can tell the difference between "no issues
      // found" and "the AI could not analyze these files".
      ai: {
        failedFiles: aiFailures.length,
        errors: aiFailures,
        modelsUsed: [...modelsUsed],
      },
      skipped: processed.files.filter(f => f.status === 'skipped'),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      project: null,
      diagnostics: [],
      skipped: [],
    };
  }
}

/**
 * Scan project from folder upload (uses webkitRelativePath)
 */
async function scanProjectFolder(files, options = {}) {
  const startTime = Date.now();
  
  try {
    // Process folder files
    const processed = await processFolderFiles(files);
    
    // Filter to supported files
    const supportedFiles = processed.files.filter(f => f.status === 'supported' && f.content);
    
    // Run AI analyzer
    const aiResults = await analyzeFilesWithAI(supportedFiles, { concurrency: 3, mode: options.mode });
    
    // Collect all diagnostics
    const allDiagnostics = [];
    const aiFailures = [];
    const modelsUsed = new Set();
    
    for (const result of aiResults) {
      if (result.success && result.issues && result.issues.length > 0) {
        allDiagnostics.push(...result.issues);
      } else if (!result.success) {
        console.warn(`AI analysis failed for file: ${result.error}`);
        // Sanitized: the raw upstream error can contain the base URL, model
        // name and request IDs, so it is logged but not returned.
        aiFailures.push('AI analysis failed for one or more files.');
      }
      if (result.modelUsed) {
        modelsUsed.add(result.modelUsed);
      }
    }
    
    // Normalize and sort
    const normalized = sortDiagnostics(allDiagnostics);
    
    // Generate summary
    const summary = {
      total: normalized.length,
      errors: normalized.filter(d => d.type === 'error').length,
      warnings: normalized.filter(d => d.type === 'warning').length,
      info: normalized.filter(d => d.type === 'info').length,
      byFile: {},
      byLanguage: {},
      bySeverity: {
        high: normalized.filter(d => d.severity === 'high').length,
        medium: normalized.filter(d => d.severity === 'medium').length,
        low: normalized.filter(d => d.severity === 'low').length,
      },
      scanTimeMs: Date.now() - startTime,
    };
    
    for (const diag of normalized) {
      summary.byFile[diag.file] = (summary.byFile[diag.file] || 0) + 1;
      summary.byLanguage[diag.language] = (summary.byLanguage[diag.language] || 0) + 1;
    }
    
    // Generate general analysis (same as regular scan)
    const generalAnalysis = await generateGeneralAnalysis(normalized, processed.files, options.mode);
    
    // Computed after the general analysis so both scan paths report the
    // same total duration.
    const scanTime = Date.now() - startTime;
    
    return {
      success: true,
      project: {
        name: options.projectName || 'Folder Upload',
        files: processed.files,
        summary: {
          ...processed.summary,
          ...summary,
          scanTimeMs: scanTime,
        },
      },
      diagnostics: normalized,
      generalAnalysis,
      ai: {
        failedFiles: aiFailures.length,
        errors: aiFailures,
        modelsUsed: [...modelsUsed],
      },
      skipped: processed.files.filter(f => f.status === 'skipped'),
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      project: null,
      diagnostics: [],
      skipped: [],
    };
  }
}

/**
 * Get file content for a specific diagnostic
 */
function getFileContext(files, filePath, line, contextLines = 3) {
  const file = files.find(f => f.path === filePath);
  if (!file || !file.content) return null;
  
  const lines = file.content.split('\n');
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  
  return {
    content: file.content,
    lines: lines.slice(start, end).map((text, i) => ({
      number: start + i + 1,
      text,
      isErrorLine: start + i + 1 === line,
    })),
    startLine: start + 1,
    endLine: end,
  };
}

/**
 * Get all unique files that have diagnostics
 */
function getFilesWithDiagnostics(diagnostics) {
  const filePaths = [...new Set(diagnostics.map(d => d.file))];
  return filePaths;
}

module.exports = {
  scanProject,
  scanProjectFolder,
  getFileContext,
  getFilesWithDiagnostics,
};