/**
 * Scan Project Orchestrator
 * Coordinates the complete project scanning pipeline
 */

const { processFiles, processFolderFiles } = require('../upload/fileHandler');
const { analyzePythonFiles } = require('./pythonAnalyzer');
const { analyzeJavaScriptFiles } = require('./javascriptAnalyzer');
const { analyzeTypeScriptFiles } = require('./typescriptAnalyzer');
const { analyzeJsonFiles } = require('./jsonAnalyzer');
const { normalizeDiagnostics, getDiagnosticSummary, sortDiagnostics } = require('./diagnosticNormalizer');

/**
 * Main scan function for uploaded files
 */
async function scanProject(files, options = {}) {
  const startTime = Date.now();
  
  try {
    // Step 1: Process uploaded files (handle ZIP, folders, etc.)
    const processed = await processFiles(files);
    
    // Step 2: Filter to supported files
    const supportedFiles = processed.files.filter(f => f.status === 'supported' && f.content);
    
    // Step 3: Run analyzers in parallel for each language
    const [pythonResults, jsResults, tsResults, jsonResults] = await Promise.all([
      analyzePythonFiles(supportedFiles),
      analyzeJavaScriptFiles(supportedFiles),
      analyzeTypeScriptFiles(supportedFiles),
      analyzeJsonFiles(supportedFiles),
    ]);
    
    // Step 4: Collect all diagnostics
    const allDiagnostics = [];
    
    for (const result of [...pythonResults, ...jsResults, ...tsResults, ...jsonResults]) {
      if (result.diagnostics && result.diagnostics.length > 0) {
        allDiagnostics.push(...result.diagnostics);
      }
    }
    
    // Step 5: Normalize and sort diagnostics
    const normalized = sortDiagnostics(allDiagnostics);
    
    // Step 6: Generate summary
    const summary = getDiagnosticSummary(normalized);
    
    // Step 7: Prepare response
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
 * Scan project from folder upload (uses webkitRelativePath)
 */
async function scanProjectFolder(files, options = {}) {
  const startTime = Date.now();
  
  try {
    // Process folder files
    const processed = await processFolderFiles(files);
    
    // Filter to supported files
    const supportedFiles = processed.files.filter(f => f.status === 'supported' && f.content);
    
    // Run analyzers
    const [pythonResults, jsResults, tsResults, jsonResults] = await Promise.all([
      analyzePythonFiles(supportedFiles),
      analyzeJavaScriptFiles(supportedFiles),
      analyzeTypeScriptFiles(supportedFiles),
      analyzeJsonFiles(supportedFiles),
    ]);
    
    // Collect all diagnostics
    const allDiagnostics = [];
    
    for (const result of [...pythonResults, ...jsResults, ...tsResults, ...jsonResults]) {
      if (result.diagnostics && result.diagnostics.length > 0) {
        allDiagnostics.push(...result.diagnostics);
      }
    }
    
    // Normalize and sort
    const normalized = sortDiagnostics(allDiagnostics);
    
    // Generate summary
    const summary = getDiagnosticSummary(normalized);
    
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