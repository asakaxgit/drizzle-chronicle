import { describe, test, expect } from 'vitest';
import { createTestDb } from '../helpers/test-db';

describe('Test Infrastructure', () => {
  test('should create in-memory database', () => {
    const { db, sqlite, cleanup } = createTestDb();

    expect(db).toBeDefined();
    expect(sqlite).toBeDefined();
    expect(sqlite.memory).toBe(true);

    cleanup();
  });

  test('should run SQL queries', () => {
    const { db, sqlite, cleanup } = createTestDb();

    const result = sqlite.prepare('SELECT 1 + 1 as result').get() as { result: number };
    expect(result.result).toBe(2);

    cleanup();
  });
});
