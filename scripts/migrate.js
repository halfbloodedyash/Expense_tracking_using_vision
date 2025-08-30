require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

async function runMigrations() {
    console.log('🔄 Running database migrations...\n');
    
    const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || './expenses.db';
    const db = new sqlite3.Database(dbPath);
    
    const migrations = [
        {
            name: 'add_user_preferences',
            sql: `
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_phone TEXT PRIMARY KEY,
                    currency TEXT DEFAULT 'USD',
                    timezone TEXT DEFAULT 'UTC',
                    notifications_enabled BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_phone) REFERENCES users (phone)
                );
            `
        },
        {
            name: 'add_expense_tags',
            sql: `
                ALTER TABLE expenses ADD COLUMN tags TEXT;
            `
        },
        {
            name: 'add_expense_location',
            sql: `
                ALTER TABLE expenses ADD COLUMN location TEXT;
                ALTER TABLE expenses ADD COLUMN latitude REAL;
                ALTER TABLE expenses ADD COLUMN longitude REAL;
            `
        }
    ];

    for (const migration of migrations) {
        try {
            console.log(`Running migration: ${migration.name}...`);
            
            await new Promise((resolve, reject) => {
                db.exec(migration.sql, (err) => {
                    if (err) {
                        // Ignore "duplicate column name" errors for ALTER TABLE
                        if (err.message.includes('duplicate column name')) {
                            console.log(`⚠️ Migration ${migration.name} already applied`);
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        console.log(`✅ Migration ${migration.name} completed`);
                        resolve();
                    }
                });
            });
            
        } catch (error) {
            logger.error(`Migration ${migration.name} failed:`, error);
            console.error(`❌ Migration ${migration.name} failed:`, error.message);
        }
    }
    
    db.close();
    console.log('\n🏁 All migrations completed!');
}

runMigrations();
