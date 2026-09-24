import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Db, Param, Stmt } from './types.js';
import { UPGRADES } from './schema.js';

export function openNodeDb(file: string, schema: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(schema);
  // columns added since a database was first created: only where the table exists and the column does not
  for (const u of UPGRADES) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(u.table)) continue;
    if (!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(u.table, u.column)) db.exec(`ALTER TABLE ${u.table} ADD COLUMN ${u.column} ${u.ddl}`);
  }

  return {
    async get<T>(sql: string, params: Param[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async all<T>(sql: string, params: Param[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: Param[] = []) {
      db.prepare(sql).run(...params);
    },
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const [sql, params] of stmts) db.prepare(sql).run(...params);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
