/**
 * TypeScript Analyzer Module
 * Uses TypeScript compiler API (tsc --noEmit) for diagnostics
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Check if TypeScript compiler is available
 */
async function checkTscAvailable() {
  return new Promise((resolve) => {
    const tsc = spawn('npx', ['tsc', '--version'], { shell: false });
    tsc.on('error', () => resolve(false));
    tsc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Check if TypeScript is available globally
 */
async function checkTscGlobal() {
  return new Promise((resolve) => {
    const tsc = spawn('tsc', ['--version'], { shell: false });
    tsc.on('error', () => resolve(false));
    tsc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Analyze TypeScript file using tsc --noEmit
 */
async function analyzeTypeScriptFile(filePath, content, projectFiles = []) {
  const useNpx = await checkTscAvailable();
  const useGlobal = !useNpx && await checkTscGlobal();
  const available = useNpx || useGlobal;
  
  if (!available) {
    return {
      success: false,
      diagnostics: [],
      error: 'TypeScript compiler (tsc) not found. Install TypeScript to enable TypeScript analysis.',
      skipped: true,
    };
  }
  
  // Create a temporary directory for analysis
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fixmate-ts-'));
  const tempFile = path.join(tempDir, path.basename(filePath) || 'analyze.ts');
  const tsConfigPath = path.join(tempDir, 'tsconfig.json');
  
  try {
    await fs.writeFile(tempFile, content, 'utf-8');
    
    // Create minimal tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowJs: true,
        checkJs: false,
      },
      include: [path.basename(tempFile)],
    };
    
    await fs.writeFile(tsConfigPath, JSON.stringify(tsConfig, null, 2), 'utf-8');
    
    // Run tsc --noEmit
    const cmd = useNpx ? 'npx' : 'tsc';
    const args = useNpx ? ['tsc', '--noEmit', '-p', tempDir] : ['--noEmit', '-p', tempDir];
    
    const result = await runTsc(cmd, args, tempDir);
    
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
    
    // Parse TypeScript diagnostics
    const diagnostics = parseTscOutput(result.error, filePath, content);
    
    return {
      success: false,
      diagnostics: diagnostics.map(d => ({
        ...d,
        file: filePath,
        language: 'TypeScript',
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
 * Run tsc --noEmit
 */
function runTsc(cmd, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      shell: false,
      cwd,
      timeout: 30000,
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
      const output = stdout || stderr;
      if (code === 0) {
        resolve({ success: true, error: '' });
      } else {
        resolve({ success: false, error: output });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    proc.on('timeout', () => {
      proc.kill();
      resolve({ success: false, error: 'TypeScript analysis timeout' });
    });
  });
}

/**
 * Parse TypeScript compiler output into structured diagnostics
 */
function parseTscOutput(output, filePath, content) {
  const diagnostics = [];
  const lines = output.split('\n');
  
  // TypeScript output format:
  // file.ts(10,5): error TS1005: ';' expected.
  // file.ts(10,5): warning TS1234: Something deprecated.
  
  const diagnosticRegex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s*(.+)$/;
  
  for (const line of lines) {
    const match = line.match(diagnosticRegex);
    if (match) {
      const [, file, lineStr, colStr, severity, code, message] = match;
      const lineNum = parseInt(lineStr, 10);
      const column = parseInt(colStr, 10);
      
      // Get source line from content
      const contentLines = content.split('\n');
      const sourceLine = contentLines[lineNum - 1] || '';
      
      diagnostics.push({
        type: severity === 'error' ? 'error' : 'warning',
        code: `TS${code}`,
        message: message.trim(),
        line: lineNum,
        column: column,
        source_line: sourceLine.trim(),
      });
    }
  }
  
  return diagnostics;
}

/**
 * Analyze multiple TypeScript files
 */
async function analyzeTypeScriptFiles(files) {
  const results = [];
  
  for (const file of files) {
    if (file.language === 'TypeScript' && file.content) {
      const result = await analyzeTypeScriptFile(file.path, file.content, files);
      results.push(result);
    }
  }
  
  return results;
}

module.exports = {
  analyzeTypeScriptFile,
  analyzeTypeScriptFiles,
  checkTscAvailable,
};