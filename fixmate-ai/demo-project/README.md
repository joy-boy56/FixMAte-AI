# Demo Project for FixMate AI

This is a demo project with intentional syntax errors across multiple languages to test the FixMate AI project scanner.

## Structure

```
demo-project/
├── src/
│   ├── app.js          # JavaScript syntax errors
│   ├── utils.py        # Python syntax errors
│   └── components.ts   # TypeScript errors
├── tests/
│   └── test-errors.js  # JavaScript syntax error
├── docs/
└── package.json        # JSON syntax errors
```

## How to Test

1. Open http://localhost:3000
2. Click "Upload Folder" 
3. Select the `demo-project` folder
4. Click "Scan Project"
5. Review the diagnostics in the center panel
6. Click on any diagnostic to see AI-powered explanation in the right panel

## Expected Errors

- **JavaScript**: Missing parentheses, braces, unexpected tokens, unterminated strings
- **Python**: Missing colons, indentation errors, unmatched parentheses
- **TypeScript**: Type mismatches, missing properties, invalid generics
- **JSON**: Trailing commas, unterminated strings, invalid values