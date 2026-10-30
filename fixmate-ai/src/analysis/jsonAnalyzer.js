/**
 * JSON Analyzer Module
 * Uses safe JSON parsing for validation
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Analyze JSON file
 */
async function analyzeJsonFile(filePath, content) {
  try {
    // Try to parse JSON
    const parsed = JSON.parse(content);
    
    // Valid JSON
    return {
      success: true,
      diagnostics: [],
    };
  } catch (err) {
    // Parse error - extract location info
    const diagnostics = parseJsonError(err, content, filePath);
    
    return {
      success: false,
      diagnostics: diagnostics.map(d => ({
        ...d,
        file: filePath,
        language: 'JSON',
      })),
    };
  }
}

/**
 * Parse JSON error into structured diagnostic
 */
function parseJsonError(error, content, filePath) {
  const diagnostics = [];
  
  // JSON.parse error messages typically include position
  // Example: "Unexpected token } in JSON at position 42"
  const message = error.message || 'JSON parse error';
  
  let line = 1;
  let column = 0;
  let sourceLine = '';
  
  // Try to extract position from error message
  const positionMatch = message.match(/at position (\d+)/i);
  if (positionMatch) {
    const position = parseInt(positionMatch[1], 10);
    const posInfo = getLineColumnFromPosition(content, position);
    line = posInfo.line;
    column = posInfo.column;
    sourceLine = posInfo.sourceLine;
  }
  
  // Try to get line/column from V8 error format
  // "Unexpected token } in JSON at line 5 column 10"
  const lineColMatch = message.match(/at line (\d+) column (\d+)/i);
  if (lineColMatch) {
    line = parseInt(lineColMatch[1], 10);
    column = parseInt(lineColMatch[2], 10);
    const contentLines = content.split('\n');
    sourceLine = contentLines[line - 1] || '';
  }
  
  diagnostics.push({
    type: 'error',
    code: 'JSONParseError',
    message: message,
    line: line,
    column: column,
    source_line: sourceLine.trim(),
  });
  
  return diagnostics;
}

/**
 * Get line and column from character position
 */
function getLineColumnFromPosition(content, position) {
  let line = 1;
  let column = 1;
  let sourceLine = '';
  
  for (let i = 0; i < content.length && i < position; i++) {
    if (content[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  
  // Get the source line
  const lines = content.split('\n');
  sourceLine = lines[line - 1] || '';
  
  return { line, column, sourceLine };
}

/**
 * Analyze multiple JSON files
 */
async function analyzeJsonFiles(files) {
  const results = [];
  
  for (const file of files) {
    if (file.language === 'JSON' && file.content) {
      const result = await analyzeJsonFile(file.path, file.content);
      results.push(result);
    }
  }
  
  return results;
}

module.exports = {
  analyzeJsonFile,
  analyzeJsonFiles,
};