import { useEffect, useState } from 'react';
import { api, formatAgo, formatBytes, humanizeActivity, logClass, toast } from '../api.js';

function usePoll(fn, ms, deps = []) {
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        await fn(alive);
      } catch {
        // views surface their own errors
      }
    };
    run();
    const t = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function ServerControl({ onChange }) {
  const [status, setStatus] = useState({ state: 'unknown' });

  usePoll(async (alive) => {
    const s = await api('/api/server/status');
    if (alive) {
      setStatus(s);
      onChange?.(s);
    }
  }, 5000);

  const action = async (name, body) => {
    try {
      const s = await api(`/api/server/${name}`, body ? { method: 'POST', body } : { method: 'POST' });
      if (s.state) setStatus(s);
      if (s.stopResult && s.stopResult !== 'graceful') {
        toast(`${name}: ${s.stopResult}`, 'not a clean shutdown', 'err');
      } else {
        toast(`Server ${name}`, name === 'start' ? 'booting…' : 'done', 'ok');
      }
      onChange?.(s);
    } catch (err) {
      toast(`${name} failed`, err.message, 'err');
    }
  };

  return (
    <div className="card span6 control-card">
      <h3>Server control</h3>
      <div className="row" style={{ marginTop: 0 }}>
        <button className="primary" style={{ flex: 1 }} onClick={() => action('start')}>Start server</button>
        <button style={{ flex: 1 }} onClick={() => action('stop')}>Stop</button>
        <button style={{ flex: 1 }} onClick={() => action('restart')}>Restart</button>
        <button className="danger" style={{ flex: 1 }} onClick={() => action('kill')}>Force stop</button>
      </div>
    </div>
  );
}

export default function Dashboard({ go }) {
  const [status, setStatus] = useState({ state: 'unknown' });
  const [metrics, setMetrics] = useState(null);
  const [tail, setTail] = useState([]);
  const [activity, setActivity] = useState([]);
  const [sched, setSched] = useState(null);
  const [backups, setBackups] = useState(null);
  const [world, setWorld] = useState(null);
  // Filled by the Mods view after an update check; null hides the alert.
  const [modUpdates, setModUpdates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('frost-mod-updates'));
    } catch {
      return null;
    }
  });

  usePoll(async (alive) => {
    const m = await api('/api/metrics');
    if (alive) setMetrics(m);
  }, 5000);

  usePoll(async (alive) => {
    const l = await api('/api/server/log?lines=30');
    if (alive) setTail(l.lines);
  }, 5000);

  usePoll(async (alive) => {
    const a = await api('/api/audit?limit=8');
    if (alive) {
      setActivity(a.entries);
      try {
        setModUpdates(JSON.parse(localStorage.getItem('frost-mod-updates')));
      } catch {
        // private mode: update alert just stays hidden
      }
    }
  }, 15000);

  usePoll(async (alive) => {
    const [sc, b] = await Promise.all([api('/api/schedule'), api('/api/backups')]);
    if (alive) {
      setSched(sc);
      setBackups(b);
    }
  }, 30000);

  usePoll(async (alive) => {
    const w = await api('/api/server/world').catch(() => null);
    if (alive) setWorld(w);
  }, 60000);

  const s = metrics?.system?.latest;
  const players = metrics?.server?.players;
  const latestBackup = backups?.backups?.[0];

  const alerts = [];
  if (status.state === 'stopped') {
    alerts.push(<div className="alert" key="stopped">Server is stopped.</div>);
  }
  if (sched?.lastBackupError) {
    alerts.push(<div className="alert err" key="backup-err">Last scheduled backup failed: {sched.lastBackupError}</div>);
  }
  if (modUpdates?.count > 0) {
    alerts.push(
      <div className="alert" key="mods">
        {modUpdates.summary}{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); go('mods'); }} style={{ color: 'var(--accent)' }}>Review</a>
      </div>,
    );
  }
  if (latestBackup && !sched?.lastBackupError) {
    alerts.push(
      <div className="alert ok" key="backup-ok">
        Backup ran {formatAgo(latestBackup.createdAt)} · {formatBytes(Math.round(latestBackup.sizeKb / 1024))}
      </div>,
    );
  }

  return (
    <div className="grid">
      <ServerControl onChange={setStatus} />
      <div className="card span6">
        <h3>Attention</h3>
        {alerts.length > 0 ? alerts : metrics === null ? (
          <div className="muted">Checking…</div>
        ) : (
          <div className="alert ok">All clear — server {status.state}, {players?.count ?? 0} players online.</div>
        )}
      </div>
      <div className="card span6">
        <h3>Server</h3>
        <table><tbody>
          <tr><td>State</td><td className="num">{status.state}{status.pid ? ` · pid ${status.pid}` : ''}</td></tr>
          <tr><td>Players</td><td className="num">{players?.count ?? '…'}</td></tr>
          <tr><td>RAM</td><td className="num">{s ? `${formatBytes(s.mem.usedMb)} / ${formatBytes(s.mem.totalMb)}` : '…'}</td></tr>
          <tr><td>CPU</td><td className="num">{s ? `${s.cpu.loadPct}%` : '…'}</td></tr>
          <tr><td>World</td><td className="num">{world ? `${world.world} · ${formatBytes(Math.round(world.sizeKb / 1024))}` : '…'}</td></tr>
        </tbody></table>
      </div>
      <div className="card span6">
        <h3>Activity</h3>
        {activity.length === 0 ? (
          <div className="muted">No recent activity.</div>
        ) : (
          activity.map((a) => (
            <div className="muted" key={a.id}>
              {new Date(a.created_at).toLocaleTimeString()} {humanizeActivity(a)}
            </div>
          ))
        )}
      </div>
      <div className="card span12">
        <h3>Live tail</h3>
        <div className="term" id="logtail">
          {tail.map((l, i) => (
            <div key={i} className={logClass(l.line) || undefined}>{l.line}</div>
          ))}
        </div>
        <p className="muted"><a href="#" onClick={(e) => { e.preventDefault(); go('console'); }} style={{ color: 'var(--accent)' }}>Open full console</a></p>
      </div>
    </div>
  );
}
