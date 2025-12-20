import type Database from "better-sqlite3";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type {
	ChronicleConfig,
	ChronicleDatabase,
	RollbackOptions,
	VersionedTable,
	VersionOperation,
} from "./types";

/**
 * Chronicle - Temporal database wrapper for Drizzle ORM
 *
 * Provides automatic versioning and history tracking for database tables.
 * Phase 1 implements simple versioning with history tables.
 */
export class Chronicle {
	private db: ChronicleDatabase;
	private sqlite: Database.Database;
	private config: Required<ChronicleConfig>;
	private versionedTables: Map<string, VersionedTable> = new Map();

	/**
	 * Type guard to safely check if a value is a record
	 */
	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	constructor(db: ChronicleDatabase, config: ChronicleConfig = {}) {
		this.db = db;
		// Access the underlying SQLite database from Drizzle
		// Note: Drizzle's internal API doesn't expose types for session.client
		this.sqlite = (db as unknown as { session: { client: Database.Database } }).session.client;
		this.config = {
			strategy: config.strategy ?? "simple-versioning",
			historyTableSuffix: config.historyTableSuffix ?? "_history",
			autoCreateHistoryTables: config.autoCreateHistoryTables ?? true,
		};
	}

	/**
	 * Register a table for versioning
	 * Creates a corresponding history table if autoCreateHistoryTables is true
	 */
	registerTable<TTable extends SQLiteTable>(
		table: TTable,
		tableName: string,
	): VersionedTable<TTable> {
		const historyTableName = `${tableName}${this.config.historyTableSuffix}`;

		const versionedTable: VersionedTable<TTable> = {
			table,
			historyTableName,
			config: this.config,
		};

		this.versionedTables.set(tableName, versionedTable as VersionedTable);

		if (this.config.autoCreateHistoryTables) {
			this.createHistoryTable(tableName, table);
		}

		return versionedTable;
	}

