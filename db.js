import Database from "better-sqlite3";

const db = new Database("bot.db");

export const PostType = {
  LFG: 0,
  LIST: 1,
  POLL: 2,
};

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
    title TEXT UNIQUE NOT NULL,
    url TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Post localization table (to keep track of all posts related to a game)
db.prepare(`
  CREATE TABLE IF NOT EXISTS post_loc (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    post_id TEXT NOT NULL,
    post_type INTEGER NOT NULL,
    channel_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
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
    );
`).run();

// Poll table (many-to-many)
db.prepare(`
  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (creator_id) REFERENCES players(id)
    );
`).run();

// Timeslots table (many-to-many)
db.prepare(`
  CREATE TABLE IF NOT EXISTS poll_timeslots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poll_id) REFERENCES polls(id)
    );
`).run();

// Poll votes table (many-to-many)
db.prepare(`
  CREATE TABLE IF NOT EXISTS poll_votes (
    timeslot_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    vote INTEGER NOT NULL, -- 1=yes, 0=maybe, -1=no
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (timeslot_id, player_id),
    FOREIGN KEY (timeslot_id) REFERENCES timeslots(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
    );
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

// Register player
export function registerPlayer(userId, username) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO players (user_id, username) VALUES (?, ?)
  `);
  stmt.run(userId, username);
}

// Get all games and votes with interested vs not interested
export function getListedVotes() {
  const stmt = db.prepare(`
    SELECT 
      g.id AS game_id,
      g.title,
      g.url,
      COUNT(v.vote) AS total_votes,
      SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END) AS interested_votes,
      SUM(CASE WHEN v.vote = 0 THEN 1 ELSE 0 END) AS not_interested_votes
    FROM games g
    LEFT JOIN votes v ON g.id = v.game_id
    GROUP BY g.id
    ORDER BY interested_votes DESC
  `);

  return stmt.all();
}

// Add a new poll
export function addPoll(gameId, creatorId, description = null) {
  const stmt = db.prepare(`
    INSERT INTO polls (game_id, creator_id, description)
    VALUES (?, ?, ?)
  `);
  const info = stmt.run(gameId, creatorId, description);
  return info.lastInsertRowid; // return the poll id
}

// Add a time slot to a poll
export function addTimeSlot(pollId, startTime, endTime) {
  const stmt = db.prepare(`
    INSERT INTO timeslots (poll_id, time_from, time_to)
    VALUES (?, ?, ?)
  `);
  const info = stmt.run(pollId, startTime, endTime);
  return info.lastInsertRowid; // return the timeslot id
}

// Save or update a user's vote for a specific timeslot
export function setPollVote(timeslotId, playerId, vote) {
  const stmt = db.prepare(`
    INSERT INTO poll_votes (timeslot_id, player_id, vote)
    VALUES (?, ?, ?)
    ON CONFLICT(timeslot_id, player_id) DO UPDATE SET vote=excluded.vote, created_at=CURRENT_TIMESTAMP
  `);
  stmt.run(timeslotId, playerId, vote); 
}

// Add game
export function addGame(title, url) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO games (title, url) VALUES (?, ?)
  `);
  stmt.run(title, url);
}

// Add post (discord message)
export function addPost(game_id, post_id, channel_id, post_type) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO post_loc (game_id, post_id, channel_id, post_type) VALUES (?, ?, ?, ?)
  `);
  stmt.run(game_id, post_id, channel_id, post_type);
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

// Get a game by ID from its title
export function getGameIdFromTitle(title) {
  const stmt = db.prepare(`
    SELECT id
    FROM games g
    WHERE g.title = ?
  `);
  return stmt.get(title).id;
}

// Get posts from gameId
export function getPostsFromGameId(gameId, postType) {
  const stmt = db.prepare(`
    SELECT *
    FROM post_loc pl
    WHERE pl.game_id = ?
    AND pl.post_type = ?
  `);
  return stmt.all(gameId, postType);
}

// Get user_id from player_id
export function getUserIdFromPlayerId(playerId) {
  const stmt = db.prepare(`
    SELECT *
    FROM players p
    WHERE p.id = ?
  `);
  return stmt.get(playerId).user_id;
}

// Get user_id from player_id
export function getPlayerIdFromUserId(userId) {
  const stmt = db.prepare(`
    SELECT *
    FROM players p
    WHERE p.user_id = ?
  `);
  return stmt.get(userId).id;
}

// Get a game by ID from its PostId
export function getGameIdFromPostId(postId, postType) {
  const stmt = db.prepare(`
    SELECT game_id
    FROM post_loc pl
    WHERE pl.post_id = ?
    AND pl.post_type = ?
  `);
  return stmt.get(postId, postType).game_id;
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