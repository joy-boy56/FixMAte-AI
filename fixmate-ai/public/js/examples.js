// FixMate AI - Predefined Examples

const EXAMPLES = [
  {
    id: 'python-nameerror',
    title: 'Python NameError',
    language: 'Python',
    runtime: 'Python 3.12',
    description: 'Undefined variable name typo in sum() call',
    code: `student_marks = [80, 90, 75]
total = sum(student_mark)
print(total)`,
    error: `NameError: name 'student_mark' is not defined`,
    expected: 'The sum should be 245.',
    actual: 'Program crashes with NameError',
    mode: 'beginner'
  },
  {
    id: 'javascript-typeerror',
    title: 'JavaScript TypeError',
    language: 'JavaScript',
    runtime: 'Node.js',
    description: 'Cannot read properties of null',
    code: `const user = null;
console.log(user.name);`,
    error: `TypeError: Cannot read properties of null (reading 'name')`,
    expected: 'Safely access the user\'s name.',
    actual: 'Program crashes with TypeError',
    mode: 'beginner'
  },
  {
    id: 'python-indexerror',
    title: 'Python IndexError',
    language: 'Python',
    runtime: 'Python 3.12',
    description: 'List index out of range',
    code: `numbers = [10, 20, 30]
print(numbers[3])`,
    error: `IndexError: list index out of range`,
    expected: 'Access a valid list element.',
    actual: 'Program crashes with IndexError',
    mode: 'beginner'
  }
];

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXAMPLES };
}