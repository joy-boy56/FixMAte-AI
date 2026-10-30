/**
 * Language Detector Module
 * Automatic programming language detection based on file extension and content
 */

const path = require('path');

// Primary extension-to-language mapping
const EXTENSION_MAP = new Map([
  // Python
  ['.py', 'Python'],
  ['.pyw', 'Python'],
  // JavaScript
  ['.js', 'JavaScript'],
  ['.mjs', 'JavaScript'],
  ['.cjs', 'JavaScript'],
  // TypeScript
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  // Java
  ['.java', 'Java'],
  // C
  ['.c', 'C'],
  // C++
  ['.cpp', 'C++'],
  ['.cc', 'C++'],
  ['.cxx', 'C++'],
  ['.h', 'C++'],
  ['.hpp', 'C++'],
  // HTML
  ['.html', 'HTML'],
  ['.htm', 'HTML'],
  // CSS
  ['.css', 'CSS'],
  // JSON
  ['.json', 'JSON'],
]);

// Content-based detection patterns (fallback for extensionless files)
const CONTENT_PATTERNS = [
  // Python
  {
    language: 'Python',
    patterns: [
      /^#!.*python/i,
      /^(import|from)\s+\w+/m,
      /^def\s+\w+\s*\(/m,
      /^class\s+\w+/m,
      /^\s*if\s+__name__\s*==\s*["']__main__["']/m,
    ],
    weight: 10,
  },
  // JavaScript
  {
    language: 'JavaScript',
    patterns: [
      /^#!.*node/i,
      /^(const|let|var)\s+\w+\s*=/m,
      /^function\s+\w+\s*\(/m,
      /=>\s*\{/m,
      /console\.log/m,
      /module\.exports/m,
      /require\s*\(/m,
    ],
    weight: 8,
  },
  // TypeScript
  {
    language: 'TypeScript',
    patterns: [
      /:\s*(string|number|boolean|any|void|Promise<)/m,
      /interface\s+\w+\s*\{/m,
      /type\s+\w+\s*=/m,
      /<\w+>\s*\(/m,
    ],
    weight: 12,
  },
  // Java
  {
    language: 'Java',
    patterns: [
      /^package\s+[\w.]+;/m,
      /^public\s+class\s+\w+/m,
      /^private\s+\w+\s+\w+/m,
      /System\.out\.println/m,
      /import\s+java\./m,
    ],
    weight: 10,
  },
  // C/C++
  {
    language: 'C',
    patterns: [
      /^#include\s*[<"]/m,
      /^int\s+main\s*\(/m,
      /^void\s+\w+\s*\(/m,
      /printf\s*\(/m,
      /malloc\s*\(/m,
    ],
    weight: 8,
  },
  {
    language: 'C++',
    patterns: [
      /^#include\s*[<"]/m,
      /^using\s+namespace\s+std;/m,
      /^class\s+\w+/m,
      /std::/m,
      /cout\s*<</m,
      /template\s*</m,
    ],
    weight: 8,
  },
  // HTML
  {
    language: 'HTML',
    patterns: [
      /^<!DOCTYPE\s+html>/i,
      /<html/i,
      /<head>/i,
      /<body>/i,
      /<div\s+class=/i,
    ],
    weight: 10,
  },
  // CSS
  {
    language: 'CSS',
    patterns: [
      /^\s*[\w-]+\s*\{/m,
      /^\s*@media/m,
      /^\s*@import/m,
      /color\s*:/m,
      /margin\s*:/m,
      /padding\s*:/m,
    ],
    weight: 8,
  },
  // JSON
  {
    language: 'JSON',
    patterns: [
      /^\s*\{/m,
      /^\s*\[/m,
      /"[\w-]+"\s*:/m,
    ],
    weight: 15,
  },
];

/**
 * Detect language from file extension
 */
function detectFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP.get(ext) || null;
}

/**
 * Detect language from file content (heuristic)
 */
function detectFromContent(content) {
  if (!content || content.length < 10) return null;
  
  const scores = new Map();
  
  for (const { language, patterns, weight } of CONTENT_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        score += weight;
      }
    }
    if (score > 0) {
      scores.set(language, (scores.get(language) || 0) + score);
    }
  }
  
  if (scores.size === 0) return null;
  
  // Return language with highest score
  let bestLang = null;
  let bestScore = 0;
  for (const [lang, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }
  
  // Only return if confidence is sufficient
  return bestScore >= 10 ? bestLang : null;
}

/**
 * Main language detection function
 * @param {string} filePath - Relative file path
 * @param {Buffer|string} [content] - Optional file content for heuristic detection
 * @returns {string} Detected language or 'Unknown'
 */
function detectLanguage(filePath, content = '') {
  // First try extension-based detection
  const fromExt = detectFromExtension(filePath);
  if (fromExt) {
    return fromExt;
  }
  
  // Fallback to content-based detection
  const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
  const fromContent = detectFromContent(contentStr);
  if (fromContent) {
    return fromContent;
  }
  
  return 'Unknown';
}

/**
 * Get all supported languages
 */
function getSupportedLanguages() {
  const languages = new Set();
  for (const [, lang] of EXTENSION_MAP) {
    languages.add(lang);
  }
  return Array.from(languages).sort();
}

/**
 * Get extensions for a specific language
 */
function getExtensionsForLanguage(language) {
  const extensions = [];
  for (const [ext, lang] of EXTENSION_MAP) {
    if (lang === language) {
      extensions.push(ext);
    }
  }
  return extensions;
}

/**
 * Check if a language is supported
 */
function isLanguageSupported(language) {
  return getSupportedLanguages().includes(language);
}

module.exports = {
  detectLanguage,
  detectFromExtension,
  detectFromContent,
  getSupportedLanguages,
  getExtensionsForLanguage,
  isLanguageSupported,
  EXTENSION_MAP,
};