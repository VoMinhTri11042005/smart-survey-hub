import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Create a connection pool using the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ensure SSL is required for cloud hosted PostgreSQL (Render, Neon, Supabase)
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

export const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ WARNING: DATABASE_URL is not set. Database will fail.');
    return;
  }

  try {
    const client = await pool.connect();
    
    // Create surveys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS surveys (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        questions JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'draft'
      );
    `);
    
    // Create responses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id VARCHAR(255) PRIMARY KEY,
        survey_id VARCHAR(255) REFERENCES surveys(id) ON DELETE CASCADE,
        answers JSONB NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create teams table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'viewer',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    client.release();
    console.log('✅ PostgreSQL Database connected and tables initialized.');
  } catch (err) {
    console.error('❌ Error connecting to PostgreSQL:', err);
  }
};

export default pool;
