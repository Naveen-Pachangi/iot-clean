const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/users/search?q=name
router.get('/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ users: [] });
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, avatar_url, is_online, bio
       FROM users WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
       AND id != $2 LIMIT 20`,
      [`%${q}%`, req.user.id]
    );
    res.json({ users: result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      avatarUrl: u.avatar_url,
      isOnline: u.is_online,
      bio: u.bio,
    }))});
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/users/contacts
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.is_online, u.last_seen, c.status
       FROM connections c
       JOIN users u ON u.id = CASE WHEN c.user_id = $1 THEN c.connected_user_id ELSE c.user_id END
       WHERE (c.user_id = $1 OR c.connected_user_id = $1) AND c.status = 'accepted'`,
      [req.user.id]
    );
    res.json({ contacts: result.rows.map(u => ({
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      avatarUrl: u.avatar_url,
      isOnline: u.is_online,
      lastSeen: u.last_seen,
    }))});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/users/connect
router.post('/connect', authenticateToken, async (req, res) => {
  const { userId } = req.body;
  try {
    await pool.query(
      'INSERT INTO connections (user_id, connected_user_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.user.id, userId, 'accepted']
    );
    res.json({ message: 'Connected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to connect' });
  }
});

// GET /api/users/messages/:userId
router.get('/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.first_name, u.last_name, u.avatar_url
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC LIMIT 100`,
      [req.user.id, req.params.userId]
    );
    // Mark as read
    await pool.query(
      'UPDATE messages SET is_read = true WHERE receiver_id = $1 AND sender_id = $2',
      [req.user.id, req.params.userId]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/users/messages
router.post('/messages', authenticateToken, async (req, res) => {
  const { receiverId, content, messageType = 'text' } = req.body;
  if (!receiverId || !content) return res.status(400).json({ error: 'receiverId and content required' });
  try {
    const result = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, content, message_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, receiverId, content, messageType]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/users/location/share
router.post('/location/share', authenticateToken, async (req, res) => {
  const { sharedWith, latitude, longitude, locationName, meetingTitle } = req.body;
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    const result = await pool.query(
      `INSERT INTO location_shares (user_id, shared_with, latitude, longitude, location_name, meeting_title, share_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, sharedWith, latitude, longitude, locationName, meetingTitle, expiresAt]
    );
    res.status(201).json({ share: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share location' });
  }
});

// GET /api/users/location/shared-with-me
router.get('/location/shared-with-me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ls.*, u.first_name, u.last_name, u.avatar_url
       FROM location_shares ls JOIN users u ON u.id = ls.user_id
       WHERE ls.shared_with = $1 AND ls.share_expires_at > NOW()
       ORDER BY ls.created_at DESC`,
      [req.user.id]
    );
    res.json({ locations: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// POST /api/users/calls/log
router.post('/calls/log', authenticateToken, async (req, res) => {
  const { receiverId, callType, status, durationSeconds } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO calls (caller_id, receiver_id, call_type, status, duration_seconds) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, receiverId, callType || 'voice', status || 'initiated', durationSeconds || 0]
    );
    res.status(201).json({ call: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log call' });
  }
});

// GET /api/users/calls/history
router.get('/calls/history', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
        caller.first_name as caller_first, caller.last_name as caller_last,
        receiver.first_name as receiver_first, receiver.last_name as receiver_last
       FROM calls c
       JOIN users caller ON caller.id = c.caller_id
       JOIN users receiver ON receiver.id = c.receiver_id
       WHERE c.caller_id = $1 OR c.receiver_id = $1
       ORDER BY c.started_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ calls: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// GET /api/users/notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, u.first_name, u.last_name, u.avatar_url
       FROM notifications n LEFT JOIN users u ON u.id = n.from_user_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/users/profile
router.patch('/profile', authenticateToken, async (req, res) => {
  const { bio, avatarUrl } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET bio = COALESCE($1, bio), avatar_url = COALESCE($2, avatar_url) WHERE id = $3 RETURNING first_name, last_name, email, bio, avatar_url',
      [bio, avatarUrl, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
