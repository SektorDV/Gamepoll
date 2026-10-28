import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface User {
  id: number;
  bgg_username: string;
  added_at: number;
}

export interface Game {
  id: number;
  bgg_id: number;
  name: string;
  year_published?: number;
  min_players?: number;
  max_players?: number;
  best_players?: string;
  recommended_players?: string;
  playing_time?: number;
  min_playtime?: number;
  max_playtime?: number;
  weight?: number;
  categories?: string;
  mechanics?: string;
  is_expansion: boolean;
  last_updated: number;
}

export interface Ownership {
  user_id: number;
  game_bgg_id: number;
}

export interface UserCache {
  bgg_username: string;
  last_fetched: number;
}

export class GameDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  async ensureDataDir(dbPath: string): Promise<void> {
    const dir = dirname(dbPath);
    await mkdir(dir, { recursive: true });
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bgg_username TEXT UNIQUE NOT NULL,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bgg_id INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        year_published INTEGER,
        min_players INTEGER,
        max_players INTEGER,
        best_players TEXT,
        recommended_players TEXT,
        playing_time INTEGER,
        min_playtime INTEGER,
        max_playtime INTEGER,
        weight REAL,
        categories TEXT,
        mechanics TEXT,
        is_expansion BOOLEAN NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ownership (
        user_id INTEGER NOT NULL,
        game_bgg_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, game_bgg_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (game_bgg_id) REFERENCES games(bgg_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_cache (
        bgg_username TEXT PRIMARY KEY,
        last_fetched INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_games_bgg_id ON games(bgg_id);
      CREATE INDEX IF NOT EXISTS idx_ownership_user ON ownership(user_id);
      CREATE INDEX IF NOT EXISTS idx_ownership_game ON ownership(game_bgg_id);
    `);
  }

  addUser(bggUsername: string): number {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO users (bgg_username, added_at) VALUES (?, ?)'
    );
    const result = stmt.run(bggUsername, Date.now());
    
    if (result.changes === 0) {
      const existing = this.db.prepare('SELECT id FROM users WHERE bgg_username = ?').get(bggUsername) as { id: number };
      return existing.id;
    }
    
    return result.lastInsertRowid as number;
  }

  removeUser(bggUsername: string): boolean {
    const stmt = this.db.prepare('DELETE FROM users WHERE bgg_username = ?');
    const result = stmt.run(bggUsername);
    return result.changes > 0;
  }

  getUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY added_at');
    return stmt.all() as User[];
  }

  upsertGame(game: Omit<Game, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO games (
        bgg_id, name, year_published, min_players, max_players,
        best_players, recommended_players, playing_time, min_playtime, max_playtime,
        weight, categories, mechanics, is_expansion, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bgg_id) DO UPDATE SET
        name = excluded.name,
        year_published = excluded.year_published,
        min_players = excluded.min_players,
        max_players = excluded.max_players,
        best_players = excluded.best_players,
        recommended_players = excluded.recommended_players,
        playing_time = excluded.playing_time,
        min_playtime = excluded.min_playtime,
        max_playtime = excluded.max_playtime,
        weight = excluded.weight,
        categories = excluded.categories,
        mechanics = excluded.mechanics,
        is_expansion = excluded.is_expansion,
        last_updated = excluded.last_updated
    `);

    const result = stmt.run(
      game.bgg_id,
      game.name,
      game.year_published,
      game.min_players,
      game.max_players,
      game.best_players,
      game.recommended_players,
      game.playing_time,
      game.min_playtime,
      game.max_playtime,
      game.weight,
      game.categories,
      game.mechanics,
      game.is_expansion ? 1 : 0,
      game.last_updated
    );

    if (result.lastInsertRowid) {
      return result.lastInsertRowid as number;
    }

    const existing = this.db.prepare('SELECT id FROM games WHERE bgg_id = ?').get(game.bgg_id) as { id: number };
    return existing.id;
  }

  setOwnership(userId: number, gameBggIds: number[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM ownership WHERE user_id = ?');
    const insertStmt = this.db.prepare('INSERT OR IGNORE INTO ownership (user_id, game_bgg_id) VALUES (?, ?)');

    const transaction = this.db.transaction(() => {
      deleteStmt.run(userId);
      for (const gameBggId of gameBggIds) {
        insertStmt.run(userId, gameBggId);
      }
    });

    transaction();
  }

  getGamesByBggIds(bggIds: number[]): Game[] {
    if (bggIds.length === 0) return [];
    const placeholders = bggIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`SELECT * FROM games WHERE bgg_id IN (${placeholders})`);
    return stmt.all(...bggIds) as Game[];
  }

  getAllGames(includeExpansions: boolean = false): Game[] {
    const where = includeExpansions ? '' : 'WHERE is_expansion = 0';
    const stmt = this.db.prepare(`SELECT * FROM games ${where} ORDER BY name`);
    return stmt.all() as Game[];
  }

  getOwnedGames(includeExpansions: boolean = false): Array<Game & { owners: string[] }> {
    const where = includeExpansions ? '' : 'WHERE g.is_expansion = 0';
    const stmt = this.db.prepare(`
      SELECT 
        g.*,
        GROUP_CONCAT(u.bgg_username) as owner_list
      FROM games g
      INNER JOIN ownership o ON g.bgg_id = o.game_bgg_id
      INNER JOIN users u ON o.user_id = u.id
      ${where}
      GROUP BY g.id
      ORDER BY g.name
    `);

    const results = stmt.all() as Array<Game & { owner_list: string }>;
    return results.map(row => ({
      ...row,
      owners: row.owner_list ? row.owner_list.split(',') : []
    }));
  }

  setCacheTimestamp(bggUsername: string, timestamp: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_cache (bgg_username, last_fetched) VALUES (?, ?)
      ON CONFLICT(bgg_username) DO UPDATE SET last_fetched = excluded.last_fetched
    `);
    stmt.run(bggUsername, timestamp);
  }

  getCacheTimestamp(bggUsername: string): number | null {
    const stmt = this.db.prepare('SELECT last_fetched FROM user_cache WHERE bgg_username = ?');
    const result = stmt.get(bggUsername) as { last_fetched: number } | undefined;
    return result?.last_fetched ?? null;
  }

  close(): void {
    this.db.close();
  }
}

export async function createDatabase(dbPath: string): Promise<GameDatabase> {
  const dir = dirname(dbPath);
  await mkdir(dir, { recursive: true });
  return new GameDatabase(dbPath);
}
