import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Creates an in-memory SQLite database for testing
 * Each test should create its own database to ensure isolation
 */
export function createTestDb(): {
	db: BetterSQLite3Database;
	sqlite: Database.Database;
	cleanup: () => void;
} {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite);

	const cleanup = () => {
		sqlite.close();
	};

	return { db, sqlite, cleanup };
}

/**
 * Helper to run a test with a fresh database
 * Automatically handles cleanup
 */
export async function withTestDb<T>(
	fn: (db: BetterSQLite3Database, sqlite: Database.Database) => T | Promise<T>,
): Promise<T> {
	const { db, sqlite, cleanup } = createTestDb();
	try {
		return await fn(db, sqlite);
	} finally {
		cleanup();
	}
}
