const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'nexlink_secret_key_change_in_prod';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// POST /api/auth/signup
router.post('/signup', [
  body('firstName').trim().isLength({ min: 1, max: 50 }).withMessage('First name required'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must include uppercase, lowercase, and number'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('pin').optional().isLength({ min: 4, max: 4 }).isNumeric().withMessage('PIN must be 4 digits'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, lastName, email, password, pin } = req.body;

  try {
    // Check existing user
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    let pinHash = null;
    if (pin) {
      pinHash = await bcrypt.hash(pin, 10);
    }

    // Create user
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, pin_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, first_name, last_name, email, created_at`,
      [firstName, lastName, email, passwordHash, pinHash]
    );

    const user = result.rows[0];

    // Create JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id, tokenHash, req.ip, req.get('user-agent'), expiresAt]
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, pin } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify PIN if set
    if (user.pin_hash && pin) {
      const validPin = await bcrypt.compare(pin, user.pin_hash);
      if (!validPin) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }
    } else if (user.pin_hash && !pin) {
      return res.status(400).json({ error: 'PIN required', requiresPin: true });
    }

    // Update online status
    await pool.query('UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1', [user.id]);

    // Create JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id, tokenHash, req.ip, req.get('user-agent'), expiresAt]
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        permissionsGranted: user.permissions_granted,
        cameraAccess: user.camera_access,
        locationAccess: user.location_access,
        callAccess: user.call_access,
        avatarUrl: user.avatar_url,
        bio: user.bio,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.token).digest('hex');
    await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
    await pool.query('UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1', [req.user.id]);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /api/auth/permissions
router.post('/permissions', authenticateToken, async (req, res) => {
  const { camera, location, calls, granted } = req.body;
  try {
    await pool.query(
      'UPDATE users SET permissions_granted = $1, camera_access = $2, location_access = $3, call_access = $4 WHERE id = $5',
      [granted, camera || false, location || false, calls || false, req.user.id]
    );
    res.json({ message: 'Permissions updated', permissions: { camera, location, calls } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      email: req.user.email,
      permissionsGranted: req.user.permissions_granted,
      cameraAccess: req.user.camera_access,
      locationAccess: req.user.location_access,
      callAccess: req.user.call_access,
      avatarUrl: req.user.avatar_url,
      bio: req.user.bio,
      isOnline: req.user.is_online,
    }
  });
});

module.exports = router;
