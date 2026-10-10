import { useEffect, useState } from 'react';
import { api, formatBytes, humanizeActivity, LIMITS, logClass, POLL, toast } from '../api.js';

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
  }, deps);
}

function ServerControl({ onChange }) {
  const [, setStatus] = useState({ state: 'unknown' });

  usePoll(async (alive) => {
    const s = await api('/api/server/status');
    if (alive) {
      setStatus(s);
      onChange?.(s);
    }
  }, POLL.fast);

  const action = async (name) => {
    try {
      const s = await api(`/api/server/${name}`, { method: 'POST' });
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
  const [world, setWorld] = useState(null);

  usePoll(async (alive) => {
    const m = await api('/api/metrics');
    if (alive) setMetrics(m);
  }, POLL.fast);

  usePoll(async (alive) => {
    const l = await api(`/api/server/log?lines=${LIMITS.logTail}`);
    if (alive) setTail(l.lines);
  }, POLL.fast);

  usePoll(async (alive) => {
    const a = await api(`/api/audit?limit=${LIMITS.auditFeed}`);
    if (alive) setActivity(a.entries);
  }, POLL.activity);

  usePoll(async (alive) => {
    const w = await api('/api/server/world').catch(() => null);
    if (alive) setWorld(w);
  }, POLL.world);

  const s = metrics?.system?.latest;
  const players = metrics?.server?.players;

  return (
    <div className="grid">
      <ServerControl onChange={setStatus} />
      <div className="card span6 span2rows">
        <h3>Activity</h3>
        <div style={{ overflowY: 'auto', minHeight: 120 }}>
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
