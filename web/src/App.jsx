import { useEffect, useRef, useState } from 'react';

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
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
  return (
    <section>
      <h2>Metrics</h2>
      <p>
        CPU <strong>{s.cpu.loadPct}%</strong> · RAM <strong>{s.mem.usedMb}/{s.mem.totalMb} MB ({s.mem.usedPct}%)</strong> ·
        Host uptime <strong>{Math.round(s.uptimeSec / 3600)}h</strong> · Players <strong>{m.server.players.count}</strong>
      </p>
      {m.server.players.count > 0 && <p>{m.server.players.players.map((p) => p.name).join(', ')}</p>}
      <h3>Disks</h3>
      <ul>
        {s.disks.map((d) => (
          <li key={d.mount + d.fs}>{d.mount} ({d.fs}): {d.usedPct}% of {Math.round(d.sizeMb / 1024)} GB</li>
        ))}
      </ul>
      <h3>Network (KB/s)</h3>
      <ul>
        {s.net.map((n) => (
          <li key={n.iface}>{n.iface}: ↓{n.rxSecKb} ↑{n.txSecKb}</li>
        ))}
      </ul>
      <h3>MC process</h3>
      {!m.process.running ? (
        <p>Server process not running.</p>
      ) : (
        <>
          <p>
            PID {m.process.rootPid}: CPU <strong>{m.process.totalCpuPct}%</strong> · RAM{' '}
            <strong>{m.process.totalMemMb} MB</strong> · threads <strong>{m.process.totalThreads}</strong>
          </p>
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
      setRcon(await api('/api/rcon/status'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
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
          <Console />
          <Players />
          <Dashboard />
        </>
      ) : (
        <AuthForm mode="login" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      )}
    </main>
  );
}
