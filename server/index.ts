/**
 * Smart Survey Hub — Express Backend Server
 * Entry point: setup middleware + mount route modules.
 */

import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload.routes';
import surveyRoutes from './routes/survey.routes';
import chatRoutes from './routes/chat.routes';
import teamRoutes from './routes/team.routes';
import userRoutes from './routes/user.routes';

const app = express();
const PORT = process.env.PORT || 3001;

import path from 'path';
import { fileURLToPath } from 'url';

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Routes ───
app.use('/api', uploadRoutes);
app.use('/api', surveyRoutes);
app.use('/api', chatRoutes);
app.use('/api', teamRoutes);
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

// ─── Health Check ───
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import { initDB } from './db';

// ─── Start Server ───
app.listen(PORT, async () => {
  await initDB();
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
