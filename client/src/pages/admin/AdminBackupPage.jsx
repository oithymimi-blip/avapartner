import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useAdminAuth } from '../../adminStore'
import { formatBdDateTime, getBdIsoDate } from '../../utils/bdTime'

export default function AdminBackupPage() {
  const { token } = useAdminAuth()
  const fileRef = useRef(null)

  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState({ cloudBackups: [], localBackups: [] })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [restoringHash, setRestoringHash] = useState('')
  const [importMode, setImportMode] = useState('merge')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const loadStatus = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [statusRes, histRes] = await Promise.all([
        api(token).get('/api/admin/backup/status'),
        api(token).get('/api/admin/backup/history?limit=30').catch(() => ({ data: { cloudBackups: [], localBackups: [] } }))
      ])
      setStatus(statusRes.data)
      setHistory({
        cloudBackups: histRes.data?.cloudBackups || [],
        localBackups: histRes.data?.localBackups || []
      })
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to load database persistence status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [token])

  const handleBackupNow = async () => {
    setMsg('')
    setErr('')
    setBackingUp(true)
    try {
      const res = await api(token).post('/api/admin/backup/now')
      if (res.data?.status) setStatus(res.data.status)
      await loadStatus()
      const cloudOk = res.data?.cloudBackup?.backedUp
      const localOk = res.data?.localDb?.ok
      setMsg(
        `Immediate backup completed (Local SQLite: ${localOk ? 'OK' : 'Failed'}${cloudOk ? ', Cloud Minute Archive: OK' : ''}).`
      )
    } catch (e) {
      setErr(e?.response?.data?.error || 'Immediate backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  const handleRestoreCloudHash = async (hash) => {
    if (!hash) return
    setMsg('')
    setErr('')
    setRestoringHash(hash)
    try {
      const res = await api(token).post('/api/admin/backup/restore-cloud', { hash, mode: importMode })
      if (res.data?.status) setStatus(res.data.status)
      await loadStatus()
      if (importMode === 'merge') {
        setMsg(`Cloud snapshot restored (Merge): ${res.data.usersAdded || 0} accounts added, ${res.data.usersMatched || 0} matched, ${res.data.recordsMerged || 0} records merged.`)
      } else {
        setMsg(`Cloud snapshot restored (Replace All): ${res.data.userCount || 0} accounts.`)
      }
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to restore cloud snapshot')
    } finally {
      setRestoringHash('')
    }
  }

  const handleSyncNow = async () => {
    setMsg('')
    setErr('')
    setSyncing(true)
    try {
      const res = await api(token).post('/api/admin/backup/sync')
      if (res.data?.status) setStatus(res.data.status)
      if (res.data?.synced) {
        setMsg(`Cloud snapshot synced (${res.data.userCount} users preserved).`)
      } else {
        setErr(res.data?.reason || res.data?.error || 'No external cloud DB connected yet.')
      }
    } catch (e) {
      setErr(e?.response?.data?.error || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleDownloadBackup = async () => {
    setMsg('')
    setErr('')
    setExporting(true)
    try {
      const res = await api(token).get('/api/admin/backup/export')
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `avapartner-backup-${getBdIsoDate()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg(`Backup downloaded (${res.data?.userCount || 0} user accounts included).`)
    } catch (e) {
      setErr(e?.response?.data?.error || 'Failed to export backup')
    } finally {
      setExporting(false)
    }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setMsg('')
    setErr('')
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const snapshot = parsed?.data ? parsed : { version: 1, data: parsed }
      const res = await api(token).post('/api/admin/backup/import', {
        snapshot,
        mode: importMode
      })
      if (res.data?.status) setStatus(res.data.status)
      if (importMode === 'merge') {
        setMsg(`Restore complete: ${res.data.usersAdded || 0} accounts restored, ${res.data.usersMatched || 0} existing matched, ${res.data.recordsMerged || 0} related records merged.`)
      } else {
        setMsg(`Full replace restore complete (${res.data.userCount || 0} accounts).`)
      }
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Failed to restore backup file')
    } finally {
      setImporting(false)
    }
  }

  const driverLabels = {
    postgres: 'PostgreSQL Cloud Sync (Persistent)',
    turso: 'Turso LibSQL Cloud Sync (Persistent)',
    persistent_disk: 'Mounted Persistent Volume (/var/data)',
    ephemeral_local: 'Ephemeral Container Disk (Temporary — resets on redeploy)'
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Infrastructure</div>
        <h1 className="text-2xl font-bold text-slate-900">Database &amp; Backups</h1>
        <p className="text-sm text-slate-600 mt-1">
          Verify permanent cloud database persistence across deploys and download or restore full user backups.
        </p>
      </div>

      {err && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">
          {err}
        </div>
      )}

      {msg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium">
          {msg}
        </div>
      )}

      {/* Persistence Status Card */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Storage Mode</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {loading ? 'Checking...' : (driverLabels[status?.driver] || status?.driver)}
            </div>
          </div>

          {!loading && (
            <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${
              status?.durable
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-300'
            }`}>
              {status?.durable ? '✅ Durable Across Deploys' : '⚠️ Ephemeral Disk Warning'}
            </span>
          )}
        </div>

        {!loading && !status?.durable && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 space-y-2">
            <div className="font-bold">Action Required to Prevent Data Loss on Render Updates:</div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Your backend is currently storing <code className="bg-amber-100 px-1.5 py-0.5 rounded">{status?.dbFile}</code> on a temporary container disk, which Render wipes on every code push.
              To permanently keep every user account, balance, deposit, trade, and profile picture across all future updates:
            </p>
            <ol className="list-decimal list-inside text-xs text-amber-900 space-y-1">
              <li>First, click <strong>Download Backup (.json)</strong> below to save your current accounts.</li>
              <li>In <strong>Vercel → Storage → Create Database</strong>, create a free <strong>Neon</strong> Postgres database (recommended — never expires, unlike Render Free Postgres which expires after 30 days) and copy its <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">DATABASE_URL</code>.</li>
              <li>Paste <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">DATABASE_URL</code> into <strong>Render → avapartner-api → Environment → Add Environment Variable</strong> and Save.</li>
              <li>After Render restarts, upload your <code className="bg-amber-100 px-1.5 py-0.5 rounded">.json</code> backup below once — from then on, all data stays permanently synced across every update.</li>
            </ol>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">Total Accounts</div>
            <div className="text-xl font-bold text-slate-900 font-mono">{status?.counts?.users ?? '-'}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">Total Balances</div>
            <div className="text-xl font-bold text-emerald-700 font-mono">
              ${Number(status?.counts?.totalBalance || 0).toFixed(2)}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">Trades (FX / Bin / Spot)</div>
            <div className="text-xl font-bold text-slate-900 font-mono">
              {(status?.counts?.trades ?? 0) + (status?.counts?.binary_trades ?? 0) + (status?.counts?.spot_orders ?? 0)}
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-xs text-slate-500">Payments / Logs</div>
            <div className="text-xl font-bold text-slate-900 font-mono">
              {status?.counts?.payment_requests ?? '-'} / {status?.counts?.activity_logs ?? '-'}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-xs text-slate-500 pt-1">
          <div>
            Schedule: <span className="font-mono font-semibold text-emerald-700">Every {status?.backupIntervalSeconds ?? 60}s Auto-Backup</span>
          </div>
          <div>
            Last Cloud Backup: <span className="font-mono text-slate-700">{status?.lastCloudBackupAt ? formatBdDateTime(status.lastCloudBackupAt, { includeSeconds: true, showZone: true }) : (status?.lastSyncAt ? formatBdDateTime(status.lastSyncAt, { includeSeconds: true, showZone: true }) : 'Never')}</span>
          </div>
          <div>
            Last Local Backup: <span className="font-mono text-slate-700">{status?.localBackup?.lastLocalBackupAt ? formatBdDateTime(status.localBackup.lastLocalBackupAt, { includeSeconds: true, showZone: true }) : 'Pending'}</span>
          </div>
        </div>
        {(status?.lastSyncError || status?.lastBackupError || status?.localBackup?.lastLocalBackupError) && (
          <div className="text-xs text-rose-600 font-medium">
            Error: {status?.lastSyncError || status?.lastBackupError || status?.localBackup?.lastLocalBackupError}
          </div>
        )}
      </div>

      {/* Backup & Restore Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Export &amp; Cloud Sync</h2>
          <p className="text-xs text-slate-600">
            Download a portable JSON snapshot of all users, balances, wallets, trades, deposits, and settings, run an immediate backup, or push immediately to your connected cloud database.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backingUp}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-60"
            >
              {backingUp ? 'Backing up...' : 'Backup Now'}
            </button>
            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={exporting}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition disabled:opacity-60"
            >
              {exporting ? 'Preparing...' : 'Download Backup (.json)'}
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || (!status?.hasDatabaseUrl && !status?.hasTursoUrl)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync to Cloud Now'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Restore Previous Data</h2>
          <p className="text-xs text-slate-600">
            Upload a previously exported <code className="bg-slate-100 px-1 rounded">.json</code> backup file to restore user accounts, balances, wallets, and history.
          </p>

          <div className="flex items-center gap-4 text-xs text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
              />
              <span><strong>Merge</strong> (Keep existing + restore missing)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
              />
              <span><strong>Replace All</strong></span>
            </label>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition disabled:opacity-60"
          >
            {importing ? 'Restoring...' : 'Upload & Restore Backup (.json)'}
          </button>
        </div>
      </div>

      {/* Every-Minute Cloud & Local Backup Log */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Every-Minute Backup Checkpoints</h2>
            <p className="text-xs text-slate-600">
              Automatic 60-second snapshot history ({status?.cloudBlobCount ?? 0} permanent cloud state snapshots · {status?.localBackup?.snapshotCount ?? 0} local JSON snapshots).
            </p>
          </div>
          <button
            type="button"
            onClick={loadStatus}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {history.cloudBackups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Users</th>
                  <th className="py-2 pr-3">Total Balance</th>
                  <th className="py-2 pr-3">Trades</th>
                  <th className="py-2 pr-3">Activities</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.cloudBackups.slice(0, 15).map((row) => (
                  <tr key={row.id || row.minute_bucket}>
                    <td className="py-2 pr-3 font-mono text-slate-700">
                      {formatBdDateTime(row.created_at || row.minute_bucket, { includeSeconds: true })}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.user_count}</td>
                    <td className="py-2 pr-3 font-mono">${Number(row.total_balance || 0).toFixed(2)}</td>
                    <td className="py-2 pr-3 font-mono">{row.trade_count}</td>
                    <td className="py-2 pr-3 font-mono">{row.activity_count}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${row.changed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {row.changed ? 'New Snapshot' : 'Verified'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={Boolean(restoringHash)}
                        onClick={() => handleRestoreCloudHash(row.snapshot_hash)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold disabled:opacity-50"
                      >
                        {restoringHash === row.snapshot_hash ? 'Restoring...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : history.localBackups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Local Checkpoint Time</th>
                  <th className="py-2 pr-3">Users</th>
                  <th className="py-2 pr-3">Total Balance</th>
                  <th className="py-2 pr-3">Trades</th>
                  <th className="py-2 pr-3">Activities</th>
                  <th className="py-2">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.localBackups.slice(0, 15).map((row, idx) => (
                  <tr key={`${row.ts}-${idx}`}>
                    <td className="py-2 pr-3 font-mono text-slate-700">
                      {formatBdDateTime(row.ts, { includeSeconds: true })}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.users}</td>
                    <td className="py-2 pr-3 font-mono">${Number(row.totalBalance || 0).toFixed(2)}</td>
                    <td className="py-2 pr-3 font-mono">{row.trades}</td>
                    <td className="py-2 pr-3 font-mono">{row.activities}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${row.changed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {row.changed ? 'New Snapshot' : 'Verified'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-slate-500">No minute checkpoints recorded yet.</div>
        )}
      </div>
    </div>
  )
}
