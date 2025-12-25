/**
 * Rollback Example
 *
 * Demonstrates how to rollback a record to a previous version
 * using Drizzle Chronicle. Shows that rollback creates a new
 * history entry with the restored values.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Chronicle } from "../src";
import type { VersionedRecord } from "../src/core/types";

// Define users table
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
  // In-memory DB
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);

  const chronicle = new Chronicle(db, {
    strategy: "simple-versioning",
    autoCreateHistoryTables: true,
  });

  console.log("=== Drizzle Chronicle - Rollback Example ===\n");

  // Register and create table
  chronicle.registerTable(users, "users");
  db.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);

  console.log("✓ users table ready\n");

  // Insert initial user
  console.log("1. INSERT: Creating user Bob...");
  await chronicle.insert("users", {
    id: 1,
    name: "Bob",
    email: "bob@example.com",
  });
  console.log("   Created: Bob <bob@example.com>\n");

  // Make a couple of updates
  console.log("2. UPDATE: Changing email...");
  await chronicle.update("users", { email: "bob.smith@example.com" }, { id: 1 });
  console.log("   Email -> bob.smith@example.com\n");

  console.log("3. UPDATE: Changing name...");
  await chronicle.update("users", { name: "Robert Smith" }, { id: 1 });
  console.log("   Name  -> Robert Smith\n");

  // Show current history
  const historyBefore = await chronicle.getVersions<VersionedUser>("users", { id: 1 });
  console.log(`4. HISTORY BEFORE ROLLBACK: ${historyBefore.length} versions`);
  historyBefore.forEach((v) => {
    console.log(
      `   v${v.version_id} [${v.version_operation}] name=${v.name} email=${v.email}`,
    );
  });
  console.log();

  // Rollback to version 2 (email change)
  console.log("5. ROLLBACK: Restoring to version 2...");
  await chronicle.rollback("users", { versionId: 2, where: { id: 1 } });
  console.log("   Rollback applied (creates a new version)\n");

  // Verify latest state after rollback
  const historyAfter = await chronicle.getVersions<VersionedUser>("users", { id: 1 });
  const latest = historyAfter[historyAfter.length - 1];
  console.log(`6. HISTORY AFTER ROLLBACK: ${historyAfter.length} versions`);
  historyAfter.forEach((v) => {
    console.log(
      `   v${v.version_id} [${v.version_operation}] name=${v.name} email=${v.email}`,
    );
  });
  console.log();

  console.log("Latest state:");
  console.log(`   name=${latest.name}`);
  console.log(`   email=${latest.email}`);
  console.log(`   operation=${latest.version_operation}`);

  console.log("\n=== Example Complete ===");

  // Cleanup
  sqlite.close();
}

main().catch(console.error);
