const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;

// ===== DATABASE SETUP =====
const db = new Database(path.join(__dirname, 'highscores.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    score     INTEGER NOT NULL,
    created_at TEXT   NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

const getTopScores = db.prepare(`
  SELECT
    ROW_NUMBER() OVER (ORDER BY score DESC, created_at ASC) AS rank,
    name,
    score,
    strftime('%d.%m.%Y', created_at) AS date
  FROM scores
  WHERE created_at >= datetime('now', '-7 days', 'localtime')
  ORDER BY score DESC, created_at ASC
  LIMIT 10
`);

const insertScore = db.prepare(`
  INSERT INTO scores (name, score) VALUES (?, ?)
`);

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static(__dirname)); // serves index.html, game.js, style.css, etc.

// ===== API =====
app.get('/api/scores', (req, res) => {
  try {
    const rows = getTopScores.all();
    res.json(rows);
  } catch (err) {
    console.error('GET /api/scores error:', err);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.post('/api/scores', (req, res) => {
  const { name, score } = req.body;
  if (!name || typeof score !== 'number') {
    return res.status(400).json({ error: 'name und score erforderlich' });
  }
  const safeName = String(name).trim().slice(0, 32) || 'Unbekannt';
  const safeScore = Math.round(Number(score));
  try {
    insertScore.run(safeName, safeScore);
    const rows = getTopScores.all();
    res.json(rows);
  } catch (err) {
    console.error('POST /api/scores error:', err);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`🐼 Panda Fliegt läuft auf http://localhost:${PORT}`);
});
