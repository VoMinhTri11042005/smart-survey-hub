/**
 * Team Routes — thin route definitions with validation.
 */
import { Router } from 'express';
import pool from '../db';
import { validate } from '../middleware/validate';
import { InviteTeamMemberSchema, UpdateTeamMemberSchema } from '../validators/team.validator';
import { generateId } from '../utils/helpers';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

router.get('/teams', async (_req: Request, res: Response, next: NextFunction) => {
  if (!process.env.DATABASE_URL) return res.json([]);
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY joined_at DESC');
    res.json(result.rows.map(row => ({
      id: row.id, name: row.name, email: row.email, role: row.role, joinedAt: row.joined_at
    })));
  } catch (err) { next(err); }
});

router.post('/teams', validate(InviteTeamMemberSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  const { name, email, role } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM teams WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email này đã có trong nhóm.' });
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO teams (id, name, email, role) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, name.trim(), email.trim().toLowerCase(), role || 'viewer']
    );
    const row = result.rows[0];
    res.json({ id: row.id, name: row.name, email: row.email, role: row.role, joinedAt: row.joined_at });
  } catch (err) { next(err); }
});

router.patch('/teams/:id', validate(UpdateTeamMemberSchema), async (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  try {
    const member = await pool.query('SELECT * FROM teams WHERE id = $1', [req.params.id]);
    if (member.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy thành viên.' });
    const name = req.body.name ? req.body.name.trim() : member.rows[0].name;
    const role = req.body.role ? req.body.role : member.rows[0].role;
    const result = await pool.query('UPDATE teams SET name = $1, role = $2 WHERE id = $3 RETURNING *', [name, role, req.params.id]);
    const row = result.rows[0];
    res.json({ id: row.id, name: row.name, email: row.email, role: row.role, joinedAt: row.joined_at });
  } catch (err) { next(err); }
});

router.delete('/teams/:id', async (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Database not configured' });
  try {
    const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy thành viên.' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
