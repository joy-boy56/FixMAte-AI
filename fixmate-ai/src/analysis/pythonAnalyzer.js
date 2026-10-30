/**
 * Python Analyzer Module
 * Uses Python's AST parser for syntax checking
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Check if Python is available
 */
async function checkPythonAvailable() {
  return new Promise((resolve) => {
    const python = spawn('python3', ['--version'], { shell: false });
    python.on('error', () => resolve(false));
    python.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Check if Python 3 is available (fallback)
 */
async function checkPython3Available() {
  return new Promise((resolve) => {
    const python = spawn('python', ['--version'], { shell: false });
    python.on('error', () => resolve(false));
    python.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Analyze Python file using AST parser
 */
async function analyzePythonFile(filePath, content) {
  const pythonCmd = await checkPythonAvailable() ? 'python3' : 'python';
  const available = await checkPythonAvailable() || await checkPython3Available();
  
  if (!available) {
    return {
      success: false,
      diagnostics: [],
      error: 'Python interpreter not found. Install Python 3 to enable Python analysis.',
      skipped: true,
    };
  }
  
  // Create a temporary file for analysis
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fixmate-python-'));
  const tempFile = path.join(tempDir, 'analyze.py');
  
  try {
    await fs.writeFile(tempFile, content, 'utf-8');
    
    // Use Python's compile() to check syntax without executing
    const script = `
import ast
import sys
import json

try:
    with open('${tempFile.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
        source = f.read()
    
    # Parse and compile to check syntax
    tree = ast.parse(source, filename='${tempFile.replace(/\\/g, '\\\\')}')
    compile(source, '${tempFile.replace(/\\/g, '\\\\')}', 'exec')
    
    # If we get here, no syntax errors
    print(json.dumps({"success": True, "diagnostics": []}))
    
except SyntaxError as e:
    print(json.dumps({
        "success": False,
        "diagnostics": [{
            "type": "error",
            "code": "SyntaxError",
            "message": e.msg,
            "line": e.lineno,
            "column": e.offset,
            "source_line": e.text.rstrip() if e.text else ""
        }]
    }))
except IndentationError as e:
    print(json.dumps({
        "success": False,
        "diagnostics": [{
            "type": "error",
            "code": "IndentationError",
            "message": e.msg,
            "line": e.lineno,
            "column": e.offset,
            "source_line": e.text.rstrip() if e.text else ""
        }]
    }))
except Exception as e:
    print(json.dumps({
        "success": False,
        "diagnostics": [{
            "type": "error",
            "code": "AnalysisError",
            "message": str(e),
            "line": 1,
            "column": 0,
            "source_line": ""
        }]
    }))
`;
    
    const result = await runPythonScript(pythonCmd, script);
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    
    if (result.success && result.diagnostics) {
      return {
        success: true,
        diagnostics: result.diagnostics.map(d => ({
          ...d,
          file: filePath,
          language: 'Python',
        })),
      };
    }
    
    return {
      success: false,
      diagnostics: result.diagnostics || [],
      error: 'Python analysis failed',
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
 * Run Python script and capture output
 */
function runPythonScript(pythonCmd, script) {
  return new Promise((resolve) => {
    const proc = spawn(pythonCmd, ['-c', script], {
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
      try {
        // Find the JSON line in output
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.trim().startsWith('{'));
        if (jsonLine) {
          resolve(JSON.parse(jsonLine));
        } else {
          resolve({ success: false, diagnostics: [], error: stderr || 'No JSON output' });
        }
      } catch (e) {
        resolve({ success: false, diagnostics: [], error: `Parse error: ${e.message}` });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, diagnostics: [], error: err.message });
    });
    
    proc.on('timeout', () => {
      proc.kill();
      resolve({ success: false, diagnostics: [], error: 'Python analysis timeout' });
    });
  });
}

/**
 * Analyze multiple Python files
 */
async function analyzePythonFiles(files) {
  const results = [];
  
  for (const file of files) {
    if (file.language === 'Python' && file.content) {
      const result = await analyzePythonFile(file.path, file.content);
      results.push(result);
    }
  }
  
  return results;
}

module.exports = {
  analyzePythonFile,
  analyzePythonFiles,
  checkPythonAvailable,
};