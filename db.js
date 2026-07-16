const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',           // Default username
    host: 'localhost',          // Local machine
    database: 'postgres',      // Your DB name
    password: 'saicharan@2',  // Only password needed
    port: 5432,                 // Default PostgreSQL port
});

module.exports = pool;
