import { describe, test, expect } from 'vitest';
import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core';
import { Chronicle } from '../../src';
import { withTestDb } from '../helpers/test-db';

// Schema for integration tests
const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(),
});

describe('Integration: Complete Versioning Workflows', () => {
  test('should track complete lifecycle of a record', async () => {
    await withTestDb(async (db, sqlite) => {
      const chronicle = new Chronicle(db);

      // Setup
      sqlite.prepare(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `).run();
      chronicle.registerTable(users, 'users');

      // 1. Create user
      await chronicle.insert('users', {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
      });

      // 2. Promote to admin
      await chronicle.update('users', { role: 'admin' }, { id: 1 });

      // 3. Change email
      await chronicle.update('users', { email: 'john.doe@example.com' }, { id: 1 });

      // 4. Update name (marriage)
      await chronicle.update('users', { name: 'John Smith' }, { id: 1 });

      // 5. Delete account
      await chronicle.delete('users', { id: 1 });

      // Verify complete history
      const versions = await chronicle.getVersions('users', { id: 1 });

      expect(versions).toHaveLength(5);
      expect((versions[0] as any).version_operation).toBe('INSERT');
      expect((versions[1] as any).version_operation).toBe('UPDATE');
      expect((versions[2] as any).version_operation).toBe('UPDATE');
      expect((versions[3] as any).version_operation).toBe('UPDATE');
      expect((versions[4] as any).version_operation).toBe('DELETE');

      // Verify data at each version
      expect((versions[0] as any).name).toBe('John Doe');
      expect((versions[0] as any).role).toBe('user');
      expect((versions[1] as any).role).toBe('admin');
      expect((versions[2] as any).email).toBe('john.doe@example.com');
      expect((versions[3] as any).name).toBe('John Smith');
    });
  });

  test('should handle multiple records independently', async () => {
    await withTestDb(async (db, sqlite) => {
      const chronicle = new Chronicle(db);

      sqlite.prepare(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `).run();
      chronicle.registerTable(users, 'users');

      // Create multiple users
      await chronicle.insert('users', {
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
        role: 'admin',
      });

      await chronicle.insert('users', {
        id: 2,
        name: 'Bob',
        email: 'bob@example.com',
        role: 'user',
      });

      // Update only Alice
      await chronicle.update('users', { role: 'superadmin' }, { id: 1 });

      // Update only Bob
      await chronicle.update('users', { email: 'robert@example.com' }, { id: 2 });

      // Verify separate version histories
      const aliceVersions = await chronicle.getVersions('users', { id: 1 });
      const bobVersions = await chronicle.getVersions('users', { id: 2 });

      expect(aliceVersions).toHaveLength(2);
      expect(bobVersions).toHaveLength(2);

      expect((aliceVersions[1] as any).role).toBe('superadmin');
      expect((bobVersions[1] as any).email).toBe('robert@example.com');
    });
  });

  test('should support rollback workflows', async () => {
    await withTestDb(async (db, sqlite) => {
      const chronicle = new Chronicle(db);

      sqlite.prepare(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `).run();
      chronicle.registerTable(users, 'users');

      // Create and modify user
      await chronicle.insert('users', {
        id: 1,
        name: 'Charlie',
        email: 'charlie@example.com',
        role: 'user',
      });

      await chronicle.update('users', { role: 'admin' }, { id: 1 });
      await chronicle.update('users', { email: 'c.brown@example.com' }, { id: 1 });

      // Get version ID of the admin promotion
      const versions = await chronicle.getVersions('users', { id: 1 });
      const adminVersionId = (versions[1] as any).version_id;

      // Make a mistake
      await chronicle.update('users', { role: 'guest' }, { id: 1 });

      // Rollback to admin version
      await chronicle.rollback('users', {
        versionId: adminVersionId,
        where: { id: 1 },
      });

      // Verify role is back to admin
      const current = sqlite.prepare(`SELECT * FROM users WHERE id = 1`).get() as any;
      expect(current.role).toBe('admin');

      // Verify rollback created a new version
      const finalVersions = await chronicle.getVersions('users', { id: 1 });
      expect(finalVersions.length).toBeGreaterThan(versions.length);
    });
  });

  test('should maintain data integrity across operations', async () => {
    await withTestDb(async (db, sqlite) => {
      const chronicle = new Chronicle(db);

      sqlite.prepare(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `).run();
      chronicle.registerTable(users, 'users');

      // Perform many operations
      for (let i = 1; i <= 10; i++) {
        await chronicle.insert('users', {
          id: i,
          name: `User${i}`,
          email: `user${i}@example.com`,
          role: 'user',
        });
      }

      // Update all users
      for (let i = 1; i <= 10; i++) {
        await chronicle.update('users', { role: 'member' }, { id: i });
      }

      // Delete half of them
      for (let i = 1; i <= 5; i++) {
        await chronicle.delete('users', { id: i });
      }

      // Verify remaining users in main table
      const remainingUsers = sqlite.prepare(`SELECT * FROM users`).all();
      expect(remainingUsers).toHaveLength(5);

      // Verify all history is preserved
      for (let i = 1; i <= 10; i++) {
        const versions = await chronicle.getVersions('users', { id: i });

        if (i <= 5) {
          // Should have INSERT, UPDATE, DELETE
          expect(versions).toHaveLength(3);
          expect((versions[2] as any).version_operation).toBe('DELETE');
        } else {
          // Should have INSERT, UPDATE
          expect(versions).toHaveLength(2);
        }
      }
    });
  });

  test('should handle edge cases correctly', async () => {
    await withTestDb(async (db, sqlite) => {
      const chronicle = new Chronicle(db);

      sqlite.prepare(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL
        )
      `).run();
      chronicle.registerTable(users, 'users');

      // Test: Update immediately after insert
      await chronicle.insert('users', {
        id: 1,
        name: 'Test',
        email: 'test@example.com',
        role: 'user',
      });

      await chronicle.update('users', { role: 'admin' }, { id: 1 });

      const versions = await chronicle.getVersions('users', { id: 1 });
      expect(versions).toHaveLength(2);

      // Test: Multiple updates of same field
      await chronicle.update('users', { role: 'user' }, { id: 1 });
      await chronicle.update('users', { role: 'admin' }, { id: 1 });
      await chronicle.update('users', { role: 'superadmin' }, { id: 1 });

      const updatedVersions = await chronicle.getVersions('users', { id: 1 });
      expect(updatedVersions).toHaveLength(5);

      // Verify all role changes are tracked
      expect((updatedVersions[1] as any).role).toBe('admin');
      expect((updatedVersions[2] as any).role).toBe('user');
      expect((updatedVersions[3] as any).role).toBe('admin');
      expect((updatedVersions[4] as any).role).toBe('superadmin');
    });
  });
});
