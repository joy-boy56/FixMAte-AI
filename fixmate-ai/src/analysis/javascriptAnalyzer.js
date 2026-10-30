/**
 * JavaScript Analyzer Module
 * Uses node --check for syntax validation
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Check if Node.js is available
 */
async function checkNodeAvailable() {
  return new Promise((resolve) => {
    const node = spawn('node', ['--version'], { shell: false });
    node.on('error', () => resolve(false));
    node.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Analyze JavaScript file using node --check
 */
async function analyzeJavaScriptFile(filePath, content) {
  const available = await checkNodeAvailable();
  
  if (!available) {
    return {
      success: false,
      diagnostics: [],
      error: 'Node.js not found. Install Node.js to enable JavaScript analysis.',
      skipped: true,
    };
  }
  
  // Create a temporary file for analysis
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fixmate-js-'));
  const tempFile = path.join(tempDir, 'analyze.js');
  
  try {
    await fs.writeFile(tempFile, content, 'utf-8');
    
    // Use node --check for syntax validation
    const result = await runNodeCheck(tempFile);
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    if (result.success) {
      return {
        success: true,
        diagnostics: [],
      };
    }
    
    // Parse Node.js error output
    const diagnostics = parseNodeError(result.error, filePath);
    
    return {
      success: false,
      diagnostics: diagnostics.map(d => ({
        ...d,
        file: filePath,
        language: 'JavaScript',
      })),
    };
  } catch (err) {
    // Clean up on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }
    
    return {
      success: false,
      diagnostics: [],
      error: err.message,
    };
  }
}

/**
 * Run node --check on a file
 */
function runNodeCheck(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('node', ['--check', filePath], {
      shell: false,
      timeout: 10000,
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, error: '' });
      } else {
        resolve({ success: false, error: stderr || stdout });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    proc.on('timeout', () => {
      proc.kill();
      resolve({ success: false, error: 'JavaScript analysis timeout' });
    });
  });
}

/**
 * Parse Node.js error output into structured diagnostics
 */
function parseNodeError(errorOutput, filePath) {
  const diagnostics = [];
  
  // Node.js error format examples:
  // /path/file.js:5
  // const x = ;
  // ^^^^^^
  // SyntaxError: Unexpected token ';'
  // 
  // Or:
  // SyntaxError: Unexpected token ';' at /path/file.js:5:10
  
  const lines = errorOutput.split('\n');
  
  // Try to find the error location and message
  let message = errorOutput.trim();
  let line = 1;
  let column = 0;
  let sourceLine = '';
  
  // Look for line:column pattern
  const locationMatch = errorOutput.match(/at\s+(.+?):(\d+):(\d+)/);
  if (locationMatch) {
    // File path, line, column
    line = parseInt(locationMatch[2], 10);
    column = parseInt(locationMatch[3], 10);
    
    // Extract message before "at"
    const beforeAt = errorOutput.substring(0, locationMatch.index).trim();
    const errorMatch = beforeAt.match(/(SyntaxError|ReferenceError|TypeError|Error):\s*(.+)$/);
    if (errorMatch) {
      message = errorMatch[0];
    }
  }
  
  // Look for file:line format
  const fileLineMatch = errorOutput.match(/(.+?):(\d+)\s*$/m);
  if (fileLineMatch && !locationMatch) {
    line = parseInt(fileLineMatch[2], 10);
    // Try to get the next line as source
    const lineIndex = lines.findIndex(l => l.includes(fileLineMatch[1]) && l.includes(fileLineMatch[2]));
    if (lineIndex >= 0 && lineIndex + 1 < lines.length) {
      sourceLine = lines[lineIndex + 1].trim();
    }
  }
  
  // Extract error type and message
  const errorTypeMatch = errorOutput.match(/(SyntaxError|ReferenceError|TypeError|RangeError|Error):\s*(.+)/);
  if (errorTypeMatch) {
    message = `${errorTypeMatch[1]}: ${errorTypeMatch[2]}`;
  }
  
  // Get source line from content if we have it
  if (column > 0) {
    // We'll need the original content to get the exact line
  }
  
  diagnostics.push({
    type: 'error',
    code: 'SyntaxError',
    message: message,
    line: line,
    column: column,
    source_line: sourceLine,
  });
  
  return diagnostics;
}

/**
 * Analyze multiple JavaScript files
 */
async function analyzeJavaScriptFiles(files) {
  const results = [];
  
  for (const file of files) {
    if ((file.language === 'JavaScript' || file.language === 'TypeScript') && file.content) {
      const result = await analyzeJavaScriptFile(file.path, file.content);
      results.push(result);
    }
  }
  
  return results;
}

module.exports = {
  analyzeJavaScriptFile,
  analyzeJavaScriptFiles,
  checkNodeAvailable,
};