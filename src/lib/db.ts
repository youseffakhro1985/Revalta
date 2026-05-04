import Database from 'better-sqlite3';
import path from 'path';

// Initierar en anslutning till dev.db
const dbPath = path.join(process.cwd(), 'dev.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export default db;
