import { useEffect, useRef, useState } from 'react';

async function api(path, options = {}) {
  const { body, ...rest } = options;
  const init = { ...rest };
  if (body !== undefined) {
    // Only claim JSON when a body exists: Fastify 400s empty bodies sent
    // with Content-Type: application/json (broke all bodyless POSTs).
    init.headers = { 'Content-Type': 'application/json', ...rest.headers };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/console`;
}

function AuthForm({ mode, onDone }) {
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
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <button type="submit">{mode === 'setup' ? 'Create + sign in' : 'Sign in'}</button>
    </form>
  );
}

function Console() {
  const [status, setStatus] = useState({ state: 'unknown' });
  const [lines, setLines] = useState([]);
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const logRef = useRef(null);

  const pushLines = (next) =>
    setLines((prev) => [...prev, ...next].slice(-500));

  useEffect(() => {
    let ws;
    let alive = true;
    let retry;
    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'history') pushLines(msg.lines);
        else if (msg.type === 'line') pushLines([{ t: msg.t, stream: msg.stream, line: msg.line }]);
        else if (msg.type === 'status') setStatus(msg.status);
      };
      ws.onclose = () => {
        if (alive) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    const poll = setInterval(async () => {
      try {
        setStatus(await api('/api/server/status'));
      } catch {
        /* ws status messages cover disconnects */
      }
    }, 5000);
    return () => {
      alive = false;
      clearTimeout(retry);
      clearInterval(poll);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines]);

  const action = async (name, body) => {
    setError('');
    setNotice('');
    try {
      const s = await api(`/api/server/${name}`, body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'POST' });
      if (s.state) setStatus(s);
      if (s.stopResult && s.stopResult !== 'graceful') setNotice(`${name}: ${s.stopResult} (not a clean shutdown)`);
    } catch (err) {
      setError(err.message);
    }
  };

  const sendCommand = (e) => {
    e.preventDefault();
    if (command.trim()) action('command', { command });
    setCommand('');
  };

  return (
    <section>
      <h2>Server</h2>
      <p>
        State: <strong>{status.state}</strong>
        {status.pid ? ` (pid ${status.pid})` : ''}
        {status.lastExit ? ` - last exit: ${JSON.stringify(status.lastExit)}` : ''}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => action('start')}>Start</button>
        <button onClick={() => action('stop')}>Stop</button>
        <button onClick={() => action('restart')}>Restart</button>
        <button onClick={() => action('kill')}>Kill</button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {notice && <p style={{ color: 'darkorange' }}>{notice}</p>}
      <form onSubmit={sendCommand} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          placeholder="Console command (e.g. list)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">Send</button>
      </form>
      <pre
        ref={logRef}
        style={{ background: '#111', color: '#ddd', padding: 12, height: 320, overflowY: 'auto', fontSize: 12 }}
      >
        {lines.map((l, i) => (
          <div key={i}>{l.line}</div>
        ))}
      </pre>
    </section>
  );
}

function Spark({ values, width = 220, height = 40 }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return <span style={{ fontSize: 12 }}>collecting…</span>;
  const max = Math.max(...pts, 1);
  const step = width / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (v / max) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ background: '#f4f4f4', display: 'block' }}>
      <path d={d} fill="none" stroke="#333" strokeWidth="1.5" />
    </svg>
  );
}

function Dashboard() {
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

  if (error) return <p style={{ color: 'crimson' }}>metrics: {error}</p>;
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

function Players() {
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
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && <p style={{ color: 'green' }}>{result}</p>}
    </section>
  );
}

function Mods() {
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
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
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

function Backups() {
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
          {sched.lastBackupError && <span style={{ color: 'crimson' }}> · last error: {sched.lastBackupError}</span>}
        </p>
      )}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <ul>
        {data.backups.map((b) => (
          <li key={b.file}>
            {b.file} ({Math.round(b.sizeKb / 1024)} MB){' '}
            <a href={`/api/backups/${encodeURIComponent(b.file)}/download`}>Download</a>{' '}
            <button onClick={() => restore(b.file)}>Restore</button>{' '}
            <button onClick={() => remove(b.file)}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PasswordForm() {
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
      <button type="submit">Change password</button>
      {msg && <span style={{ fontSize: 12 }}>{msg}</span>}
    </form>
  );
}

export default function App() {
  const [state, setState] = useState({ loading: true, needsSetup: false, user: null });

  useEffect(() => {
    (async () => {
      try {
        const { needsSetup } = await api('/api/auth/status');
        if (needsSetup) return setState({ loading: false, needsSetup: true, user: null });
        const user = await api('/api/auth/me').catch(() => null);
        setState({ loading: false, needsSetup: false, user });
      } catch {
        setState({ loading: false, needsSetup: false, user: null, backendDown: true });
      }
    })();
  }, []);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, needsSetup: false, user: null });
  };

  if (state.loading) return <main style={{ padding: 24 }}>Loading…</main>;
  if (state.backendDown) return <main style={{ padding: 24 }}>Backend unreachable. Start it with <code>npm run dev:server</code>.</main>;

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 960 }}>
      <h1>Froststained Server Console</h1>
      {state.needsSetup ? (
        <AuthForm mode="setup" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      ) : state.user ? (
        <>
          <p>
            Signed in as <strong>{state.user.username}</strong> ({state.user.role}){' '}
            <button onClick={logout}>Sign out</button>
          </p>
          <PasswordForm />
          <Console />
          <Players />
          <Mods />
          <Backups />
          <Dashboard />
        </>
      ) : (
        <AuthForm mode="login" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      )}
    </main>
  );
}
