import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = express.Router();
router.use(requireAuth);

router.get('/masters', (req, res) => {
  const masters = db.prepare('SELECT * FROM master_traders ORDER BY followers DESC').all();
  res.json(masters);
});

router.get('/portfolio', (req, res) => {
  const portfolio = db.prepare(`
    SELECT cr.*, mt.name, mt.avatar, mt.roi_percentage, mt.win_rate
    FROM copy_relationships cr
    JOIN master_traders mt ON mt.id = cr.master_trader_id
    WHERE cr.user_id = ? AND cr.status = 'active'
    ORDER BY cr.created_at DESC
  `).all(req.user.id);
  res.json(portfolio);
});

router.post('/start', (req, res) => {
  const { master_trader_id, amount } = req.body || {};
  if (!master_trader_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid master_trader_id and amount are required' });
  }

  const master = db.prepare('SELECT * FROM master_traders WHERE id = ?').get(master_trader_id);
  if (!master) {
    return res.status(404).json({ error: 'Master trader not found' });
  }

  const tx = db.transaction(() => {
    // Check balance
    const bal = db.prepare('SELECT available FROM balances WHERE user_id = ?').get(req.user.id);
    if (!bal || bal.available < amount) {
      throw new Error('Insufficient balance');
    }

    // Deduct amount
    db.prepare('UPDATE balances SET available = available - ?, locked = locked + ? WHERE user_id = ?').run(amount, amount, req.user.id);

    // Create relationship
    db.prepare(`
      INSERT INTO copy_relationships (user_id, master_trader_id, allocated_margin, current_value) 
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, master_trader_id, amount, amount);
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/stop', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });

  const relationship = db.prepare('SELECT * FROM copy_relationships WHERE id = ? AND user_id = ? AND status = "active"').get(id, req.user.id);
  if (!relationship) return res.status(404).json({ error: 'Active copy relationship not found' });

  const tx = db.transaction(() => {
    // Mark as stopped
    db.prepare('UPDATE copy_relationships SET status = "stopped", stopped_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    // Return current_value to available balance, reduce locked
    // Assuming allocated_margin was what got locked. The actual current_value is what gets returned to available.
    db.prepare(`
      UPDATE balances 
      SET available = available + ?, 
          locked = MAX(0, locked - ?) 
      WHERE user_id = ?
    `).run(relationship.current_value, relationship.allocated_margin, req.user.id);
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
