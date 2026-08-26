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
        display_mode VARCHAR(32) DEFAULT 'single',
        show_score BOOLEAN DEFAULT TRUE,
        closes_at TIMESTAMP,
        max_attempts_per_device INTEGER,
        time_limit_minutes INTEGER,
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
        score NUMERIC(10,2),
        total_quiz_questions NUMERIC(10,2),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (survey_id, respondent_id)
      );
    `);

    // In case table already exists without respondent_id or quiz columns
    try {
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS is_quiz BOOLEAN DEFAULT FALSE;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS display_mode VARCHAR(32) DEFAULT 'single';`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS show_score BOOLEAN DEFAULT TRUE;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS closes_at TIMESTAMP;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS max_attempts_per_device INTEGER;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;`);

      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS respondent_id VARCHAR(255);`);
      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS score NUMERIC(10,2);`);
      await client.query(`ALTER TABLE responses ADD COLUMN IF NOT EXISTS total_quiz_questions NUMERIC(10,2);`);

      // Nếu bảng responses đã tồn tại từ trước với cột score/total_quiz_questions
      // kiểu INT (không nhận số thập phân), đổi sang NUMERIC để chấp nhận điểm
      // lẻ (ví dụ câu hỏi được gán 1.5 điểm) — trước đây gây lỗi:
      // "invalid input syntax for type integer" mỗi khi nộp quiz có điểm lẻ.
      await client.query(`ALTER TABLE responses ALTER COLUMN score TYPE NUMERIC(10,2) USING score::numeric;`);
      await client.query(`ALTER TABLE responses ALTER COLUMN total_quiz_questions TYPE NUMERIC(10,2) USING total_quiz_questions::numeric;`);

      // Xoá các bản ghi trùng (survey_id, respondent_id) còn sót lại từ trước khi
      // constraint UNIQUE được thêm vào. Nếu không xoá, lệnh ADD CONSTRAINT bên
      // dưới sẽ luôn thất bại âm thầm (bị catch nuốt lỗi), khiến ON CONFLICT
      // trong route submit response báo lỗi 500 mỗi lần người dùng nộp bài.
      await client.query(`
        DELETE FROM responses a USING responses b
        WHERE a.survey_id = b.survey_id
          AND a.respondent_id = b.respondent_id
          AND a.respondent_id IS NOT NULL
          AND a.ctid < b.ctid;
      `);

      await client.query(`ALTER TABLE responses ADD CONSTRAINT responses_survey_id_respondent_id_key UNIQUE (survey_id, respondent_id);`);
    } catch (e: any) {
      // Chỉ bỏ qua nếu constraint đã tồn tại sẵn (42710) hoặc lỗi tương tự (42P07).
      // Mọi lỗi khác sẽ được log ra để dễ debug trên Render logs.
      if (e?.code !== '42710' && e?.code !== '42P07') {
        console.error('⚠️ Failed to ensure responses unique constraint:', e?.message || e);
      }
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

    // Drafts storage to prevent losing unsaved survey work
    await client.query(`
      CREATE TABLE IF NOT EXISTS survey_drafts (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL DEFAULT 'admin',
        title TEXT,
        description TEXT,
        questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_quiz BOOLEAN DEFAULT FALSE,
        show_score BOOLEAN DEFAULT TRUE,
        display_mode VARCHAR(32) DEFAULT 'single',
        closes_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Install default admin user if not exists
    await client.query(`
      INSERT INTO users (id, name, email, photo_url, tagline)
      VALUES ('admin', 'Alex Chen', 'alex@company.com', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop', 'Nhà sáng tạo Cấp 3')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Backward-compatible schema updates
    try {
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS display_mode VARCHAR(32) DEFAULT 'single';`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS show_score BOOLEAN DEFAULT TRUE;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS closes_at TIMESTAMP;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS max_attempts_per_device INTEGER;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS closes_at TIMESTAMP;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS max_attempts_per_device INTEGER;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;`);
    } catch (e) {
      // Ignore if the column already exists or migration is not needed.
    }

    client.release();
    console.log('✅ PostgreSQL Database connected and tables initialized.');
  } catch (err) {
    console.error('❌ Error connecting to PostgreSQL:', err);
  }
};

export default pool;
