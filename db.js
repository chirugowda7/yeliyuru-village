/**
 * =============================================================================
 * YELIYURU VILLAGE PORTAL - SQLITE DATABASE ENGINE
 * Powered by Node.js built-in node:sqlite (zero external dependencies)
 * Database File: yeliyuru.db
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'yeliyuru.db');
let db = null;

// Helpers to safely convert objects/strings for SQLite binding
function s(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.en === 'string') return val.en;
    if (typeof val.kn === 'string') return val.kn;
    return JSON.stringify(val);
  }
  return String(val);
}

function sKn(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (typeof val.kn === 'string') return val.kn;
    if (typeof val.en === 'string') return val.en;
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Initialize or connect to SQLite database
 */
function getDatabase() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
    } catch (e) {
      console.warn('PRAGMA notice:', e.message);
    }
    initTables();
  }
  return db;
}

/**
 * Create relational tables
 */
function initTables() {
  const database = db;

  database.exec(`
    -- 1. Village Core Settings & Metadata
    CREATE TABLE IF NOT EXISTS village_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Photos Gallery Table
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_en TEXT NOT NULL,
      title_kn TEXT NOT NULL,
      caption_en TEXT,
      caption_kn TEXT,
      category TEXT DEFAULT 'general',
      url TEXT NOT NULL,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Temples Table
    CREATE TABLE IF NOT EXISTS temples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      deity_en TEXT,
      deity_kn TEXT,
      timing TEXT,
      speciality_en TEXT,
      speciality_kn TEXT,
      description_en TEXT,
      description_kn TEXT,
      image_url TEXT,
      sort_order INTEGER DEFAULT 0
    );

    -- 4. Festivals Table
    CREATE TABLE IF NOT EXISTS festivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      date TEXT NOT NULL,
      month TEXT,
      description_en TEXT,
      description_kn TEXT,
      icon TEXT DEFAULT 'flame',
      sort_order INTEGER DEFAULT 0
    );

    -- 5. Crops, Dairy & Sericulture Table
    CREATE TABLE IF NOT EXISTS crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      category TEXT,
      annual_yield TEXT,
      season TEXT,
      irrigation TEXT,
      description_en TEXT,
      description_kn TEXT,
      image_url TEXT
    );

    -- 6. Emergency & Civic Contacts Table
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en TEXT NOT NULL,
      name_kn TEXT NOT NULL,
      role_en TEXT,
      role_kn TEXT,
      category TEXT,
      phone TEXT NOT NULL,
      email TEXT,
      address_en TEXT,
      address_kn TEXT
    );

    -- 7. Public Notices & Announcements Table
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_en TEXT NOT NULL,
      title_kn TEXT NOT NULL,
      date TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      priority TEXT DEFAULT 'Normal',
      body_en TEXT,
      body_kn TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. Citizen Messages / Inquiries (Contact Form Submissions)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      subject TEXT DEFAULT 'General Inquiry',
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Complete JSON Snapshot Table (for instant full-tree sync & backups)
    CREATE TABLE IF NOT EXISTS data_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_json TEXT NOT NULL,
      source TEXT DEFAULT 'admin_sync',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Load default dataset from data.js
 */
function loadDefaultDataFromDisk() {
  const dataJsPath = path.join(__dirname, 'data.js');
  if (!fs.existsSync(dataJsPath)) return null;
  const code = fs.readFileSync(dataJsPath, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + '\n; this.VILLAGE_DATA = VILLAGE_DATA;', ctx);
  return ctx.VILLAGE_DATA || null;
}

/**
 * Seed database from data.js if empty
 */
function seedDatabaseIfEmpty() {
  const database = getDatabase();
  const snapshotCount = database.prepare('SELECT COUNT(*) as count FROM data_snapshots').get().count;

  if (snapshotCount === 0) {
    const defaultData = loadDefaultDataFromDisk();
    if (!defaultData) return;

    console.log('Seeding SQLite database with default village records...');

    // 1. Insert snapshot
    saveSnapshot(defaultData, 'initial_seed');

    // 2. Insert metadata
    const insertMeta = database.prepare('INSERT OR REPLACE INTO village_meta (key, value) VALUES (?, ?)');
    insertMeta.run('name', JSON.stringify(defaultData.name || {}));
    insertMeta.run('subtitle', JSON.stringify(defaultData.subtitle || {}));
    insertMeta.run('shortSub', JSON.stringify(defaultData.shortSub || {}));
    insertMeta.run('tagline', JSON.stringify(defaultData.tagline || {}));
    insertMeta.run('creator', JSON.stringify(defaultData.creator || { en: 'Chirugowda Yeliyuru', kn: 'ಚಿರು ಗೌಡ ಯೆಲಿಯೂರು', whatsappNumber: '+91 98765 43210' }));
    insertMeta.run('banner', JSON.stringify(defaultData.banner || {}));

    // 3. Insert temples
    if (Array.isArray(defaultData.temples)) {
      const insertTemple = database.prepare(`
        INSERT INTO temples (name_en, name_kn, deity_en, deity_kn, timing, speciality_en, speciality_kn, description_en, description_kn, image_url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      defaultData.temples.forEach((t, i) => {
        insertTemple.run(
          s(t.name), sKn(t.name),
          s(t.deity), sKn(t.deity),
          s(t.timing),
          s(t.speciality), sKn(t.speciality),
          s(t.description), sKn(t.description),
          s(t.image),
          i
        );
      });
    }

    // 4. Insert festivals
    if (Array.isArray(defaultData.festivals)) {
      const insertFest = database.prepare(`
        INSERT INTO festivals (name_en, name_kn, date, month, description_en, description_kn, icon, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      defaultData.festivals.forEach((f, i) => {
        insertFest.run(
          s(f.name), sKn(f.name),
          s(f.date),
          s(f.month),
          s(f.description), sKn(f.description),
          s(f.icon) || 'flame',
          i
        );
      });
    }

    // 5. Insert crops
    if (Array.isArray(defaultData.crops)) {
      const insertCrop = database.prepare(`
        INSERT INTO crops (name_en, name_kn, category, annual_yield, season, irrigation, description_en, description_kn, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      defaultData.crops.forEach(c => {
        insertCrop.run(
          s(c.name), sKn(c.name),
          s(c.type || c.category),
          s(c.acreage || c.annualYield),
          s(c.season),
          s(c.irrigation),
          s(c.description), sKn(c.description),
          s(c.image || '')
        );
      });
    }

    // 6. Insert notices
    if (Array.isArray(defaultData.notices)) {
      const insertNotice = database.prepare(`
        INSERT INTO notices (title_en, title_kn, date, category, priority, body_en, body_kn, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      defaultData.notices.forEach(n => {
        insertNotice.run(
          s(n.title), sKn(n.title),
          s(n.date),
          s(n.category) || 'General',
          s(n.priority) || 'Normal',
          s(n.body), sKn(n.body)
        );
      });
    }

    // 7. Insert contacts
    if (Array.isArray(defaultData.contacts)) {
      const insertContact = database.prepare(`
        INSERT INTO contacts (name_en, name_kn, role_en, role_kn, category, phone, email, address_en, address_kn)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      defaultData.contacts.forEach(c => {
        insertContact.run(
          s(c.name), sKn(c.name),
          s(c.role), sKn(c.role),
          s(c.category),
          s(c.phone),
          s(c.email),
          s(c.address), sKn(c.address)
        );
      });
    }

    // 8. Insert photos
    if (Array.isArray(defaultData.photos)) {
      const insertPhoto = database.prepare(`
        INSERT INTO photos (title_en, title_kn, caption_en, caption_kn, category, url, is_featured)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      defaultData.photos.forEach(p => {
        insertPhoto.run(
          s(p.title), sKn(p.title),
          s(p.caption), sKn(p.caption),
          s(p.category) || 'general',
          s(p.url),
          p.featured ? 1 : 0
        );
      });
    }

    console.log('Database seeded successfully from data.js.');
  }
}

/**
 * Save complete dataset snapshot
 */
function saveSnapshot(data, source = 'admin') {
  const database = getDatabase();
  const insert = database.prepare('INSERT INTO data_snapshots (data_json, source) VALUES (?, ?)');
  insert.run(JSON.stringify(data), source);

  // Keep latest 20 snapshots
  try {
    database.exec(`
      DELETE FROM data_snapshots 
      WHERE id NOT IN (SELECT id FROM data_snapshots ORDER BY id DESC LIMIT 20);
    `);
  } catch (e) {
    // ignore
  }
}

/**
 * Retrieve current active village dataset
 */
function getActiveVillageData() {
  const database = getDatabase();
  const latestSnapshot = database.prepare('SELECT data_json FROM data_snapshots ORDER BY id DESC LIMIT 1').get();

  if (latestSnapshot && latestSnapshot.data_json) {
    try {
      return JSON.parse(latestSnapshot.data_json);
    } catch (e) {
      console.warn('Error parsing latest snapshot from DB:', e);
    }
  }

  return loadDefaultDataFromDisk();
}

/**
 * Save updated dataset from admin
 */
function updateVillageData(newData) {
  if (!newData || typeof newData !== 'object') {
    throw new Error('Invalid dataset provided');
  }
  newData.lastUpdated = Date.now();
  saveSnapshot(newData, 'admin_update');

  // Auto-sync to data.js on disk so git and static files reflect changes
  try {
    const dataJsPath = path.join(__dirname, 'data.js');
    const content = `/**
 * Yeliyuru Village Comprehensive Dataset
 * Auto-synced from Admin Panel & SQLite Database
 */

const VILLAGE_DATA = ${JSON.stringify(newData, null, 2)};

if (typeof window !== 'undefined') {
  window.VILLAGE_DATA = VILLAGE_DATA;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VILLAGE_DATA;
}
`;
    fs.writeFileSync(dataJsPath, content, 'utf8');
  } catch (fsErr) {
    console.warn('Could not sync to data.js on disk:', fsErr.message);
  }

  // Also write a clean data.json for reliable mobile sync (no regex needed)
  try {
    const dataJsonPath = path.join(__dirname, 'data.json');
    fs.writeFileSync(dataJsonPath, JSON.stringify(newData), 'utf8');
  } catch (jsonErr) {
    console.warn('Could not sync to data.json on disk:', jsonErr.message);
  }

  return { success: true, timestamp: new Date().toISOString() };
}

/**
 * Save citizen message / contact inquiry
 */
function saveMessage({ name, contact, subject, message }) {
  const database = getDatabase();
  const insert = database.prepare(`
    INSERT INTO messages (name, contact, subject, message)
    VALUES (?, ?, ?, ?)
  `);
  const result = insert.run(
    String(name || '').trim(),
    String(contact || '').trim(),
    String(subject || 'General Inquiry').trim(),
    String(message || '').trim()
  );
  return { id: Number(result.lastInsertRowid), success: true };
}

/**
 * Retrieve citizen messages
 */
function getMessages() {
  const database = getDatabase();
  return database.prepare('SELECT * FROM messages ORDER BY id DESC').all();
}

/**
 * Mark message as read
 */
function markMessageRead(id) {
  const database = getDatabase();
  const update = database.prepare('UPDATE messages SET is_read = 1 WHERE id = ?');
  update.run(Number(id));
  return { success: true };
}

/**
 * Get database statistics
 */
function getDatabaseStats() {
  const database = getDatabase();
  const tables = ['temples', 'festivals', 'crops', 'photos', 'contacts', 'notices', 'messages', 'data_snapshots'];
  const counts = {};
  for (const table of tables) {
    try {
      const row = database.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      counts[table] = row.count;
    } catch (e) {
      counts[table] = 0;
    }
  }

  const stat = fs.statSync(DB_PATH);
  return {
    engine: 'SQLite (node:sqlite)',
    databaseFile: 'yeliyuru.db',
    sizeBytes: stat.size,
    sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
    counts
  };
}

// Initialize on module load
getDatabase();
seedDatabaseIfEmpty();

module.exports = {
  getDatabase,
  getActiveVillageData,
  updateVillageData,
  saveMessage,
  getMessages,
  markMessageRead,
  getDatabaseStats,
  loadDefaultDataFromDisk
};
