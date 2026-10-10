import { useEffect, useRef, useState } from 'react';
import { api, toast } from '../api.js';

function fmtModified(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function Mods() {
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef(null);

  const refresh = async () => {
    try {
      const data = await api('/api/mods');
      setMods(data);
      setError('');
      setSelected((sel) => new Set([...sel].filter((f) => data.mods.some((m) => m.file === f))));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const toggleSelect = (file) => {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const toggleOne = async (mod) => {
    try {
      await api(`/api/mods/${encodeURIComponent(mod.file)}/${mod.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
      setDirty(true);
      refresh();
    } catch (err) {
      toast('Failed', err.message, 'err');
    }
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const form = new FormData();
      form.append('mod', file);
      const res = await fetch('/api/mods/upload', { method: 'POST', body: form });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `upload failed (${res.status})`);
      toast('Uploaded', out.file, 'ok');
      setDirty(true);
      refresh();
    } catch (err) {
      toast('Upload failed', err.message, 'err');
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) {
      toast('Nothing selected', 'Click a row to select it first', 'err');
      return;
    }
    if (!window.confirm(`Delete ${selected.size} mod(s)? The files are removed from the server.`)) return;
    let failed = 0;
    for (const file of selected) {
      try {
        await api(`/api/mods/${encodeURIComponent(file)}`, { method: 'DELETE' });
      } catch {
        failed += 1;
      }
    }
    if (failed) toast('Remove', `${failed} failed`, 'err');
    else toast('Removed', `${selected.size} mods`, 'ok');
    setSelected(new Set());
    setDirty(true);
    refresh();
  };

  const restart = async () => {
    try {
      await api('/api/server/restart', { method: 'POST' });
      toast('Server restarting', 'mod changes apply on boot', 'ok');
      setDirty(false);
    } catch (err) {
      toast('Restart failed', err.message, 'err');
    }
  };

  const visible = (mods?.mods ?? []).filter((m) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q);
  });

  if (!mods) return <div className="card"><h3>Mods</h3><p className="muted">Loading…</p></div>;

  return (
    <div className="card fill">
      <div className="rail" style={{ flex: 1, minHeight: 0 }}>
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <input
            className="search"
            placeholder="Search"
            style={{ margin: '0 0 8px 0' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
          {dirty && (
            <div style={{ borderLeft: '3px solid var(--warn)', padding: '8px 12px', marginBottom: 8, background: 'var(--bg)', borderRadius: '0 6px 6px 0' }}>
              Mod changes need a server restart to apply.{' '}
              <button onClick={restart}>Restart now</button>{' '}
              <button onClick={() => setDirty(false)}>Later</button>
            </div>
          )}
          <div className="scroll">
            <table style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 64 }} /><col /><col style={{ width: 130 }} />
                <col style={{ width: 150 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr><th>Enable</th><th>Name</th><th>Version</th><th>Last modified</th><th>Loader</th></tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.file}
                    onClick={() => toggleSelect(m.file)}
                    style={selected.has(m.file) ? { background: 'var(--border)', cursor: 'pointer' } : { cursor: 'pointer' }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={m.enabled} onChange={() => toggleOne(m)} title={m.enabled ? 'Disable' : 'Enable'} />
                    </td>
                    <td>
                      {m.name}<br /><span className="muted num">{m.file}</span>
                    </td>
                    <td className="num">{m.version ?? '?'}</td>
                    <td className="num">{fmtModified(m.mtimeMs)}</td>
                    <td>{m.loader}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">{visible.length} of {mods.count} mods{selected.size ? ` · ${selected.size} selected` : ''} · changes apply on restart</p>
        </div>
        <div className="side">
          <button onClick={() => fileRef.current?.click()}>Add File</button>
          <input ref={fileRef} type="file" accept=".jar" style={{ display: 'none' }} onChange={upload} />
          <button className="danger" onClick={removeSelected}>Remove{selected.size ? ` (${selected.size})` : ''}</button>
        </div>
      </div>
    </div>
  );
}
