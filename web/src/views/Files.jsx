import { useEffect, useRef, useState } from 'react';
import { api, formatAgo, toast } from '../api.js';

function formatSize(e) {
  if (e.dir || e.sizeB == null) return '—';
  if (e.sizeB < 1024) return `${e.sizeB} B`;
  if (e.sizeB < 1048576) return `${Math.round((e.sizeB / 1024) * 10) / 10} KB`;
  return `${Math.round((e.sizeB / 1048576) * 10) / 10} MB`;
}

export default function Files() {
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);
  const fileRef = useRef(null);

  const refresh = async (p = path) => {
    try {
      setData(await api(`/api/files?path=${encodeURIComponent(p)}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, [path]);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const openEntry = async (entry) => {
    setMenu(null);
    if (entry.dir) {
      setPath(entry.path);
      return;
    }
    try {
      const f = await api(`/api/files/content?path=${encodeURIComponent(entry.path)}`);
      setEditing(f);
      setDraft(f.content);
    } catch (err) {
      toast('Cannot open', err.message, 'err');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/api/files/content', { method: 'PUT', body: { path: editing.path, content: draft } });
      toast('File saved', 'Backup kept · restart to apply', 'ok');
      setEditing(null);
      refresh();
    } catch (err) {
      toast('Save failed', err.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const download = (entry) => {
    setMenu(null);
    const a = document.createElement('a');
    a.href = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const rename = async (entry) => {
    setMenu(null);
    const next = window.prompt('Rename to', entry.name);
    if (!next || next === entry.name) return;
    const dir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    try {
      await api('/api/files/rename', { method: 'POST', body: { from: entry.path, to: dir ? `${dir}/${next}` : next } });
      toast('Renamed', `${entry.name} → ${next}`, 'ok');
      refresh();
    } catch (err) {
      toast('Rename failed', err.message, 'err');
    }
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/files/upload?path=${encodeURIComponent(path)}`, { method: 'POST', body: form });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `upload failed (${res.status})`);
      toast('Uploaded', out.path, 'ok');
      refresh();
    } catch (err) {
      toast('Upload failed', err.message, 'err');
    }
  };

  const crumbs = path ? path.split('/') : [];

  return (
    <>
      <div className="card">
        <div className="row" style={{ margin: '0 0 8px 0' }}>
          <span className="crumb" style={{ margin: 0 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); setPath(''); }}>server</a>
            {crumbs.map((c, i) => (
              <span key={i}>
                {' / '}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPath(crumbs.slice(0, i + 1).join('/')); }}
                >
                  {c}
                </a>
              </span>
            ))}
            {' /'}
          </span>
          <span className="spacer"></span>
          <button className="primary" onClick={() => fileRef.current?.click()}>Upload</button>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={upload} />
        </div>
        {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
        {!data ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th className="num">Size</th><th>Modified</th><th></th></tr></thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.path} onClick={() => entry.dir && setPath(entry.path)} style={entry.dir ? { cursor: 'pointer' } : undefined}>
                  <td>{entry.dir ? '📁' : '📄'} {entry.name}</td>
                  <td className="num">{formatSize(entry)}</td>
                  <td className="num">{entry.mtimeMs ? formatAgo(entry.mtimeMs) : '—'}</td>
                  <td align="right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ entry, top: r.bottom + 4, left: Math.max(8, r.left - 130) });
                      }}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.entries.length === 0 && <p className="muted">Empty folder.</p>}
        {menu && (
          <div className="menu open" ref={menuRef} style={{ top: menu.top, left: menu.left }}>
            <button onClick={() => openEntry(menu.entry)}>Open</button>
            {!menu.entry.dir && <button onClick={() => download(menu.entry)}>Download</button>}
            <button onClick={() => rename(menu.entry)}>Rename</button>
          </div>
        )}
      </div>
      {editing && (
        <div className="modalback open" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="card modal">
            <h3>{editing.path}</h3>
            <textarea className="code" spellCheck="false" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="row">
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)}>Close</button>
              <span className="muted">
                Text files under {(() => {
                  const cap = editing.maxBytes ?? 1048576;
                  return cap >= 1048576 ? `${cap / 1048576} MB` : `${Math.round(cap / 1024)} KB`;
                })()}. Original kept as .bak.
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
