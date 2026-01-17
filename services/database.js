const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseService {
    constructor() {
        // Use DATABASE_URL for PostgreSQL connection
        const connectionString = process.env.DATABASE_URL;

        if (!connectionString) {
            logger.warn('DATABASE_URL not set, database features will not work');
            this.pool = null;
            return;
        }

        this.pool = new Pool({
            connectionString,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 10, // Maximum connections in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });

        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle client', err);
        });

        logger.info('PostgreSQL connection pool initialized');
    }

    async init() {
        if (!this.pool) return;

        const client = await this.pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    phone TEXT PRIMARY KEY,
                    name TEXT,
                    timezone TEXT DEFAULT 'UTC',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS expenses (
                    id SERIAL PRIMARY KEY,
                    user_phone TEXT NOT NULL REFERENCES users(phone),
                    amount DECIMAL(12,2) NOT NULL,
                    merchant TEXT,
                    description TEXT,
                    category TEXT NOT NULL,
                    items TEXT,
                    date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS budgets (
                    id SERIAL PRIMARY KEY,
                    user_phone TEXT NOT NULL REFERENCES users(phone),
                    category TEXT NOT NULL,
                    amount DECIMAL(12,2) NOT NULL,
                    period TEXT DEFAULT 'monthly',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_phone, category, period)
                );

                CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_phone, date);
                CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
            `);
            logger.info('Database tables initialized successfully');
        } catch (err) {
            logger.error('Database initialization error:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    async saveExpense(userPhone, expenseData) {
        if (!this.pool) throw new Error('Database not connected');

        const result = await this.pool.query(
            `INSERT INTO expenses (user_phone, amount, merchant, description, category, items, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
                userPhone,
                expenseData.amount,
                expenseData.merchant || '',
                expenseData.description || '',
                expenseData.category || 'other',
                JSON.stringify(expenseData.items || []),
                expenseData.date || new Date().toISOString().split('T')[0]
            ]
        );
        logger.info(`Expense saved with ID: ${result.rows[0].id}`);
        return result.rows[0].id;
    }

    async getTodayExpenses(userPhone) {
        if (!this.pool) return [];
        const today = new Date().toISOString().split('T')[0];
        const result = await this.pool.query(
            `SELECT * FROM expenses WHERE user_phone = $1 AND date = $2 ORDER BY created_at DESC`,
            [userPhone, today]
        );
        return result.rows;
    }

    async getTodayTotal(userPhone) {
        if (!this.pool) return 0;
        const today = new Date().toISOString().split('T')[0];
        const result = await this.pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_phone = $1 AND date = $2`,
            [userPhone, today]
        );
        return parseFloat(result.rows[0].total) || 0;
    }

    async getWeekExpenses(userPhone) {
        if (!this.pool) return [];
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const result = await this.pool.query(
            `SELECT * FROM expenses WHERE user_phone = $1 AND date >= $2 ORDER BY date DESC`,
            [userPhone, weekAgoStr]
        );
        return result.rows;
    }

    async getMonthExpenses(userPhone) {
        if (!this.pool) return [];
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const monthAgoStr = monthAgo.toISOString().split('T')[0];

        const result = await this.pool.query(
            `SELECT * FROM expenses WHERE user_phone = $1 AND date >= $2 ORDER BY date DESC`,
            [userPhone, monthAgoStr]
        );
        return result.rows;
    }

    async getTotalByCategory(userPhone, days = 30) {
        if (!this.pool) return [];
        const dateAgo = new Date();
        dateAgo.setDate(dateAgo.getDate() - days);
        const dateAgoStr = dateAgo.toISOString().split('T')[0];

        const result = await this.pool.query(
            `SELECT category, SUM(amount) as total, COUNT(*) as count 
             FROM expenses 
             WHERE user_phone = $1 AND date >= $2 
             GROUP BY category 
             ORDER BY total DESC`,
            [userPhone, dateAgoStr]
        );
        return result.rows;
    }

    async getUserStats(userPhone) {
        if (!this.pool) return {};
        const result = await this.pool.query(
            `SELECT COUNT(*) as total_expenses, COALESCE(SUM(amount), 0) as total_amount
             FROM expenses WHERE user_phone = $1`,
            [userPhone]
        );
        return result.rows[0] || {};
    }

    async createOrUpdateUser(phone, name = 'User') {
        if (!this.pool) return 0;
        const result = await this.pool.query(
            `INSERT INTO users (phone, name, last_active) 
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT(phone) DO UPDATE SET last_active = CURRENT_TIMESTAMP
             RETURNING phone`,
            [phone, name]
        );
        return result.rowCount;
    }

    async updateLastActive(phone) {
        if (!this.pool) return 0;
        const result = await this.pool.query(
            `UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE phone = $1`,
            [phone]
        );
        return result.rowCount;
    }

    async getUser(phone) {
        if (!this.pool) return null;
        const result = await this.pool.query(
            `SELECT * FROM users WHERE phone = $1`,
            [phone]
        );
        return result.rows[0];
    }

    async updateExpense(id, userPhone, changes) {
        if (!this.pool) return 0;

        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(changes).forEach(([key, value]) => {
            if (['amount', 'category', 'description', 'merchant'].includes(key)) {
                fields.push(`${key} = $${paramIndex++}`);
                values.push(value);
            }
        });

        if (fields.length === 0) return 0;

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id, userPhone);

        const sql = `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND user_phone = $${paramIndex}`;

        const result = await this.pool.query(sql, values);
        return result.rowCount;
    }

    async deleteExpense(id, userPhone) {
        if (!this.pool) return 0;
        const result = await this.pool.query(
            `DELETE FROM expenses WHERE id = $1 AND user_phone = $2`,
            [id, userPhone]
        );
        return result.rowCount;
    }

    async searchExpenses(userPhone, query) {
        if (!this.pool) return [];
        const searchTerm = `%${query}%`;
        const result = await this.pool.query(
            `SELECT * FROM expenses 
             WHERE user_phone = $1 
             AND (description ILIKE $2 OR merchant ILIKE $3 OR category ILIKE $4) 
             ORDER BY date DESC LIMIT 20`,
            [userPhone, searchTerm, searchTerm, searchTerm]
        );
        return result.rows;
    }

    async getLastExpense(userPhone) {
        if (!this.pool) return null;
        const result = await this.pool.query(
            `SELECT * FROM expenses WHERE user_phone = $1 ORDER BY created_at DESC LIMIT 1`,
            [userPhone]
        );
        return result.rows[0];
    }

    async setBudget(userPhone, category, amount, period = 'monthly') {
        if (!this.pool) return 0;
        const result = await this.pool.query(
            `INSERT INTO budgets (user_phone, category, amount, period) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT(user_phone, category, period) DO UPDATE SET 
                 amount = EXCLUDED.amount,
                 created_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [userPhone, category, amount, period]
        );
        return result.rows[0]?.id || 0;
    }

    async getBudgets(userPhone) {
        if (!this.pool) return [];
        const result = await this.pool.query(
            `SELECT * FROM budgets WHERE user_phone = $1 ORDER BY amount DESC`,
            [userPhone]
        );
        return result.rows;
    }

    async getBudgetStatus(userPhone, period = 'month') {
        if (!this.pool) return [];
        const startDate = period === 'month'
            ? new Date().toISOString().substring(0, 7) + '-01'
            : new Date().toISOString().split('T')[0];

        const result = await this.pool.query(
            `SELECT 
                b.category,
                b.amount as budget_limit,
                COALESCE(SUM(e.amount), 0) as spent
             FROM budgets b
             LEFT JOIN expenses e ON 
                 b.category = e.category 
                 AND e.user_phone = b.user_phone
                 AND e.date >= $1
             WHERE b.user_phone = $2
             GROUP BY b.category, b.amount`,
            [startDate, userPhone]
        );
        return result.rows;
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('Database connection pool closed');
        }
    }
}

// Export singleton
const databaseService = new DatabaseService();

// Initialize tables on startup
if (databaseService.pool) {
    databaseService.init().catch(err => {
        logger.error('Failed to initialize database tables:', err);
    });
}

module.exports = databaseService;