	/**
	 * Create history table for a given table
	 * History table has all original columns plus version metadata
	 */
	private createHistoryTable(tableName: string, table: SQLiteTable): void {
		const historyTableName = `${tableName}${this.config.historyTableSuffix}`;

		// Get column definitions from the original table
		const columns = Object.keys(table).filter((key) => {
			const value = table[key as keyof typeof table];
			return value && typeof value === "object" && "name" in value;
		});

		// Build CREATE TABLE statement for history table
		// Extract column types from Drizzle schema
		const columnDefs = columns
			.map((col) => {
				const column = table[col as keyof typeof table] as
					| { name: string; dataType?: string; columnType?: string }
					| undefined;
				if (!column || typeof column !== "object" || !("name" in column)) {
					throw new Error(`Invalid column definition for ${col}`);
				}
				const columnName = column.name;

				// Map Drizzle column types to SQLite types
				let sqliteType = "TEXT"; // default

				if (column.dataType === "integer" || column.columnType === "SQLiteInteger") {
					sqliteType = "INTEGER";
				} else if (column.dataType === "real" || column.columnType === "SQLiteReal") {
					sqliteType = "REAL";
				} else if (column.dataType === "text" || column.columnType === "SQLiteText") {
					sqliteType = "TEXT";
				} else if (column.dataType === "blob" || column.columnType === "SQLiteBlob") {
					sqliteType = "BLOB";
				}

				return `${columnName} ${sqliteType}`;
			})
			.join(", ");

		const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${historyTableName} (
        version_id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        version_operation TEXT NOT NULL CHECK(version_operation IN ('INSERT', 'UPDATE', 'DELETE')),
        ${columnDefs}
      )
    `;

		this.sqlite.prepare(createTableSQL).run();
	}

	/**
	 * Insert a record with automatic versioning
	 */
	async insert<T extends Record<string, unknown>>(tableName: string, values: T): Promise<void> {
		const versionedTable = this.versionedTables.get(tableName);
		if (!versionedTable) {
			throw new Error(`Table ${tableName} is not registered for versioning`);
		}

		// Insert into main table
		const columns = Object.keys(values);
		const placeholders = columns.map(() => "?").join(", ");
		const columnNames = columns.join(", ");
		const insertValues = columns.map((col) => values[col]);

		this.sqlite
			.prepare(`INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`)
			.run(...insertValues);

		// Record in history table
		await this.recordVersion(tableName, values, "INSERT");
	}

	/**
	 * Update a record with automatic versioning
	 */
	async update<T extends Record<string, unknown>>(
		tableName: string,
		values: T,
		where: Record<string, unknown>,
	): Promise<void> {
		const versionedTable = this.versionedTables.get(tableName);
		if (!versionedTable) {
			throw new Error(`Table ${tableName} is not registered for versioning`);
		}

		// Get current record before update
		const whereClause = Object.keys(where)
			.map((key) => `${key} = ?`)
			.join(" AND ");
		const whereValues = Object.values(where);

		const current = this.sqlite
			.prepare(`SELECT * FROM ${tableName} WHERE ${whereClause}`)
			.get(...whereValues);

		if (!current || !this.isRecord(current)) {
			throw new Error("Record not found");
		}

		// Update main table
		const setClause = Object.keys(values)
			.map((key) => `${key} = ?`)
			.join(", ");
		const updateValues = [...Object.values(values), ...whereValues];

		this.sqlite
			.prepare(`UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`)
			.run(...updateValues);

		// Record in history table (store the NEW values)
		await this.recordVersion(tableName, { ...current, ...values }, "UPDATE");
	}

	/**
	 * Delete a record with automatic versioning
	 */
	async delete(tableName: string, where: Record<string, unknown>): Promise<void> {
		const versionedTable = this.versionedTables.get(tableName);
		if (!versionedTable) {
			throw new Error(`Table ${tableName} is not registered for versioning`);
		}

		// Get current record before deletion
		const whereClause = Object.keys(where)
			.map((key) => `${key} = ?`)
			.join(" AND ");
		const whereValues = Object.values(where);

		const current = this.sqlite
			.prepare(`SELECT * FROM ${tableName} WHERE ${whereClause}`)
			.get(...whereValues);

		if (!current || !this.isRecord(current)) {
			throw new Error("Record not found");
		}

		// Delete from main table
		this.sqlite.prepare(`DELETE FROM ${tableName} WHERE ${whereClause}`).run(...whereValues);

		// Record in history table
		await this.recordVersion(tableName, current, "DELETE");
	}

	/**
	 * Record a version in the history table
	 */
	private async recordVersion<T extends Record<string, unknown>>(
		tableName: string,
		values: T,
		operation: VersionOperation,
	): Promise<void> {
		const historyTableName = `${tableName}${this.config.historyTableSuffix}`;

		const columns = ["version_operation", ...Object.keys(values)];
		const placeholders = columns.map(() => "?").join(", ");
		const columnNames = columns.join(", ");
		const insertValues = [operation, ...Object.values(values)];

		this.sqlite
			.prepare(`INSERT INTO ${historyTableName} (${columnNames}) VALUES (${placeholders})`)
			.run(...insertValues);
	}

	/**
	 * Get all versions of a record
	 */
	async getVersions<T>(tableName: string, where: Record<string, unknown>): Promise<T[]> {
		const historyTableName = `${tableName}${this.config.historyTableSuffix}`;

		const whereClause = Object.keys(where)
			.map((key) => `${key} = ?`)
			.join(" AND ");
		const whereValues = Object.values(where);

		const versions = this.sqlite
			.prepare(`SELECT * FROM ${historyTableName} WHERE ${whereClause} ORDER BY version_id ASC`)
			.all(...whereValues);

		return versions as T[];
	}

	/**
	 * Get a specific version of a record
	 */
	async getVersion<T>(tableName: string, versionId: number): Promise<T | null> {
		const historyTableName = `${tableName}${this.config.historyTableSuffix}`;

		const version = this.sqlite
			.prepare(`SELECT * FROM ${historyTableName} WHERE version_id = ?`)
			.get(versionId);

		return (version as T) ?? null;
	}

	/**
	 * Rollback a record to a specific version
	 */
	async rollback(tableName: string, options: RollbackOptions): Promise<void> {
		const versionedTable = this.versionedTables.get(tableName);
		if (!versionedTable) {
			throw new Error(`Table ${tableName} is not registered for versioning`);
		}

		// Get the version to rollback to
		const version = await this.getVersion(tableName, options.versionId);
		if (!version) {
			throw new Error(`Version ${options.versionId} not found`);
		}

		// Remove version metadata fields
		const { version_id, version_created_at, version_operation, ...data } = version as Record<
			string,
			unknown
		>;

		// Update the current record with the version data
		await this.update(tableName, data, options.where);
	}

	/**
	 * Get the underlying Drizzle database instance
	 */
	getDb(): ChronicleDatabase {
		return this.db;
	}
}
