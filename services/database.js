const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

class DatabaseService {
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

            CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_phone, date);
            CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
        `;

        this.db.exec(createTables, (err) => {
            if (err) {
                logger.error('Database initialization error:', err);
            } else {
                logger.info('Database initialized successfully');
            }
        });
    }

    async saveExpense(userPhone, expenseData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO expenses (user_phone, amount, merchant, description, category, items, date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                userPhone,
                expenseData.amount,
                expenseData.merchant || '',
                expenseData.description || '',
                expenseData.category || 'other',
                JSON.stringify(expenseData.items || []),
                expenseData.date || new Date().toISOString().split('T')[0]
            ], function(err) {
                if (err) {
                    logger.error('Error saving expense:', err);
                    reject(err);
                } else {
                    logger.info(`Expense saved with ID: ${this.lastID}`);
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async getTodayExpenses(userPhone) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            this.db.all(
                `SELECT * FROM expenses WHERE user_phone = ? AND date = ? ORDER BY created_at DESC`,
                [userPhone, today],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getTodayTotal(userPhone) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            this.db.get(
                `SELECT SUM(amount) as total FROM expenses WHERE user_phone = ? AND date = ?`,
                [userPhone, today],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.total || 0);
                }
            );
        });
    }

    async getWeekExpenses(userPhone) {
        return new Promise((resolve, reject) => {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekAgoStr = weekAgo.toISOString().split('T')[0];
            
            this.db.all(
                `SELECT * FROM expenses WHERE user_phone = ? AND date >= ? ORDER BY date DESC`,
                [userPhone, weekAgoStr],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getMonthExpenses(userPhone) {
        return new Promise((resolve, reject) => {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            const monthAgoStr = monthAgo.toISOString().split('T')[0];
            
            this.db.all(
                `SELECT * FROM expenses WHERE user_phone = ? AND date >= ? ORDER BY date DESC`,
                [userPhone, monthAgoStr],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getTotalByCategory(userPhone, days = 30) {
        return new Promise((resolve, reject) => {
            const dateAgo = new Date();
            dateAgo.setDate(dateAgo.getDate() - days);
            const dateAgoStr = dateAgo.toISOString().split('T')[0];
            
            this.db.all(
                `SELECT category, SUM(amount) as total, COUNT(*) as count 
                 FROM expenses 
                 WHERE user_phone = ? AND date >= ? 
                 GROUP BY category 
                 ORDER BY total DESC`,
                [userPhone, dateAgoStr],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getUserStats(userPhone) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            const thisMonth = new Date().toISOString().substring(0, 7) + '-01';
            
            this.db.get(`
                SELECT 
                    COUNT(*) as total_expenses,
                    SUM(amount) as total_amount
                FROM expenses WHERE user_phone = ?
            `, [userPhone], (err, row) => {
                if (err) reject(err);
                else resolve(row || {});
            });
        });
    }
}

module.exports = new DatabaseService();
