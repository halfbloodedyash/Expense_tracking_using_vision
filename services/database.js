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
            ], function (err) {
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

    async createOrUpdateUser(phone, name = 'User') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO users (phone, name, last_active) 
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(phone) DO UPDATE SET 
                    last_active = CURRENT_TIMESTAMP
            `);

            stmt.run([phone, name], function (err) {
                if (err) {
                    logger.error('Error creating/updating user:', err);
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            stmt.finalize();
        });
    }

    async updateLastActive(phone) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE phone = ?`,
                [phone],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async getUser(phone) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM users WHERE phone = ?`,
                [phone],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateExpense(id, userPhone, changes) {
        return new Promise((resolve, reject) => {
            // Build dynamic query
            const fields = [];
            const values = [];

            Object.entries(changes).forEach(([key, value]) => {
                if (['amount', 'category', 'description', 'merchant'].includes(key)) {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            });

            if (fields.length === 0) {
                resolve(0);
                return;
            }

            fields.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id, userPhone); // For WHERE clause

            const sql = `UPDATE expenses SET ${fields.join(', ')} WHERE id = ? AND user_phone = ?`;

            this.db.run(sql, values, function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    async deleteExpense(id, userPhone) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM expenses WHERE id = ? AND user_phone = ?`,
                [id, userPhone],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async searchExpenses(userPhone, query) {
        return new Promise((resolve, reject) => {
            const searchTerm = `%${query}%`;
            this.db.all(
                `SELECT * FROM expenses 
                 WHERE user_phone = ? 
                 AND (description LIKE ? OR merchant LIKE ? OR category LIKE ?) 
                 ORDER BY date DESC LIMIT 20`,
                [userPhone, searchTerm, searchTerm, searchTerm],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getLastExpense(userPhone) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM expenses WHERE user_phone = ? ORDER BY created_at DESC LIMIT 1`,
                [userPhone],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async setBudget(userPhone, category, amount, period = 'monthly') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO budgets (user_phone, category, amount, period) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET 
                    amount = excluded.amount,
                    created_at = CURRENT_TIMESTAMP
            `);

            // Note: The schema doesn't have a unique constraint on (user_phone, category) yet.
            // We should ideally check if one exists or add a unique constraint.
            // For now, let's delete existing for this category/period before inserting to simulate upsert

            this.db.run(`DELETE FROM budgets WHERE user_phone = ? AND category = ? AND period = ?`,
                [userPhone, category, period],
                (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    this.db.run(`INSERT INTO budgets (user_phone, category, amount, period) VALUES (?, ?, ?, ?)`,
                        [userPhone, category, amount, period],
                        function (err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                }
            );
        });
    }

    async getBudgets(userPhone) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM budgets WHERE user_phone = ? ORDER BY amount DESC`,
                [userPhone],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getBudgetStatus(userPhone, period = 'month') {
        // Complex query to compare actual spending vs budget
        return new Promise((resolve, reject) => {
            const startDate = period === 'month'
                ? new Date().toISOString().substring(0, 7) + '-01'
                : new Date().toISOString().split('T')[0]; // simple logic for now

            // This query joins budgets definitions with aggregated expenses
            const query = `
                SELECT 
                    b.category,
                    b.amount as budget_limit,
                    COALESCE(SUM(e.amount), 0) as spent
                FROM budgets b
                LEFT JOIN expenses e ON 
                    b.category = e.category 
                    AND e.user_phone = b.user_phone
                    AND e.date >= ?
                WHERE b.user_phone = ?
                GROUP BY b.category
            `;

            this.db.all(query, [startDate, userPhone], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    logger.error('Error closing database:', err);
                    reject(err);
                } else {
                    logger.info('Database connection closed');
                    resolve();
                }
            });
        });
    }
}

module.exports = new DatabaseService();
