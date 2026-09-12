/**
 * Smart Survey Hub — Express Backend Server
 * Entry point: setup middleware + mount route modules.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler';
import uploadRoutes from './routes/upload.routes';
import surveyRoutes from './routes/survey.routes';
import chatRoutes from './routes/chat.routes';
import teamRoutes from './routes/team.routes';
import userRoutes from './routes/user.routes';
import { initDB } from './db';

const app = express();
const PORT = process.env.PORT || 3005;

// ─── Middleware ───
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.APP_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin không được phép truy cập API.'));
  },
}));
app.use(express.json({ limit: '10mb' }));

// ─── Health Check (public) ───
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───
// All routes are mounted under /api. Auth middleware is applied at the router
// level inside each route file where needed. The requireAuth middleware
// gracefully degrades when FIREBASE_SERVICE_ACCOUNT is not configured.
app.use('/api', surveyRoutes);
app.use('/api', requireAuth, uploadRoutes);
app.use('/api', requireAuth, chatRoutes);
app.use('/api', requireAuth, teamRoutes);
app.use('/api', userRoutes);

// ─── Serve Frontend in Production ───
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

// Serve static files
app.use(express.static(distPath));

// Catch-all to serve index.html for React Router / client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

// ─── Global Error Handler (must be last) ───
app.use(errorHandler);

// ─── Start Server ───
async function startServer() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Smart Survey Hub API running on http://localhost:${PORT}`);
    console.log(`\n📋 Endpoints:`);
    console.log(`   POST /api/parse-docx           — Upload & parse Word file`);
    console.log(`   POST /api/surveys              — Create survey`);
    console.log(`   GET  /api/surveys              — List all surveys`);
    console.log(`   GET  /api/surveys/:id          — Get survey by ID`);
    console.log(`   DELETE /api/surveys/:id        — Delete survey`);
    console.log(`   POST /api/surveys/:id/responses — Submit response`);
    console.log(`   GET  /api/surveys/:id/responses — Get responses`);
    console.log(`   POST /api/chat                 — AI Chatbot`);
    console.log(`   GET  /api/teams                — List team members`);
    console.log(`   POST /api/teams                — Invite member`);
    console.log(`   PATCH /api/teams/:id           — Update member`);
    console.log(`   DELETE /api/teams/:id          — Remove member`);
    console.log(`   GET  /api/health               — Health check\n`);

    if (!process.env.GEMINI_API_KEY) {
      console.warn(`⚠️  GEMINI_API_KEY not found! Create .env.local with your key.\n`);
    }
  });
}

startServer().catch((error) => {
  console.error('❌ Server startup aborted:', error);
  process.exitCode = 1;
});
