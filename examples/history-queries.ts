/**
 * History Queries Example
 *
 * Demonstrates how to query version history and rollback to previous versions.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { Chronicle } from "../src";
import type { VersionedRecord } from "../src/core/types";

// Define a products table
const products = sqliteTable("products", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	price: integer("price").notNull(),
	description: text("description"),
});

type Product = {
	id: number;
	name: string;
	price: number;
	description: string | null;
};

type VersionedProduct = VersionedRecord<Product>;

async function main() {
	// Create in-memory database
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite);

	// Initialize Chronicle
	const chronicle = new Chronicle(db);

	console.log("=== Drizzle Chronicle - History Queries Example ===\n");

	// Register and create tables
	chronicle.registerTable(products, "products");
	db.run(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT
    )
  `);

	console.log("✓ Tables created\n");

	// Create a product and modify it several times
	console.log("Creating product and making changes...\n");

	await chronicle.insert("products", {
		id: 1,
		name: "Laptop",
		price: 999,
		description: "Basic laptop",
	});
	console.log("Version 1: Created - Laptop at $999");

	await chronicle.update("products", { price: 899 }, { id: 1 });
	console.log("Version 2: Price reduced to $899");

	await chronicle.update("products", { description: "High-performance laptop" }, { id: 1 });
	console.log("Version 3: Updated description");

	await chronicle.update("products", { price: 799 }, { id: 1 });
	console.log("Version 4: Price reduced to $799");

	await chronicle.update("products", { name: "Gaming Laptop" }, { id: 1 });
	console.log("Version 5: Renamed to Gaming Laptop\n");

	// Query all versions
	console.log("--- Complete Version History ---");
	const versions = await chronicle.getVersions<VersionedProduct>("products", { id: 1 });

	versions.forEach((version: VersionedProduct) => {
		console.log(`
Version ${version.version_id} (${version.version_operation}):
  Name: ${version.name}
  Price: $${version.price}
  Description: ${version.description}
  Timestamp: ${version.version_created_at}`);
	});

	// Get a specific version
	console.log("\n--- Retrieving Specific Version ---");
	const version3 = await chronicle.getVersion("products", 3);
	console.log("Version 3 details:", version3);

	// Rollback to version 2
	console.log("\n--- Rollback Demo ---");
	console.log("Rolling back to version 2 (price was $899)...");

	await chronicle.rollback("products", {
		versionId: 2,
		where: { id: 1 },
	});

	// Check current state after rollback
	const currentVersions = await chronicle.getVersions<VersionedProduct>("products", { id: 1 });
	const latest = currentVersions[currentVersions.length - 1];

	console.log("\nAfter rollback:");
	console.log(`  Current price: $${latest.price}`);
	console.log(`  Total versions: ${currentVersions.length}`);
	console.log(`  Latest operation: ${latest.version_operation}`);

	console.log("\n=== Example Complete ===");

	// Cleanup
	sqlite.close();
}

main().catch(console.error);
