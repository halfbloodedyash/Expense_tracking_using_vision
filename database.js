const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./utils/logger');

class Database {
    constructor() {
        const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || './expenses.db';
        this.db = new sqlite3.Database(dbPath);
        this.init();
    }

    init() {
        const createTables = `
            CREATE TABLE IF NOT EXISTS users (
                phone TEXT PRIMARY KEY,
                name TEXT,
                timezone TEXT DEFAULT 'UTC',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_phone TEXT NOT NULL,
                amount REAL NOT NULL,
                merchant TEXT,
                description TEXT,
                category TEXT NOT NULL,
                items TEXT,
                date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_phone) REFERENCES users (phone)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                emoji TEXT,
                color TEXT
            );

            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_phone TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                period TEXT DEFAULT 'monthly',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_phone) REFERENCES users (phone)
            );

            CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_phone, date);
            CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
            CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
        `;

        this.db.exec(createTables, (err) => {
            if (err) {
                logger.error('Database initialization error:', err);
            } else {
                logger.info('Database initialized successfully');
                this.seedDefaultCategories();
            }
        });
    }

    seedDefaultCategories() {
        const categories = [
            { name: 'food', emoji: '🍔', color: '#FF6B6B' },
            { name: 'transport', emoji: '🚗', color: '#4ECDC4' },
            { name: 'shopping', emoji: '🛒', color: '#45B7D1' },
            { name: 'entertainment', emoji: '🎬', color: '#96CEB4' },
            { name: 'healthcare', emoji: '🏥', color: '#FFEAA7' },
            { name: 'utilities', emoji: '⚡', color: '#DDA0DD' },
            { name: 'other', emoji: '📦', color: '#95A5A6' }
        ];

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO categories (name, emoji, color) VALUES (?, ?, ?)
        `);

        categories.forEach(cat => {
            stmt.run([cat.name, cat.emoji, cat.color]);
        });

        stmt.finalize();
    }

    // Add all your database methods here...
}

module.exports = new Database();
