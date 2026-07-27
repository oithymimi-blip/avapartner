import express from 'express';
import { requireAuth, requireAdminRole } from '../auth/authMiddleware.js';
import { getSpotMarkets, updateSpotOverride, getSpotOverrides, clearSpotOverride, createSpotOrder, getSpotOrders, getSpotBalances, cancelSpotOrder } from './service.js';

const router = express.Router();

router.get('/markets', async (req, res) => {
  try {
    const markets = await getSpotMarkets();
    res.json({ markets });
  } catch (err) {
    console.error('spot markets error', err);
    res.status(503).json({ error: 'Failed to load live spot markets' });
  }
});

router.get('/overrides', requireAuth, requireAdminRole('market'), (req, res) => {
  try {
    const overrides = getSpotOverrides();
    res.json({ overrides });
  } catch (err) {
    console.error('get spot overrides error', err);
    res.status(500).json({ error: 'Failed to fetch spot overrides' });
  }
});

router.post('/markets/:symbol/price', requireAuth, requireAdminRole('market'), async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const overrides = await updateSpotOverride(symbol, {
      price: req.body.price,
      change_24h: req.body.change_24h,
      volume_24h: req.body.volume_24h
    });
    res.json({ ok: true, overrides });
  } catch (err) {
    console.error('spot override error', err);
    res.status(500).json({ error: 'Failed to update spot market' });
  }
});

router.delete('/markets/:symbol/override', requireAuth, requireAdminRole('market'), async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    await clearSpotOverride(symbol);
    res.json({ ok: true, symbol });
  } catch (err) {
    console.error('clear spot override error', err);
    res.status(500).json({ error: 'Failed to clear spot market override' });
  }
});

router.post('/trade', requireAuth, async (req, res) => {
  try {
    const { symbol, side, type, price, amount } = req.body;
    const order = await createSpotOrder(req.user.id, symbol, side, type, price, amount);
    res.json({ order });
  } catch (err) {
    console.error('spot trade error', err);
    res.status(400).json({ error: err.message || 'Failed to place spot order' });
  }
});

router.get('/orders', requireAuth, (req, res) => {
  try {
    const orders = getSpotOrders(req.user.id);
    res.json({ orders });
  } catch (err) {
    console.error('get spot orders error', err);
    res.status(500).json({ error: 'Failed to fetch spot orders' });
  }
});

router.get('/holdings', requireAuth, (req, res) => {
  try {
    const balances = getSpotBalances(req.user.id);
    res.json({ balances });
  } catch (err) {
    console.error('get spot holdings error', err);
    res.status(500).json({ error: 'Failed to fetch spot holdings' });
  }
});

router.delete('/orders/:id', requireAuth, (req, res) => {
  try {
    cancelSpotOrder(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('cancel spot order error', err);
    res.status(400).json({ error: err.message || 'Failed to cancel order' });
  }
});

export default router;
