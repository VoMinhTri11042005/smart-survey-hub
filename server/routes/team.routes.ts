/**
 * Team Routes
 * CRUD operations cho thành viên nhóm.
 */

import { Router } from 'express';
import { teams, generateId } from '../store';
import type { StoredTeamMember } from '../store';

const router = Router();

router.get('/teams', (_req, res) => {
  res.json(teams.values());
});

router.post('/teams', (req, res) => {
  const { name, email, role } = req.body;

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập tên và email.' });
  }

  const existing = teams.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email này đã có trong nhóm.' });
  }

  const member: StoredTeamMember = {
    id: generateId(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role || 'viewer',
    joinedAt: new Date().toISOString(),
  };

  teams.set(member.id, member);
  res.json(member);
});

router.patch('/teams/:id', (req, res) => {
  const member = teams.get(req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'Không tìm thấy thành viên.' });
  }

  const updated: StoredTeamMember = {
    ...member,
    ...(req.body.name && { name: req.body.name.trim() }),
    ...(req.body.role && { role: req.body.role }),
  };

  teams.set(member.id, updated);
  res.json(updated);
});

router.delete('/teams/:id', (req, res) => {
  if (!teams.has(req.params.id)) {
    return res.status(404).json({ error: 'Không tìm thấy thành viên.' });
  }
  teams.delete(req.params.id);
  res.json({ success: true });
});

export default router;
