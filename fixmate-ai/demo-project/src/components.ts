// TypeScript Errors Demo
// Upload this file to test the scanner

// 1. Type mismatch
const name: string = 42;

// 2. Missing type annotation (with noImplicitAny)
function greet(name) {
    return "Hello " + name;
}

// 3. Property does not exist
interface User {
    name: string;
}
const user: User = { name: "John" };
console.log(user.age);

// 4. Missing return type
function add(a: number, b: number) {
    return a + b;
}

// 5. Unused variable
const unused = "this is not used";

// 6. Type assertion error
const value: any = "hello";
const length: number = (value as number).toString();

// 7. Missing implements
interface Animal {
    speak(): void;
}
class Dog {
    // Missing speak() method
}

// 8. Invalid generic
const arr: Array = [1, 2, 3];

// 9. Enum error
enum Direction {
    Up = "UP",
    Down = 123, // Mixed types
}

// 10. Module resolution
import { nonExistent } from 'non-existent-module';