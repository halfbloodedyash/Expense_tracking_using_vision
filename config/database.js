const path = require('path');

const config = {
    development: {
        type: 'sqlite',
        database: path.join(__dirname, '..', 'expenses_dev.db'),
        synchronize: true,
        logging: true
    },
    production: {
        type: 'sqlite',
        database: process.env.DATABASE_URL?.replace('sqlite:', '') || path.join(__dirname, '..', 'expenses.db'),
        synchronize: false,
        logging: false
    },
    test: {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false
    }
};

module.exports = config[process.env.NODE_ENV || 'development'];
