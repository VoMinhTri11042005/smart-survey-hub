import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Create a connection pool using the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ensure SSL is required for cloud hosted PostgreSQL (Render, Neon, Supabase)
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Catch unhandled errors on idle clients to prevent the app from crashing
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
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
        is_quiz BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'draft'
      );
    `);
    
    // Create responses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id VARCHAR(255) PRIMARY KEY,
        survey_id VARCHAR(255) REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id VARCHAR(255),
        answers JSONB NOT NULL,
        score INT,
        total_quiz_questions INT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (survey_id, respondent_id)
      );
    `);

    // In case table already exists without respondent_id or quiz columns
    try {
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS is_quiz BOOLEAN DEFAULT FALSE;`);
      
      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS respondent_id VARCHAR(255);`);
      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS score INT;`);
      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS total_quiz_questions INT;`);
      await client.query(`ALTER TABLE responses ADD CONSTRAINT responses_survey_id_respondent_id_key UNIQUE (survey_id, respondent_id);`);
    } catch (e) {
      // Ignore if constraint already exists
    }

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

    // Create users table for user profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        photo_url TEXT,
        tagline VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default admin user if not exists
    await client.query(`
      INSERT INTO users (id, name, email, photo_url, tagline)
      VALUES ('admin', 'Alex Chen', 'alex@company.com', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop', 'Nhà sáng tạo Cấp 3')
      ON CONFLICT (id) DO NOTHING;
    `);

    client.release();
    console.log('✅ PostgreSQL Database connected and tables initialized.');
  } catch (err) {
    console.error('❌ Error connecting to PostgreSQL:', err);
  }
};

export default pool;
