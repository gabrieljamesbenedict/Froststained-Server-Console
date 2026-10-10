import { useEffect, useState } from 'react';
import { api, toast } from '../api.js';

function fmtModified(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function Mods() {
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

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

  const toggleOne = async (mod) => {
    try {
      await api(`/api/mods/${encodeURIComponent(mod.file)}/${mod.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
      refresh();
    } catch (err) {
      toast('Failed', err.message, 'err');
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
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, flex: 1 }}>
        <input
          className="search"
          placeholder="Search"
          style={{ margin: '0 0 8px 0' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
        <div className="scroll">
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 64 }} /><col /><col style={{ width: 110 }} />
              <col style={{ width: 130 }} /><col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr><th>Enable</th><th>Name</th><th>Version</th><th>Last modified</th><th>Loader</th></tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.file}>
                  <td>
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
        <p className="muted">{visible.length} of {mods.count} mods · changes apply on restart</p>
      </div>
    </div>
  );
}
