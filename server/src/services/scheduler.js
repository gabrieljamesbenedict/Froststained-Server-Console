// Simple interval scheduler: periodic world backups and one daily restart.
// State is in-memory (last run times reset on console restart); the tick runs
// every 60s. Backup skips when the server runs without RCON; restart only
// fires while the server runs and at most once per day after the set time.
export class Scheduler {
  constructor({ backupEveryHours, restartDailyAt }) {
    this.backupEveryMs = (Number(backupEveryHours) || 0) * 3600000;
    this.restartDailyAt = restartDailyAt || '';
    this.lastBackupAt = null;
    this.lastRestartAt = null;
    this.timer = null;
  }

  start(deps) {
    this.deps = deps;
    // Don't fire immediately on boot: anchor "last" to now when enabling.
    if (this.backupEveryMs > 0 && !this.lastBackupAt) this.lastBackupAt = Date.now();
    this.timer = setInterval(() => void this.tick().catch(() => {}), 60000);
    if (this.timer.unref) this.timer.unref();
  }

  dueBackup(now) {
    return this.backupEveryMs > 0 && now - (this.lastBackupAt ?? now) >= this.backupEveryMs;
  }

  dueRestart(now) {
    if (!/^\d{2}:\d{2}$/.test(this.restartDailyAt)) return false;
    const [h, m] = this.restartDailyAt.split(':').map(Number);
    if (h > 23 || m > 59) return false;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    const sameDay = (a, b) => {
      const x = new Date(a);
      const y = new Date(b);
      return x.toDateString() === y.toDateString();
    };
    return now >= d.getTime() && !(this.lastRestartAt && sameDay(this.lastRestartAt, now));
  }

  async tick(now = Date.now()) {
    const { config, mc, rcon, db, createBackup } = this.deps;
    if (this.dueBackup(now)) {
      this.lastBackupAt = now;
      try {
        const info = await createBackup({ serverPath: config.serverPath, backupDir: config.backupDir, mc, rcon });
        dbAudit(db, `scheduled backup ${info.file}`);
      } catch {
        // skipped (e.g. live without RCON): retry next tick window
        this.lastBackupAt = now;
      }
    }
    if (this.dueRestart(now) && mc.status().state === 'running') {
      this.lastRestartAt = now;
      const stopped = await mc.stop();
      if (mc.status().state === 'stopped') {
        await mc.start();
        dbAudit(db, `scheduled restart (stop: ${stopped.stopResult})`);
      }
    }
  }

  status() {
    return {
      backupEveryHours: this.backupEveryMs / 3600000,
      restartDailyAt: this.restartDailyAt,
      lastBackupAt: this.lastBackupAt,
      lastRestartAt: this.lastRestartAt,
      nextBackupAt: this.backupEveryMs > 0 && this.lastBackupAt ? this.lastBackupAt + this.backupEveryMs : null,
    };
  }
}

function dbAudit(db, detail) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (NULL, ?, ?, ?)').run(
      'schedule.run',
      detail,
      Date.now(),
    );
  } catch {
    // audit must never break the schedule
  }
}
