import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { signToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { mobileNumber, password } = req.body;
  if (!mobileNumber || !password) {
    return res.status(400).json({ error: 'mobileNumber and password required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, s.name as school_name FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.mobile_number = $1 AND u.is_active = TRUE`,
      [mobileNumber]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last login
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    // Get linked student IDs for parents
    let linkedStudentIds: number[] = [];
    if (user.role === 'PARENT') {
      const links = await pool.query(
        `SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`,
        [user.id]
      );
      linkedStudentIds = links.rows.map((r: { student_id: number }) => r.student_id);
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      schoolId: user.school_id,
      mobileNumber: user.mobile_number,
      name: user.name,
      mustChangePassword: !user.first_login_changed,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        role: user.role,
        schoolId: user.school_id,
        schoolName: user.school_name || null,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobile_number,
        mustChangePassword: !user.first_login_changed,
        linkedStudentIds,
      },
    });
  } catch (err: unknown) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req: AuthRequest, res: Response) => {
  return res.json({ message: 'Logged out' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'oldPassword and newPassword required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [req.user!.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Old password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, first_login_changed = TRUE, updated_at = NOW() WHERE id = $2`,
      [newHash, user.id]
    );

    return res.json({ message: 'Password changed successfully' });
  } catch (err: unknown) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.*, s.name as school_name FROM users u
       LEFT JOIN schools s ON u.school_id = s.id
       WHERE u.id = $1`,
      [req.user!.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let linkedStudentIds: number[] = [];
    if (user.role === 'PARENT') {
      const links = await pool.query(
        `SELECT student_id FROM parent_student_links WHERE parent_user_id = $1`,
        [user.id]
      );
      linkedStudentIds = links.rows.map((r: { student_id: number }) => r.student_id);
    }

    return res.json({
      id: user.id,
      role: user.role,
      schoolId: user.school_id,
      schoolName: user.school_name || null,
      name: user.name,
      email: user.email,
      mobileNumber: user.mobile_number,
      mustChangePassword: !user.first_login_changed,
      linkedStudentIds,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
