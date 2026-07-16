import { Router } from 'express';
import pool from '../db';

const router = Router();

// GET user profile
router.get('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({
      name: user.name,
      email: user.email,
      photoURL: user.photo_url,
      tagline: user.tagline
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST/PUT update user profile
router.post('/user', async (req, res) => {
  try {
    const { id = 'admin', name, email, photoURL, tagline } = req.body;
    
    await pool.query(
      `INSERT INTO users (id, name, email, photo_url, tagline) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
       name = EXCLUDED.name, 
       email = EXCLUDED.email, 
       photo_url = EXCLUDED.photo_url, 
       tagline = EXCLUDED.tagline`,
      [id, name, email, photoURL, tagline]
    );

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
