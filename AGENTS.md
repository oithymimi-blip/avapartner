# Project Rules — Permanent Database Persistence & Safe Deployment

These rules are **mandatory** for all code updates, server restarts, and deployments in this project (`/home/pro/Projects/current/fexova`).

## 1. Never Vanish / Never Wipe Database Data
- **NEVER** delete, wipe, overwrite, truncate, or reset live/production database files (`data.db*`, `server/data.db*`, `/var/data/data.db*`, `/data/data.db*`, or cloud tables `avapartner_cloud_state`, `avapartner_cloud_blobs`, `avapartner_cloud_backups`).
- **NEVER** put `rm -f data.db*` or destructive database resets in any deploy script (`deploy_*.sh`) or startup initialization.
- **NEVER** sync local development `data.db*`, `.env`, or `backups/` over a remote VPS/production database during deployment.
- **NEVER** overwrite a populated cloud backup with a blank or freshly booted single-admin database.
- Keep relative `DB_FILE` paths resolved strictly against `server/` (`server/src/config.js`) so running commands from different working directories never creates or reads a blank database.
- Any new table storing user data, financial state, configuration, or activity **MUST** be added to `PERSISTENT_TABLES` (and `mergeSnapshot` where applicable) in `server/src/cloudPersistence.js` and preserve existing data idempotently (`INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` — never `ON CONFLICT DO UPDATE` overwriting admin/user data on boot).

## 2. Permanent Storage of All Data & Activities
- Store **all** user and admin data and activities permanently in the database (`users`, `balances`, `trades`, `binary_trades`, `spot_orders`, `spot_balances`, `spot_overrides`, `ai_trade_sessions`, `ai_trade_history`, `copy_relationships`, `master_traders`, `ib_levels`, `ib_user_rates`, `ib_settings`, `ib_program_config`, `ib_commission_ledger`, `ib_monthly_metrics`, `promotions`, `promotion_claims`, `bonus_locks`, `bonus_system_settings`, `payment_methods`, `payment_requests`, `user_deposit_wallets`, `verifications`, `verification_settings`, `user_security`, `admin_permissions`, `notifications`, `notification_reads`, `admin_notifications`, `activity_logs`, `system_features`, `market_settings`, `market_channels`).
- Record user/admin actions (signup, login, admin login, password reset, profile updates, verification submissions, trades, payments, promotions, IB actions, market changes) in `activity_logs` via `recordActivity()` (`server/src/db.js`).
- Never delete `notifications WHERE user_id IS NULL` or overwrite `market_settings` / zero balances on startup.

## 3. Mandatory Pre-Deploy & Pre-Update Data Check
Before **every** update, server restart, or deployment (VPS, Render, Vercel, or local):
1. Check current database integrity and counts:
   ```bash
   npm --prefix server run db:check
   ```
   (Pass `-- --api https://<live-domain>` when checking a remote live deployment.)
2. Create a verified pre-deploy backup snapshot and save the baseline:
   ```bash
   npm --prefix server run db:backup
   ```
3. Confirm `PRAGMA quick_check === ok`, non-zero expected accounts/records/balances, and no backup errors. **If pre-deploy check or backup fails, DO NOT deploy.**

## 4. Mandatory Post-Deploy & Post-Update Data Check
Immediately after **every** update, server restart, or deployment:
1. Run post-deploy verification against the pre-deploy baseline:
   ```bash
   npm --prefix server run db:verify-post
   ```
   (Pass `-- --api https://<live-domain>` when verifying a remote live deployment.)
2. Verify `/api/health` and `/api/admin/backup/status` confirm all users, balances, trades, payments, verifications, activity logs, settings, and every-minute backup scheduling are intact with zero shrinkage or missing rows.
3. **If any table count decreased, balances vanished, or verification fails:** immediately halt and restore from `server/backups/pre-deploy/` or `avapartner_cloud_blobs` (`POST /api/admin/backup/restore-cloud`).

## 5. Every-Minute Database Backup Requirement
- Keep the **60-second automatic backup cycle** (`runMinuteBackupCycle` in `server/src/cloudPersistence.js` and `backupDatabase` / `saveLocalJsonSnapshot` in `server/src/db.js`) active at all times:
  - Every 1 minute: updates atomic SQLite hot backup (`server/backups/data-backup-latest.db`), saves immutable compressed JSON snapshots (`server/backups/snapshots/`) on any change, appends checkpoint history (`server/backups/backup-history.jsonl`), syncs `avapartner_cloud_state` (`id = 'primary'`), stores permanent deduplicated snapshots in `avapartner_cloud_blobs`, and records every-minute checkpoints in `avapartner_cloud_backups`.
- Never disable or slow down the 60-second backup scheduler.
