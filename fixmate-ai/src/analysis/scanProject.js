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
    const aiResults = await analyzeFilesWithAI(supportedFiles, { concurrency: 3 });
    
    // Step 4: Collect all diagnostics from AI results
    const allDiagnostics = [];
    
    for (const result of aiResults) {
      if (result.success && result.issues && result.issues.length > 0) {
        allDiagnostics.push(...result.issues);
      } else if (!result.success) {
        console.warn(`AI analysis failed for file: ${result.error}`);
      }
    }
    
    // Step 5: Sort diagnostics
    const sorted = sortDiagnostics(allDiagnostics);
    
    // Step 6: Generate summary
    const summary = {
      total: sorted.length,
      errors: sorted.filter(d => d.type === 'error').length,
      warnings: sorted.filter(d => d.type === 'warning').length,
      info: sorted.filter(d => d.type === 'info').length,
      byFile: {},
      byLanguage: {},
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
    const generalAnalysis = await generateGeneralAnalysis(sorted, processed.files);
    
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
    const aiResults = await analyzeFilesWithAI(supportedFiles, { concurrency: 3 });
    
    // Collect all diagnostics
    const allDiagnostics = [];
    
    for (const result of aiResults) {
      if (result.success && result.issues && result.issues.length > 0) {
        allDiagnostics.push(...result.issues);
      } else if (!result.success) {
        console.warn(`AI analysis failed for file: ${result.error}`);
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