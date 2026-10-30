/**
 * Diagnostic Normalizer Module
 * Normalizes diagnostics from different analyzers into a common format
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Normalize a diagnostic to common format
 */
function normalizeDiagnostic(diagnostic, filePath, language) {
  return {
    id: uuidv4(),
    file: diagnostic.file || filePath,
    language: diagnostic.language || language,
    type: diagnostic.type || 'error', // error, warning, info
    code: diagnostic.code || 'Unknown',
    message: diagnostic.message || 'Unknown error',
    line: diagnostic.line || 1,
    column: diagnostic.column || 0,
    sourceLine: diagnostic.source_line || diagnostic.sourceLine || '',
    severity: mapSeverity(diagnostic.type),
    source: 'parser', // parser, ai
    timestamp: new Date().toISOString(),
  };
}

/**
 * Map diagnostic type to severity
 */
function mapSeverity(type) {
  switch (type) {
    case 'error': return 'high';
    case 'warning': return 'medium';
    case 'info': return 'low';
    default: return 'medium';
  }
}

/**
 * Normalize array of diagnostics
 */
function normalizeDiagnostics(diagnostics, filePath, language) {
  return diagnostics.map(d => normalizeDiagnostic(d, filePath, language));
}

/**
 * Group diagnostics by file
 */
function groupByFile(diagnostics) {
  const groups = new Map();
  
  for (const diag of diagnostics) {
    const key = diag.file;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(diag);
  }
  
  return groups;
}

/**
 * Group diagnostics by language
 */
function groupByLanguage(diagnostics) {
  const groups = new Map();
  
  for (const diag of diagnostics) {
    const key = diag.language;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(diag);
  }
  
  return groups;
}

/**
 * Get diagnostic summary statistics
 */
function getDiagnosticSummary(diagnostics) {
  const summary = {
    total: diagnostics.length,
    errors: 0,
    warnings: 0,
    info: 0,
    byFile: {},
    byLanguage: {},
    bySeverity: {
      high: 0,
      medium: 0,
      low: 0,
    },
  };
  
  for (const diag of diagnostics) {
    // Count by type
    if (diag.type === 'error') summary.errors++;
    else if (diag.type === 'warning') summary.warnings++;
    else summary.info++;
    
    // Count by severity
    summary.bySeverity[diag.severity] = (summary.bySeverity[diag.severity] || 0) + 1;
    
    // Count by file
    summary.byFile[diag.file] = (summary.byFile[diag.file] || 0) + 1;
    
    // Count by language
    summary.byLanguage[diag.language] = (summary.byLanguage[diag.language] || 0) + 1;
  }
  
  return summary;
}

/**
 * Sort diagnostics by file, then line, then column
 */
function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((a, b) => {
    // First by file path
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    // Then by line
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    // Then by column
    return a.column - b.column;
  });
}

/**
 * Filter diagnostics by type
 */
function filterDiagnostics(diagnostics, { types, languages, files, minSeverity } = {}) {
  return diagnostics.filter(d => {
    if (types && types.length > 0 && !types.includes(d.type)) return false;
    if (languages && languages.length > 0 && !languages.includes(d.language)) return false;
    if (files && files.length > 0 && !files.includes(d.file)) return false;
    if (minSeverity) {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      if (severityOrder[d.severity] < severityOrder[minSeverity]) return false;
    }
    return true;
  });
}

module.exports = {
  normalizeDiagnostic,
  normalizeDiagnostics,
  groupByFile,
  groupByLanguage,
  getDiagnosticSummary,
  sortDiagnostics,
  filterDiagnostics,
  mapSeverity,
};