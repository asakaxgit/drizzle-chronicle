import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Strategy for versioning: simple, uni-temporal, or bi-temporal
 */
export type VersioningStrategy = "simple-versioning" | "uni-temporal" | "bi-temporal";

/**
 * Type of operation that created a version
 */
export type VersionOperation = "INSERT" | "UPDATE" | "DELETE";

/**
 * Configuration options for Chronicle
 */
export interface ChronicleConfig {
	/**
	 * Versioning strategy to use
	 * @default 'simple-versioning'
	 */
	strategy?: VersioningStrategy;

	/**
	 * Suffix for history tables
	 * @default '_history'
	 */
	historyTableSuffix?: string;

	/**
	 * Whether to automatically create history tables
	 * @default true
	 */
	autoCreateHistoryTables?: boolean;
}

/**
 * Metadata fields added to history records
 */
export interface VersionMetadata {
	/**
	 * Unique version identifier (auto-increment)
	 */
	version_id: number;

	/**
	 * Timestamp when this version was created
	 */
	version_created_at: string;

	/**
	 * Operation that created this version
	 */
	version_operation: VersionOperation;
}

/**
 * A versioned table wraps a regular Drizzle table with history tracking
 */
export interface VersionedTable<TTable extends SQLiteTable = SQLiteTable> {
	/**
	 * The original table
	 */
	table: TTable;

	/**
	 * Name of the history table
	 */
	historyTableName: string;

	/**
	 * Configuration for this versioned table
	 */
	config: Required<ChronicleConfig>;
}

/**
 * Query options for retrieving versions
 */
export interface VersionQueryOptions {
	/**
	 * Retrieve all versions (default: false, only current)
	 */
	allVersions?: boolean;

	/**
	 * Retrieve a specific version by version_id
	 */
	versionId?: number;

	/**
	 * Retrieve version as of a specific date (uni-temporal/bi-temporal)
	 */
	asOf?: Date;
}

/**
 * Result of a versioned query includes the record and its version metadata
 */
export type VersionedRecord<T> = T & VersionMetadata;

/**
 * Chronicle database type
 */
export type ChronicleDatabase = BetterSQLite3Database;

/**
 * Rollback options
 */
export interface RollbackOptions {
	/**
	 * The version ID to rollback to
	 */
	versionId: number;

	/**
	 * Primary key value(s) to identify the record
	 */
	where: Record<string, unknown>;
}
