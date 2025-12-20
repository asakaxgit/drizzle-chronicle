# Drizzle Chronicle - Project Plan

## Overview
Drizzle Chronicle is a PoC project that wraps/extends Drizzle ORM to add temporal capabilities, enabling version tracking, historical data queries, and time-based data management.

## Project Goals
- Start with **simple versioning** for basic historical tracking
- Progress to **uni-temporal** capabilities (system time or valid time)
- Long-term goal: **bi-temporal** support (system time + valid time)
- Initial database: **SQLite** (easy PoC)
- Future database: **PostgreSQL** (production-ready)

## Third-Party Libraries & Rationale

### Core Dependencies

#### Drizzle ORM (`drizzle-orm`)
**Why:**
- Lightweight TypeScript ORM with excellent type inference
- SQL-like syntax makes temporal queries more intuitive
- No magic - transparent query building aids debugging
- Built-in migration support for schema evolution
- Supports both SQLite and PostgreSQL with same API
- Active development and growing ecosystem

**Alternatives Considered:**
- Prisma: Too heavy, generates client, less flexible for custom temporal logic
- TypeORM: Decorator-based, more complex, less TypeScript-first
- Kysely: Good but less feature-complete for schema management

#### SQLite Driver (choose one; keep optional)
**Why:**
- Drizzle supports multiple SQLite drivers; `drizzle-chronicle` should not force a native dependency on all consumers.
- For the PoC and examples we can use `better-sqlite3` because it’s fast and simple, but package it as **optional**.

**Recommended packaging for this library:**
- `drizzle-orm`: **peerDependency** (and also devDependency for local development)
- `better-sqlite3`: **optional peerDependency** (and also devDependency for local examples/tests)

**For examples (PoC):** use Drizzle’s Better SQLite3 adapter: `drizzle-orm/better-sqlite3` + `better-sqlite3`.

**Alternatives Considered:**
- node-sqlite3: Async-only, slower, more complex for simple PoC
- sql.js: In-memory only, not suitable for persistent data

### Development Dependencies

#### TypeScript (`typescript`)
**Why:**
- Essential for type-safe ORM wrapper
- Catches temporal logic errors at compile time
- Better IDE support and autocomplete
- Self-documenting code through types
- Required for Drizzle's type inference to work

#### TSX (`tsx`)
**Why:**
- Fast TypeScript execution without build step
- Perfect for running examples and tests during development
- Replaces ts-node with better performance
- Simplifies development workflow
- No configuration needed

#### Drizzle Kit (`drizzle-kit`)
**Why:**
- Generates migrations from schema changes
- Essential for managing history table schema
- Provides introspection tools
- Handles schema versioning automatically
- CLI tools for development

#### @types/node
**Why:**
- TypeScript definitions for Node.js APIs
- Required for file system, path operations
- Enables proper typing for process, Buffer, etc.

#### @types/better-sqlite3
**Why:**
- TypeScript definitions for better-sqlite3
- Ensures type safety when working with database
- Provides autocomplete for SQLite operations

### Future Dependencies (Phase 2+)

#### pg (PostgreSQL - Future)
**Why:**
- Official PostgreSQL client for Node.js
- Industry standard, well-tested
- Required by Drizzle for PostgreSQL
- Supports native temporal features

#### date-fns or dayjs (TBD)
**Why:**
- Needed for temporal calculations
- Parsing and formatting temporal queries
- Lightweight compared to moment.js
- Decision deferred until temporal features are implemented

### Why No Additional Libraries?

**No Zod/Validation Library (Initially):**
- Drizzle gives strong **TypeScript** typing, but it is not a runtime validation library
- Adds complexity for PoC
- Can add later if needed

**No Testing Framework Yet:**
- Start with simple examples
- Add Vitest/Jest when stabilized
- Keeps initial PoC simple

**No Logging Library:**
- Console.log sufficient for PoC
- Can add winston/pino later

**No CLI Framework:**
- Not building CLI tool yet
- Focus on library API first

## Current Status

