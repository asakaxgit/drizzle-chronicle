/**
 * Basic CRUD Example
 *
 * Demonstrates how to use Drizzle Chronicle for basic
 * create, read, update, and delete operations with automatic versioning.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Chronicle } from "../src";
import type { VersionedRecord } from "../src/core/types";

// Define a simple users table using Drizzle schema
const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	email: text("email").notNull(),
});

type User = {
	id: number;
	name: string;
	email: string;
};

type VersionedUser = VersionedRecord<User>;

async function main() {
	// Create in-memory database
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite);

	// Initialize Chronicle
	const chronicle = new Chronicle(db, {
		strategy: "simple-versioning",
		autoCreateHistoryTables: true,
	});

	console.log("=== Drizzle Chronicle - Basic CRUD Example ===\n");

	// Register the users table for versioning
	chronicle.registerTable(users, "users");

	// Create the main users table
	db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);

	console.log("✓ Tables created and registered for versioning\n");

	// INSERT: Create a new user
	console.log("1. INSERT: Creating new user...");
	await chronicle.insert("users", {
		id: 1,
		name: "Alice Smith",
		email: "alice@example.com",
	});
	console.log("   Created: Alice Smith (alice@example.com)\n");

	// UPDATE: Change user email
	console.log("2. UPDATE: Updating email...");
	await chronicle.update("users", { email: "alice.smith@example.com" }, { id: 1 });
	console.log("   Updated email to: alice.smith@example.com\n");

	// UPDATE: Change user name
	console.log("3. UPDATE: Updating name...");
	await chronicle.update("users", { name: "Alice Johnson" }, { id: 1 });
	console.log("   Updated name to: Alice Johnson\n");

	// READ: Get all versions
	console.log("4. READ: Retrieving version history...");
	const versions = await chronicle.getVersions("users", { id: 1 });
	console.log(`   Found ${versions.length} versions:\n`);

	versions.forEach((version: VersionedUser) => {
		console.log(`   Version ${version.version_id}:`);
		console.log(`     Operation: ${version.version_operation}`);
		console.log(`     Name: ${version.name}`);
		console.log(`     Email: ${version.email}`);
		console.log(`     Created: ${version.version_created_at}`);
		console.log();
	});

	// DELETE: Remove user
	console.log("5. DELETE: Removing user...");
	await chronicle.delete("users", { id: 1 });
	console.log("   User deleted\n");

	// Verify deletion was recorded in history
	const allVersions = await chronicle.getVersions<VersionedUser>("users", { id: 1 });
	console.log(`6. VERIFY: Total versions including DELETE: ${allVersions.length}`);
	const lastVersion = allVersions[allVersions.length - 1];
	console.log(`   Last operation: ${lastVersion.version_operation}\n`);

	console.log("=== Example Complete ===");

	// Cleanup
	sqlite.close();
}

main().catch(console.error);
