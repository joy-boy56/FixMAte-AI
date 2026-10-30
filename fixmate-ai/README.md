# FixMate AI

> **Find the bug. Understand the cause. Fix it faster.**

An AI-powered programming debugging assistant that helps developers identify, understand, and fix common programming errors using NVIDIA Nemotron 3 Ultra.

## Features

- **Multi-language Support**: Python, JavaScript, TypeScript, Java, C, C++, PHP, SQL, HTML/CSS, and more
- **Structured Diagnosis**: Error identification, root causes ranked by likelihood, evidence-based analysis
- **Corrected Code**: Ready-to-use fixed code with copy functionality
- **Code Comparison**: Side-by-side before/after view highlighting changes
- **Beginner & Expert Modes**: Adaptive explanations for different experience levels
- **Pre-filled Examples**: Quick-start with common error patterns
- **Verification Steps**: Test cases and commands to confirm the fix
- **Prevention Tips**: Best practices to avoid similar errors

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **AI**: NVIDIA Nemotron 3 Ultra (OpenAI-compatible API)

## Prerequisites

- Node.js 18+
- NVIDIA API key (get one at [integrate.api.nvidia.com](https://integrate.api.nvidia.com/))

## Quick Start

### 1. Clone and Install

```bash
cd fixmate-ai
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY
```

### 3. Start the Server

```bash
npm start
```

The application will be available at **http://localhost:3000**

## Project Structure

```
fixmate-ai/
├── public/
│   ├── index.html          # Main dashboard
│   ├── css/
│   │   └── styles.css      # All styles
│   └── js/
│       ├── app.js          # Main application logic
│       ├── renderer.js     # Results rendering
│       └── examples.js     # Pre-filled examples
├── services/
│   └── aiService.js        # NVIDIA AI integration
├── prompts/
│   └── debugPrompt.js      # AI prompt engineering
├── server.js               # Express server
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## API Endpoints

### GET `/api/health`
Health check endpoint - returns server and AI provider status.

### POST `/api/diagnose`
Analyze code and error message.

**Request Body:**
```json
{
  "language": "Python",
  "runtime": "Python 3.12",
  "code": "source code here",
  "error": "error message here",
  "expected": "expected behaviour (optional)",
  "actual": "actual behaviour (optional)",
  "mode": "beginner"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "error_name": "NameError",
    "error_category": "Runtime Error",
    "summary": "Variable name typo...",
    "severity": "High",
    "confidence": "High",
    "possible_causes": [...],
    "recommended_fix": {...},
    "code_changes": [...],
    "explanation": "...",
    "alternative_fixes": [...],
    "verification_steps": [...],
    "prevention_tips": [...],
    "missing_information": [...]
  }
}
```

## Usage

1. **Select Language**: Choose your programming language from the dropdown
2. **Add Runtime** (optional): Specify framework, version, or platform
3. **Paste Code**: Enter your source code in the code area
4. **Paste Error**: Enter the complete error message or stack trace
5. **Add Context** (optional): Describe expected vs actual behavior
6. **Choose Mode**: Beginner (detailed explanations) or Expert (concise technical)
7. **Click Diagnose**: Get structured analysis with fixes

## Examples Included

- **Python NameError**: Undefined variable typo
- **JavaScript TypeError**: Cannot read properties of null
- **Python IndexError**: List index out of range

Click "Try Example" to load any of these instantly.

## Keyboard Shortcuts

- `Ctrl/Cmd + Enter`: Submit diagnosis
- `Escape`: Close example modal

## Development

```bash
# Start with auto-reload (requires nodemon)
npm install -g nodemon
nodemon server.js
```

## Troubleshooting

**"Invalid NVIDIA API key"**: Ensure your `.env` file has a valid `NVIDIA_API_KEY` from https://integrate.api.nvidia.com/

**"Request timed out"**: The AI model may be busy. Try again or regenerate.

**Port 3000 in use**: Change `PORT` in `.env` to another port.

## License

MIT License - Built for TCS Hackathon