### Completed
- ✅ Project initialized with pnpm
- ✅ Project name decided: `drizzle-chronicle`
- ✅ TypeScript setup
- ✅ Directory structure created

### In Progress
- ⏳ Installing Drizzle ORM and SQLite dependencies

## Technical Approach

### Phase 1: Simple Versioning (Current Focus)
**Goal:** Track all changes to records with version history

**Features:**
- Automatic version incrementing on updates
- History table pattern for each versioned entity
- Query helpers to retrieve specific versions
- Rollback capabilities

**Implementation:**
```typescript
// Example API
const chronicle = new Chronicle(db);

// Define a versioned table
const users = chronicle.versionedTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  email: text('email'),
});

// Auto-creates:
// - users table (current state)
// - users_history table (all versions)
```

**History Table Structure:**
- All original columns
- `version_id` (auto-increment)
- `version_created_at` (timestamp)
- `version_operation` (INSERT, UPDATE, DELETE)

### Phase 2: Uni-Temporal (Future)
**Goal:** Add time-based validity tracking

**Options:**
1. **System Time (Audit Trail)**
   - Track when records exist in the database
   - Useful for compliance and debugging

2. **Valid Time (Business Time)**
   - Track when records are valid in real world
   - Useful for historical corrections

**Additional Fields:**
- `sys_period_start` / `sys_period_end` OR
- `valid_from` / `valid_to`

**Features:**
- Time-travel queries: "Show me data as of 2024-01-01"
- Temporal joins
- Point-in-time snapshots

### Phase 3: Bi-Temporal (Long-term)
**Goal:** Track both system time and valid time

**Features:**
- Answer questions like: "What did we think on 2024-01-01 about the data valid on 2023-12-01?"
- Full audit trail with business time corrections
- Complex temporal queries

## Architecture Plan

### Project Structure
```
drizzle-chronicle/
├── src/
│   ├── core/
│   │   ├── chronicle.ts          # Main wrapper class
│   │   ├── versioned-table.ts    # Versioned table implementation
│   │   ├── query-builder.ts      # Enhanced query methods
│   │   └── types.ts               # TypeScript types
│   ├── strategies/
│   │   ├── simple-versioning.ts  # Phase 1
│   │   ├── uni-temporal.ts       # Phase 2
│   │   └── bi-temporal.ts        # Phase 3
│   ├── adapters/
│   │   ├── sqlite.ts             # SQLite-specific code
│   │   └── postgres.ts           # PostgreSQL (future)
│   └── index.ts                   # Public API exports
├── examples/
│   ├── basic-versioning.ts
│   ├── time-travel.ts
│   └── rollback.ts
├── tests/
│   └── (test files)
├── package.json
├── tsconfig.json
├── README.md
└── PLAN.md (this file)
```

### Core API Design

#### Chronicle Instance
```typescript
import { Chronicle } from 'drizzle-chronicle';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('mydb.sqlite');
const db = drizzle(sqlite);
const chronicle = new Chronicle(db, {
  strategy: 'simple-versioning', // or 'uni-temporal', 'bi-temporal'
});
```

#### Table Definition
```typescript
import { integer, text } from 'drizzle-orm/sqlite-core';

const users = chronicle.table('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
```

#### CRUD Operations
```typescript
// Insert - auto-versioned
await chronicle.insert(users).values({
  name: 'John Doe',
  email: 'john@example.com',
});

// Update - creates new version
await chronicle.update(users)
  .set({ email: 'newemail@example.com' })
  .where(eq(users.id, 1));

// Delete - marks as deleted in history
await chronicle.delete(users)
  .where(eq(users.id, 1));
```

#### Querying History
```typescript
// Get current state (default behavior)
const current = await chronicle.select().from(users);

// Get all versions of a record
const history = await chronicle
  .select()
  .from(users)
  .allVersions()
  .where(eq(users.id, 1));

// Get specific version
const version = await chronicle
  .select()
  .from(users)
  .version(5)
  .where(eq(users.id, 1));

// Time-travel query (uni-temporal/bi-temporal)
const snapshot = await chronicle
  .select()
  .from(users)
  .asOf(new Date('2024-01-01'));
```

