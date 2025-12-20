# Drizzle Chronicle

> Temporal database wrapper for Drizzle ORM - Automatic versioning and history tracking

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-orange)](https://orm.drizzle.team/)

Drizzle Chronicle extends [Drizzle ORM](https://orm.drizzle.team/) with temporal capabilities, enabling automatic version tracking, historical data queries, and time-based data management.

## Features

- ✅ **Automatic Versioning** - Track all changes to records automatically
- ✅ **History Tables** - Automatic creation of history tables for versioned entities
- ✅ **Version Queries** - Query historical versions of records
- ✅ **Rollback Support** - Restore records to previous versions
- ✅ **Type-Safe** - Full TypeScript support with type inference
- ✅ **SQLite Support** - Currently supports SQLite (PostgreSQL coming soon)

## Installation

```bash
# Using pnpm (recommended)
pnpm add drizzle-chronicle drizzle-orm

# Using npm
npm install drizzle-chronicle drizzle-orm

# Using yarn
yarn add drizzle-chronicle drizzle-orm
```

**Note:** `drizzle-orm` is a peer dependency. For SQLite, you may also need `better-sqlite3`:

```bash
pnpm add -D better-sqlite3  # Optional, only if using SQLite
```

## Quick Start

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { Chronicle } from "drizzle-chronicle";

// Define your table schema
const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

// Create database connection
const sqlite = new Database(":memory:");
const db = drizzle(sqlite);

// Initialize Chronicle
const chronicle = new Chronicle(db, {
  strategy: "simple-versioning",
  autoCreateHistoryTables: true,
});

// Register table for versioning
chronicle.registerTable(users, "users");

// Create the table (using Drizzle or raw SQL)
db.run(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL
  )
`);

// Insert a record (automatically creates version)
await chronicle.insert("users", {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
});

// Update record (creates new version)
await chronicle.update("users", { email: "alice.smith@example.com" }, { id: 1 });

// Get all versions
const versions = await chronicle.getVersions("users", { id: 1 });
console.log(`Found ${versions.length} versions`);

// Rollback to previous version
await chronicle.rollback("users", {
  versionId: 1,
  where: { id: 1 },
});
```

## API Reference

### Chronicle Class

#### Constructor

```typescript
new Chronicle(db: ChronicleDatabase, config?: ChronicleConfig)
```

**Parameters:**
- `db` - Drizzle database instance
- `config` - Optional configuration (see `ChronicleConfig` below)

#### Methods

##### `registerTable(table, tableName)`

Register a table for versioning. Creates a history table if `autoCreateHistoryTables` is enabled.

```typescript
chronicle.registerTable(users, "users");
```

##### `insert(tableName, values)`

Insert a record with automatic versioning.

```typescript
await chronicle.insert("users", {
  id: 1,
  name: "Alice",
  email: "alice@example.com",
});
```

##### `update(tableName, values, where)`

Update a record and create a new version.

```typescript
await chronicle.update("users", { email: "new@example.com" }, { id: 1 });
```

##### `delete(tableName, where)`

Delete a record and record the deletion in history.

```typescript
await chronicle.delete("users", { id: 1 });
```

##### `getVersions(tableName, where)`

Get all versions of a record.

```typescript
const versions = await chronicle.getVersions<VersionedUser>("users", { id: 1 });
```

##### `getVersion(tableName, versionId)`

Get a specific version by version ID.

```typescript
const version = await chronicle.getVersion<VersionedUser>("users", 5);
```

##### `rollback(tableName, options)`

Rollback a record to a specific version.

```typescript
await chronicle.rollback("users", {
  versionId: 3,
  where: { id: 1 },
});
```

### Configuration

```typescript
interface ChronicleConfig {
  strategy?: "simple-versioning" | "uni-temporal" | "bi-temporal";
  historyTableSuffix?: string; // Default: "_history"
  autoCreateHistoryTables?: boolean; // Default: true
}
```

### Types

```typescript
// Version metadata added to history records
interface VersionMetadata {
  version_id: number;
  version_created_at: string;
  version_operation: "INSERT" | "UPDATE" | "DELETE";
}

// Versioned record type
type VersionedRecord<T> = T & VersionMetadata;
```

## Examples

See the `examples/` directory for complete examples:

- **Basic CRUD** (`examples/basic-crud.ts`) - Demonstrates insert, update, delete, and version queries
- **History Queries** (`examples/history-queries.ts`) - Shows version history and rollback operations

Run examples:

```bash
pnpm exec tsx examples/basic-crud.ts
pnpm exec tsx examples/history-queries.ts
```

## How It Works

### History Tables

For each versioned table, Chronicle automatically creates a corresponding history table:

- **Main table:** `users` (current state)
- **History table:** `users_history` (all versions)

History tables include:
- All original columns from the main table
- `version_id` - Auto-incrementing version identifier
- `version_created_at` - Timestamp when version was created
- `version_operation` - Operation type (INSERT, UPDATE, DELETE)

### Version Tracking

Every operation automatically creates a version:

1. **INSERT** - Creates version 1 with operation "INSERT"
2. **UPDATE** - Creates version 2 with operation "UPDATE" (stores new values)
3. **DELETE** - Creates version 3 with operation "DELETE" (stores deleted values)

## Development

### Prerequisites

- Node.js 18.12+ (or use [fnm](https://github.com/Schniz/fnm) with `.node-version`)
- pnpm 10.26+

### Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format

# Check everything (lint + format + organize imports)
pnpm check
```

### Project Structure

```
drizzle-chronicle/
├── src/
│   ├── core/           # Core Chronicle implementation
│   ├── adapters/       # Database adapters (SQLite, PostgreSQL)
│   ├── strategies/     # Versioning strategies
│   └── index.ts        # Public API
├── examples/           # Usage examples
├── tests/              # Test suite
└── dev-docs/           # Development documentation
```

## Roadmap

### Phase 1: Simple Versioning ✅ (Current)

- [x] Automatic version tracking
- [x] History table creation
- [x] Version queries
- [x] Rollback support
- [x] TypeScript support

### Phase 2: Uni-Temporal (Planned)

- [ ] System time tracking
- [ ] Time-travel queries ("as of" specific date)
- [ ] Temporal joins

### Phase 3: PostgreSQL Support (Planned)

- [ ] PostgreSQL adapter
- [ ] Leverage PostgreSQL temporal features
- [ ] Performance optimizations

### Phase 4: Bi-Temporal (Future)

- [ ] Dual-time tracking (system time + valid time)
- [ ] Historical corrections
- [ ] Complex temporal queries

## Status

**Current Status:** Proof of Concept (PoC)

This project is currently in early development as a proof of concept. The simple versioning strategy is implemented and working, but the API may change as the project evolves.

## Contributing

Contributions are welcome! This is a PoC project, so feedback and suggestions are especially valuable.

## License

ISC

## Acknowledgments

- Built on top of [Drizzle ORM](https://orm.drizzle.team/) - A fantastic TypeScript ORM
- Inspired by temporal data patterns and bi-temporal modeling concepts

