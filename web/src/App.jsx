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
          <Dashboard />
        </>
      ) : (
        <AuthForm mode="login" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      )}
    </main>
  );
}