#### Rollback
```typescript
// Rollback to specific version
await chronicle.rollback(users, { id: 1, version: 3 });
```

## Implementation Phases

### Phase 1: Simple Versioning (Week 1-2)
- [ ] Set up TypeScript configuration
- [ ] Install all dependencies
- [ ] Create Chronicle core class
- [ ] Implement history table generation
- [ ] Add insert/update/delete interceptors
- [ ] Build query helpers for history access
- [ ] Create basic examples
- [ ] Write unit tests
- [ ] Document API

### Phase 2: Uni-Temporal (Week 3-4)
- [ ] Design temporal column strategy
- [ ] Implement system time tracking
- [ ] Add time-travel query support
- [ ] Create temporal query builder extensions
- [ ] Add examples for temporal queries
- [ ] Update tests

### Phase 3: PostgreSQL Support (Week 5-6)
- [ ] Create PostgreSQL adapter
- [ ] Leverage PostgreSQL temporal features
- [ ] Add PostgreSQL-specific optimizations
- [ ] Create migration guides
- [ ] Performance testing

### Phase 4: Bi-Temporal (Future)
- [ ] Design bi-temporal schema
- [ ] Implement dual-time tracking
- [ ] Build complex temporal queries
- [ ] Add comprehensive examples
- [ ] Performance optimization

## Technical Decisions

### Why SQLite First?
- Easy setup for PoC
- No server required
- Good for testing and examples
- Quick iteration

### Why PostgreSQL Next?
- Production-ready
- Native temporal support (temporal tables, range types)
- Better performance for complex queries
- Industry standard for temporal data

### Drizzle ORM Integration Strategy
Two approaches considered:

1. **Wrapper Approach** (Recommended for PoC)
   - Wrap Drizzle's query builder
   - Intercept operations to add versioning
   - Maintain compatibility with existing Drizzle code
   - Easier to implement

2. **Extension Approach**
   - Extend Drizzle's internal classes
   - Deeper integration
   - More complex but more powerful
   - Consider for v2

## Success Criteria

### Phase 1 (Simple Versioning)
- ✅ Can track all changes to records
- ✅ Can query historical versions
- ✅ Can rollback to previous versions
- ✅ TypeScript support with full type safety
- ✅ Clear, simple API

### Phase 2 (Uni-Temporal)
- ✅ Can query data "as of" a specific time
- ✅ Temporal joins work correctly
- ✅ Performance is acceptable for typical use cases

### Phase 3 (Bi-Temporal)
- ✅ Can separate system time from valid time
- ✅ Can handle historical corrections
- ✅ Complex temporal queries work correctly

## Next Steps

1. **Complete Environment Setup**
   - Install Drizzle ORM dependencies
   - Configure TypeScript
   - Set up build scripts

2. **Create Basic Structure**
   - Set up src/ directory
   - Create core Chronicle class
   - Define TypeScript interfaces

3. **Implement Version Tracking**
   - History table creation
   - Insert/update/delete hooks
   - Basic query methods

4. **Build First Example**
   - Simple user table with versioning
   - Demonstrate CRUD operations
   - Show history queries

5. **Documentation**
   - API reference
   - Usage examples
   - Migration guides

## Questions to Address

- [ ] How to handle relationships between versioned tables?
- [ ] Migration strategy for existing Drizzle projects?
- [ ] Performance implications of history tables?
- [ ] Indexing strategy for temporal queries?
- [ ] How to handle schema changes over time?
- [ ] Garbage collection for old versions?

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Temporal Data Patterns](https://martinfowler.com/eaaDev/TemporalProperty.html)
- [Bi-temporal Data Management](https://en.wikipedia.org/wiki/Bitemporal_Modeling)
- [SQL:2011 Temporal Features](https://en.wikipedia.org/wiki/SQL:2011)

## License
TBD (MIT recommended for open source PoC)
