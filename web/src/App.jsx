import { useEffect, useState } from 'react';

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
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
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Froststained Server Console</h1>
      {state.needsSetup ? (
        <AuthForm mode="setup" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      ) : state.user ? (
        <>
          <p>Signed in as <strong>{state.user.username}</strong> ({state.user.role})</p>
          <button onClick={logout}>Sign out</button>
          <p>Phase 1 online. Console, metrics and mods land in later phases.</p>
        </>
      ) : (
        <AuthForm mode="login" onDone={(user) => setState({ loading: false, needsSetup: false, user })} />
      )}
    </main>
  );
}
