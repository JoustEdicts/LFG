import Database from "better-sqlite3";

const db = new Database("bot.db");

// Players table
db.prepare(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,  -- Discord user id
    username TEXT NOT NULL
  )
`).run();

// Games table
db.prepare(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT UNIQUE NOT NULL,
    title TEXT UNIQUE NOT NULL,
    url TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Votes table (many-to-many)
db.prepare(`
  CREATE TABLE IF NOT EXISTS votes (
    vote INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, game_id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (game_id) REFERENCES games(id)
  )
`).run();

// Sessions table
db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        time_from DATETIME NOT NULL,
        time_to DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id)
    );
`).run();

// Session Players table (many-to-many)
db.prepare(`
    CREATE TABLE IF NOT EXISTS session_players (
        session_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, player_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
    );
`).run();

// === Commands ===

// Register player
export function registerPlayer(userId, username) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO players (user_id, username) VALUES (?, ?)
  `);
  stmt.run(userId, username);
}

// Add game
export function addGame(title, postId, url) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO games (title, post_id, url) VALUES (?, ?, ?)
  `);
  stmt.run(title, postId, url);
}

// Count votes for a game
export function getGameTitle(title) {
  const stmt = db.prepare(`
    SELECT title
    FROM games g
    WHERE g.title = ?
  `);
  
  const row = stmt.get(title);
  return row ? row.title : null;  // safely handle missing rows
}

// Count votes for a game
export function getGameIdFromPostId(postId) {
  const stmt = db.prepare(`
    SELECT id
    FROM games g
    WHERE g.post_id = ?
  `);
  return stmt.get(postId).id;
}

// Record vote
export function voteForGame(userId, gameId, playerVote) {
  const player = db.prepare("SELECT * FROM players WHERE user_id = ?").get(userId);
  if (!player) throw new Error("Player not registered");

  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
  if (!game) throw new Error("Game not found");

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO votes (vote, player_id, game_id) VALUES (?, ?, ?)
  `);
  stmt.run(playerVote, player.id, game.id);
}

// Count votes for a game
export function getGameVoteCount(gameTitle) {
  const stmt = db.prepare(`
    SELECT COUNT(*) AS votes 
    FROM votes v
    JOIN games g ON g.id = v.game_id
    WHERE g.title = ?
  `);
  return stmt.get(gameTitle).votes;
}

// Get all votes for a game
export function getGameVotes(gameId) {
  const stmt = db.prepare(`
    SELECT * 
    FROM votes v
    WHERE v.game_id = ?
  `);
  return stmt.all(gameId);
}

// --- Create a new session ---
export function createSession(gameTitle, timeFrom, timeTo) {
  // Find the game
  const game = db.prepare("SELECT * FROM games WHERE title = ?").get(gameTitle);
  if (!game) throw new Error(`Game "${gameTitle}" not found`);

  // Insert session
  const stmt = db.prepare(`
    INSERT INTO sessions (game_id, time_from, time_to)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(game.id, timeFrom, timeTo);

  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(result.lastInsertRowid);
}

// --- Get all sessions (with game info) ---
export function getAllSessions() {
  return db.prepare(`
    SELECT s.id, g.title AS game, s.time_from, s.time_to, s.created_at
    FROM sessions s
    JOIN games g ON g.id = s.game_id
    ORDER BY s.time_from ASC
  `).all();
}

// --- Add player to a session ---
export function addPlayerToSession(sessionId, userId) {
  const player = db.prepare("SELECT * FROM players WHERE user_id = ?").get(userId);
  if (!player) throw new Error("Player not registered");

  db.prepare(`
    INSERT OR IGNORE INTO session_players (session_id, player_id)
    VALUES (?, ?)
  `).run(sessionId, player.id);

  return db.prepare(`
    SELECT p.username, sp.joined_at
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    WHERE sp.session_id = ? AND sp.player_id = ?
  `).get(sessionId, player.id);
}

// --- Get all players in a session ---
export function getPlayersInSession(sessionId) {
  return db.prepare(`
    SELECT p.username, sp.joined_at
    FROM session_players sp
    JOIN players p ON p.id = sp.player_id
    WHERE sp.session_id = ?
  `).all(sessionId);
}