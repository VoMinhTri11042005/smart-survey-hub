import { Pool, type PoolClient } from 'pg';
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

/**
 * One-time, idempotent repair for answers collected while the UI allowed
 * half-star selection. Only numeric 0.5–5 ratings on current star-rating
 * questions are rounded; invalid or nonnumeric values are left untouched.
 */
async function normalizeLegacyStarRatingResponses(client: PoolClient) {
  const result = await client.query<{ id: string; ratingCount: number }>(`
    WITH replacements AS (
      SELECT
        r.id,
        jsonb_object_agg(
          q.question ->> 'id',
          to_jsonb(ROUND((r.answers ->> (q.question ->> 'id'))::numeric))
        ) AS patch,
        COUNT(*)::int AS rating_count
      FROM responses r
      INNER JOIN surveys s ON s.id = r.survey_id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.questions) = 'array' THEN s.questions ELSE '[]'::jsonb END
      ) AS q(question)
      WHERE q.question ->> 'type' = 'star_rating'
        AND q.question ? 'id'
        AND jsonb_typeof(r.answers -> (q.question ->> 'id')) = 'number'
        AND (r.answers ->> (q.question ->> 'id'))::numeric BETWEEN 0.5 AND 5
        AND (r.answers ->> (q.question ->> 'id'))::numeric <> ROUND((r.answers ->> (q.question ->> 'id'))::numeric)
      GROUP BY r.id
    )
    UPDATE responses r
    SET answers = r.answers || replacements.patch
    FROM replacements
    WHERE r.id = replacements.id
    RETURNING r.id, replacements.rating_count AS "ratingCount"
  `);

  const repairedRatings = result.rows.reduce((sum, row) => sum + Number(row.ratingCount || 0), 0);
  if (repairedRatings > 0) {
    console.log(`✅ Rounded ${repairedRatings} legacy star-rating value(s) across ${result.rowCount ?? 0} response(s).`);
  }
}

export const initDB = async () => {
  if (!process.env.DATABASE_URL) {
    const message = 'DATABASE_URL is not set.';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${message} Refusing to start in production without durable storage.`);
    }
    console.warn(`⚠️ WARNING: ${message} Development-only in-memory mode is active.`);
    return;
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    
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

    // In case table already exists without respondent_id or quiz columns.
    // Any unexpected conversion failure aborts startup and rolls back safely.
    {
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

      const constraintCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'responses_survey_id_respondent_id_key'
        ) AS exists
      `);
      if (!constraintCheck.rows[0].exists) {
        await client.query('SAVEPOINT response_unique_constraint');
        try {
          // Never delete legacy duplicates just to make this constraint pass.
          await client.query(`ALTER TABLE responses ADD CONSTRAINT responses_survey_id_respondent_id_key UNIQUE (survey_id, respondent_id);`);
        } catch (e: any) {
          await client.query('ROLLBACK TO SAVEPOINT response_unique_constraint');
          console.error('⚠️ Could not add response uniqueness without changing existing data:', e?.message || e);
        }
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

    // Backward-compatible schema updates. These are additive only.
    {
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS display_mode VARCHAR(32) DEFAULT 'single';`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS show_score BOOLEAN DEFAULT TRUE;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS closes_at TIMESTAMP;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS max_attempts_per_device INTEGER;`);
      await client.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS closes_at TIMESTAMP;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS max_attempts_per_device INTEGER;`);
      await client.query(`ALTER TABLE survey_drafts ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;`);
    }

    // Runs before the server accepts requests. It is safe to rerun because
    // integer ratings do not match the migration predicate.
    await normalizeLegacyStarRatingResponses(client);

    await client.query('COMMIT');
    console.log('✅ PostgreSQL Database connected and tables initialized.');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('❌ Error connecting to PostgreSQL:', err);
    throw err;
  } finally {
    client?.release();
  }
};

export default pool;
