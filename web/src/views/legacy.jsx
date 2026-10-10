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
