import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { Chronicle } from "../../src/core/chronicle";
import { createTestDb } from "../helpers/test-db";

// Test table schema
const testTable = sqliteTable("test_table", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  value: integer("value").notNull(),
});

describe("Chronicle", () => {
  let chronicle: Chronicle;
  let sqlite: any;
  let cleanup: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    chronicle = new Chronicle(testDb.db, {
      strategy: "simple-versioning",
      autoCreateHistoryTables: true,
    });
    sqlite = testDb.sqlite;
    cleanup = testDb.cleanup;

    // Create main test table
    sqlite
      .prepare(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )
    `)
      .run();

    // Register for versioning
    chronicle.registerTable(testTable, "test_table");
  });

  afterEach(() => {
    cleanup();
  });

  describe("Configuration", () => {
    test("should initialize with default config", () => {
      const { db, cleanup: testCleanup } = createTestDb();
      const defaultChronicle = new Chronicle(db);

      expect(defaultChronicle).toBeDefined();
      expect(defaultChronicle.getDb()).toBe(db);

      testCleanup();
    });

    test("should accept custom config", () => {
      const { db, cleanup: testCleanup } = createTestDb();
      const customChronicle = new Chronicle(db, {
        strategy: "uni-temporal",
        historyTableSuffix: "_archive",
        autoCreateHistoryTables: false,
      });

      expect(customChronicle).toBeDefined();

      testCleanup();
    });
  });

  describe("Table Registration", () => {
    test("should register table for versioning", () => {
      const { db, cleanup: testCleanup } = createTestDb();
      const testChronicle = new Chronicle(db, {
        autoCreateHistoryTables: false,
      });

      const versionedTable = testChronicle.registerTable(testTable, "test_table");

      expect(versionedTable).toBeDefined();
      expect(versionedTable.table).toBe(testTable);
      expect(versionedTable.historyTableName).toBe("test_table_history");

      testCleanup();
    });

    test("should create history table when autoCreate is enabled", () => {
      const { db, cleanup: testCleanup } = createTestDb();
      const testChronicle = new Chronicle(db, {
        autoCreateHistoryTables: true,
      });

      const testSqlite = (db as any).session.client;
      testSqlite.prepare(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`).run();
      testChronicle.registerTable(testTable, "users");

      // Verify history table exists by trying to query it
      const result = testSqlite
        .prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='users_history'
      `)
        .get();

      expect(result).toBeDefined();

      testCleanup();
    });
  });

  describe("Insert Operations", () => {
    test("should insert record with versioning", async () => {
      await chronicle.insert("test_table", {
        id: 1,
        name: "Test Record",
        value: 100,
      });

      // Verify record exists in main table
      const record = sqlite.prepare(`SELECT * FROM test_table WHERE id = 1`).get();
      expect(record).toBeDefined();

      // Verify history was recorded
      const history = sqlite.prepare(`SELECT * FROM test_table_history WHERE id = 1`).get();
      expect(history).toBeDefined();
      expect((history as any).version_operation).toBe("INSERT");
    });

    test("should throw error when inserting into unregistered table", async () => {
      await expect(chronicle.insert("nonexistent_table", { id: 1, name: "Test" })).rejects.toThrow(
        "not registered"
      );
    });
  });

  describe("Update Operations", () => {
    test("should update record and create version", async () => {
      // Insert initial record
      await chronicle.insert("test_table", {
        id: 1,
        name: "Original",
        value: 100,
      });

      // Update record
      await chronicle.update("test_table", { name: "Updated" }, { id: 1 });

      // Verify update in main table
      const record = sqlite.prepare(`SELECT * FROM test_table WHERE id = 1`).get() as any;
      expect(record.name).toBe("Updated");

      // Verify version history
      const versions = await chronicle.getVersions("test_table", { id: 1 });
      expect(versions).toHaveLength(2);
      expect((versions[1] as any).version_operation).toBe("UPDATE");
    });
  });

  describe("Delete Operations", () => {
    test("should delete record and record in history", async () => {
      // Insert record
      await chronicle.insert("test_table", {
        id: 1,
        name: "To Delete",
        value: 100,
      });

      // Delete record
      await chronicle.delete("test_table", { id: 1 });

      // Verify deleted from main table
      const record = sqlite.prepare(`SELECT * FROM test_table WHERE id = 1`).get();
      expect(record).toBeUndefined();

      // Verify deletion recorded in history
      const versions = await chronicle.getVersions("test_table", { id: 1 });
      const deleteVersion = versions[versions.length - 1] as any;
      expect(deleteVersion.version_operation).toBe("DELETE");
    });

    test("should throw error when deleting non-existent record", async () => {
      await expect(chronicle.delete("test_table", { id: 999 })).rejects.toThrow("Record not found");
    });
  });

  describe("Version Queries", () => {
    test("should retrieve all versions of a record", async () => {
      await chronicle.insert("test_table", { id: 1, name: "V1", value: 1 });
      await chronicle.update("test_table", { name: "V2" }, { id: 1 });
      await chronicle.update("test_table", { name: "V3" }, { id: 1 });

      const versions = await chronicle.getVersions("test_table", { id: 1 });

      expect(versions).toHaveLength(3);
      expect((versions[0] as any).name).toBe("V1");
      expect((versions[1] as any).name).toBe("V2");
      expect((versions[2] as any).name).toBe("V3");
    });

    test("should retrieve specific version by ID", async () => {
      await chronicle.insert("test_table", { id: 1, name: "Test", value: 100 });

      const versions = await chronicle.getVersions("test_table", { id: 1 });
      const versionId = (versions[0] as any).version_id;

      const version = await chronicle.getVersion("test_table", versionId);

      expect(version).toBeDefined();
      expect((version as any).name).toBe("Test");
    });

    test("should return null for non-existent version", async () => {
      const version = await chronicle.getVersion("test_table", 99999);
      expect(version).toBeNull();
    });
  });

  describe("Rollback", () => {
    test("should rollback to previous version", async () => {
      // Create and modify record
      await chronicle.insert("test_table", { id: 1, name: "V1", value: 100 });
      await chronicle.update("test_table", { name: "V2", value: 200 }, { id: 1 });
      await chronicle.update("test_table", { name: "V3", value: 300 }, { id: 1 });

      const versions = await chronicle.getVersions("test_table", { id: 1 });
      const version2Id = (versions[1] as any).version_id;

      // Rollback to version 2
      await chronicle.rollback("test_table", {
        versionId: version2Id,
        where: { id: 1 },
      });

      // Verify current state matches version 2
      const current = sqlite.prepare(`SELECT * FROM test_table WHERE id = 1`).get() as any;
      expect(current.name).toBe("V2");
      expect(current.value).toBe(200);
    });

    test("should throw error when rolling back to non-existent version", async () => {
      await expect(
        chronicle.rollback("test_table", {
          versionId: 99999,
          where: { id: 1 },
        })
      ).rejects.toThrow("Version 99999 not found");
    });
  });
});
