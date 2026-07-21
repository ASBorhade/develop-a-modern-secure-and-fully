require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
(async () => { try { await pool.query(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8')); console.log('Database schema applied.'); } finally { await pool.end(); } })().catch(error => { console.error(error.message); process.exit(1); });
