import db from '../db.js';
import { emitSocket } from '../market/engine.js';

export function notifyAdmin({ type, title, message, user_email, link }) {
  try {
    const res = db.prepare(`
      INSERT INTO admin_notifications (type, title, message, user_email, link, read)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(type || 'info', title, message, user_email || null, link || '/admin');

    const notification = {
      id: res.lastInsertRowid,
      type: type || 'info',
      title,
      message,
      user_email: user_email || null,
      link: link || '/admin',
      read: 0,
      created_at: new Date().toISOString()
    };

    emitSocket('admin_notification', notification);
    return notification;
  } catch (err) {
    console.error('[NOTIFY_ADMIN] Failed to dispatch admin notification:', err);
    return null;
  }
}

export function getAdminNotifications(limit = 50) {
  try {
    const rows = db.prepare(`
      SELECT * FROM admin_notifications
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);

    const unreadCount = db.prepare(`
      SELECT COUNT(*) AS count FROM admin_notifications WHERE read = 0
    `).get().count;

    return { notifications: rows, unreadCount };
  } catch (err) {
    console.error('[NOTIFY_ADMIN] Failed to fetch admin notifications:', err);
    return { notifications: [], unreadCount: 0 };
  }
}

export function markAdminNotificationsRead() {
  try {
    db.prepare(`UPDATE admin_notifications SET read = 1 WHERE read = 0`).run();
    return { ok: true };
  } catch (err) {
    console.error('[NOTIFY_ADMIN] Failed to mark admin notifications read:', err);
    return { ok: false };
  }
}
