import { useEffect, useState } from 'react';
import { api, toast } from '../api.js';

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

  const download = async (e, b) => {
    e.preventDefault();
    const url = `/api/backups/${encodeURIComponent(b.file)}/download`;
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error(`download failed (${head.status})`);
    } catch (err) {
      toast('Download failed', err.message, 'err');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = b.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  if (!data) return <section><p className="muted">Loading…</p></section>;
  return (
    <section>
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
                <a href={`/api/backups/${encodeURIComponent(b.file)}/download`} onClick={(e) => download(e, b)}>Download</a>{' '}
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
