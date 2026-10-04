import { test } from 'node:test';
import assert from 'node:assert';

test('1 + 1 equals 2', () => {
  // Arrange
  const a = 1;
  const b = 1;

  // Act
  const result = a + b;

  // Assert
  assert.strictEqual(result, 2);
});

test('a string contains another string', () => {
  const greeting = 'Hello Assetly';
  assert.ok(greeting.includes('Assetly'));
});
