import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function AuthForm({ mode, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onDone(user);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <h2>{mode === 'setup' ? 'Create admin account' : 'Sign in'}</h2>
      <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      <input
        placeholder="Password (8+ chars)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
      />
      {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      <button type="submit">{mode === 'setup' ? 'Create + sign in' : 'Sign in'}</button>
    </form>
  );
}

function Spark({ values, width = 220, height = 40 }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return <span style={{ fontSize: 12 }}>collecting…</span>;
  const max = Math.max(...pts, 1);
  const step = width / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}

export function MetricsView() {
  const [m, setM] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const data = await api('/api/metrics');
        if (alive) {
          setM(data);
          setError('');
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <p style={{ color: 'var(--stain)' }}>metrics: {error}</p>;
  if (!m?.system?.latest) return <p>Loading metrics…</p>;
  const s = m.system.latest;
  const hist = m.system.history;
  return (
    <section>
      <h2>Minecraft server</h2>
      {!m.process.running ? (
        <p>Server process not running.</p>
      ) : (
        <>
          <p>
            PID {m.process.rootPid}: CPU <strong>{m.process.totalCpuPct}%</strong> · RAM{' '}
            <strong>{m.process.totalMemMb} MB</strong> · threads <strong>{m.process.totalThreads}</strong>
          </p>
          <p style={{ fontSize: 12 }}>CPU% history</p>
          <Spark values={hist.map((h) => h.mcCpuPct)} />
          <p style={{ fontSize: 12 }}>RAM MB history</p>
          <Spark values={hist.map((h) => h.mcMemMb)} />
          <table>
            <thead>
              <tr>
                <th align="left">PID</th>
                <th align="left">Name</th>
                <th align="right">CPU%</th>
                <th align="right">RSS MB</th>
                <th align="right">Threads</th>
              </tr>
            </thead>
            <tbody>
              {m.process.processes.map((p) => (
                <tr key={p.pid}>
                  <td>{p.pid}</td>
                  <td>{p.name}</td>
                  <td align="right">{p.cpuPct}</td>
                  <td align="right">{p.memRssMb}</td>
                  <td align="right">{p.threads ?? '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Host</h2>
      <p>
        CPU <strong>{s.cpu.loadPct}%</strong> · RAM <strong>{s.mem.usedMb}/{s.mem.totalMb} MB ({s.mem.usedPct}%)</strong> ·
        uptime <strong>{Math.round(s.uptimeSec / 3600)}h</strong>
      </p>
      <h3>Players ({m.server.players.count})</h3>
      {m.server.players.count > 0 && <p>{m.server.players.players.map((p) => p.name).join(', ')}</p>}
      <h3>Network (KB/s)</h3>
      <ul>
        {s.net.map((n) => (
          <li key={n.iface}>{n.iface}: ↓{n.rxSecKb} ↑{n.txSecKb}</li>
        ))}
      </ul>
    </section>
  );
}

export function Players() {
  const [players, setPlayers] = useState({ count: 0, players: [], rconConfigured: false });
  const [rcon, setRcon] = useState(null);
  const [name, setName] = useState('');
  const [action, setAction] = useState('kick');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const refresh = async () => {
    try {
      setPlayers(await api('/api/players'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshRcon = async () => {
    try {
      setRcon(await api('/api/rcon/status'));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
    refreshRcon();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, []);

  const act = async (route, body) => {
    setError('');
    setResult('');
    try {
      const r = await api(`/api/players/${route}`, { method: 'POST', body: JSON.stringify(body) });
      setResult(r.response || 'ok');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) act(action, { name: name.trim(), reason });
  };

  return (
    <section>
      <h2>Players ({players.count} online)</h2>
      {rcon && !rcon.configured && (
        <p>RCON not configured: set <code>rcon.password</code> and <code>enable-rcon=true</code> on the MC server.</p>
      )}
      {rcon?.configured && (
        <p style={{ fontSize: 12 }}>
          RCON {rcon.reachable ? 'reachable' : 'unreachable'} <button onClick={refreshRcon}>Recheck</button>
        </p>
      )}
      {players.players.length > 0 && (
        <ul>
          {players.players.map((p) => (
            <li key={p.name}>
              {p.name} <button onClick={() => act('kick', { name: p.name, reason: 'Kicked by admin' })}>Kick</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {['kick', 'ban', 'pardon', 'op', 'deop', 'whitelist-add', 'whitelist-remove'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="submit">Run</button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (message.trim()) act('say', { message });
          setMessage('');
        }}
        style={{ display: 'flex', gap: 8, marginTop: 8 }}
      >
        <input placeholder="Broadcast message" value={message} onChange={(e) => setMessage(e.target.value)} style={{ flex: 1 }} />
        <button type="submit">Say</button>
      </form>
      {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      {result && <p style={{ color: 'var(--ok)' }}>{result}</p>}
    </section>
  );
}

export function Mods() {
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState({});
  const [file, setFile] = useState(null);

  const refresh = async () => {
    try {
      setMods(await api('/api/mods'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const toggle = async (m) => {
    setError('');
    try {
      await api(`/api/mods/${encodeURIComponent(m.file)}/${m.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete ${m.file}?`)) return;
    setError('');
    try {
      await api(`/api/mods/${encodeURIComponent(m.file)}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const check = async (m) => {
    try {
      const r = await api(`/api/mods/${encodeURIComponent(m.file)}/updates`);
      const mr = r.modrinth?.error ? `modrinth: ${r.modrinth.error}` : `modrinth: ${r.modrinth.installedVersion} → ${r.modrinth.latestVersion}${r.modrinth.upToDate ? ' (current)' : ' (UPDATE)'}`;
      const cf = r.curseforge?.skipped ? `cf: ${r.curseforge.skipped}` : r.curseforge?.error ? `cf: ${r.curseforge.error}` : `cf: ${r.curseforge.latestFile || 'not found'}`;
      setChecks((c) => ({ ...c, [m.file]: `${mr}; ${cf}` }));
    } catch (err) {
      setChecks((c) => ({ ...c, [m.file]: err.message }));
    }
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    try {
      const form = new FormData();
      form.append('mod', file);
      const res = await fetch('/api/mods/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `upload failed (${res.status})`);
      setFile(null);
      e.target.reset();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!mods) return <section><h2>Mods</h2><p>Loading…</p></section>;
  return (
    <section>
      <h2>Mods ({mods.count})</h2>
      <form onSubmit={upload} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="file" accept=".jar" onChange={(e) => setFile(e.target.files[0])} />
        <button type="submit">Upload</button>
        <button type="button" onClick={refresh}>Refresh</button>
      </form>
      {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      <table>
        <thead>
          <tr>
            <th align="left">Mod</th>
            <th align="left">Version</th>
            <th align="left">Loader</th>
            <th align="right">KB</th>
            <th align="left">State</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mods.mods.map((m) => (
            <tr key={m.file}>
              <td>{m.name}</td>
              <td>{m.version ?? '?'}</td>
              <td>{m.loader}</td>
              <td align="right">{m.sizeKb}</td>
              <td>{m.enabled ? 'on' : 'off'}</td>
              <td>
                <button onClick={() => toggle(m)}>{m.enabled ? 'Disable' : 'Enable'}</button>{' '}
                <button onClick={() => remove(m)}>Delete</button>{' '}
                <button onClick={() => check(m)}>Updates</button>
                {checks[m.file] && <div style={{ fontSize: 12 }}>{checks[m.file]}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12 }}>Mod changes apply on server restart. Update checks need <code>minecraft_version</code> in console config.</p>
    </section>
  );
}

export function Backups() {
  const [data, setData] = useState(null);
  const [sched, setSched] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setData(await api('/api/backups'));
      setSched(await api('/api/schedule'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/backups', { method: 'POST' });
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f) => {
    if (!window.confirm(`Delete ${f}?`)) return;
    setError('');
    try {
      await api(`/api/backups/${encodeURIComponent(f)}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const restore = async (f) => {
    if (!window.confirm(`Restore ${f}? The server must be stopped; the current world is overwritten (a safety snapshot is kept).`)) return;
    setError('');
    try {
      await api(`/api/backups/${encodeURIComponent(f)}/restore`, { method: 'POST' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data) return <section><h2>Backups</h2><p>Loading…</p></section>;
  return (
    <section>
      <h2>Backups ({data.count})</h2>
      <button onClick={create} disabled={busy}>{busy ? 'Backing up…' : 'Create backup'}</button>{' '}
      <button onClick={refresh}>Refresh</button>
      {sched && (
        <p style={{ fontSize: 12 }}>
          Schedule: backup every {sched.backupEveryHours || 'off'}h · restart at {sched.restartDailyAt || 'off'}
          {sched.lastBackupError && <span style={{ color: 'var(--stain)' }}> · last error: {sched.lastBackupError}</span>}
        </p>
      )}
      {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      <table>
        <thead><tr><th>File</th><th>Size</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {data.backups.map((b) => (
            <tr key={b.file}>
              <td>{b.file}</td>
              <td>{Math.round(b.sizeKb / 1024)} MB</td>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td align="right">
                <a href={`/api/backups/${encodeURIComponent(b.file)}/download`}>Download</a>{' '}
                <button onClick={() => restore(b.file)}>Restore</button>{' '}
                <button className="danger" onClick={() => remove(b.file)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (next !== confirm) {
      setMsg('new passwords do not match');
      return;
    }
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setMsg('password changed - other sessions signed out');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setMsg(err.message);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input placeholder="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input placeholder="New password (8+ chars)" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <input placeholder="Confirm new" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      <button type="submit" className="primary">Change password</button>
      {msg && <span style={{ fontSize: 12 }}>{msg}</span>}
    </form>
  );
}
