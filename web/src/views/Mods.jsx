import { useEffect, useRef, useState } from 'react';
import { api, LIMITS, toast } from '../api.js';

function fmtModified(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function providerOf(check) {
  if (!check) return '…';
  const mr = check.modrinth && !check.modrinth.error && check.modrinth.projectId;
  const cf = check.curseforge && check.curseforge.found;
  if (mr && cf) return 'Modrinth · CF';
  if (mr) return 'Modrinth';
  if (cf) return 'CurseForge';
  return '—';
}

function updateOf(check) {
  const mr = check?.modrinth;
  if (mr && !mr.error && mr.latestVersion && mr.upToDate === false) {
    return { label: '1 update', version: mr.latestVersion };
  }
  return null;
}

function homeOf(check) {
  return check?.modrinth?.url ?? check?.curseforge?.url ?? null;
}

export default function Mods() {
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState(null);
  const [dl, setDl] = useState(null);
  const fileRef = useRef(null);
  const checkRun = useRef(0);

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

  const setEnabled = async (mod, enable) => {
    await api(`/api/mods/${encodeURIComponent(mod.file)}/${enable ? 'enable' : 'disable'}`, { method: 'POST' });
  };

  const toggleOne = async (mod) => {
    try {
      await setEnabled(mod, !mod.enabled);
      refresh();
    } catch (err) {
      toast('Failed', err.message, 'err');
    }
  };

  const bulk = async (fn, label, emptyHint = 'Click a row to select it first') => {
    if (selected.size === 0) {
      toast('Nothing selected', emptyHint, 'err');
      return;
    }
    let failed = 0;
    for (const file of selected) {
      try {
        await fn(file);
      } catch {
        failed += 1;
      }
    }
    if (failed) toast(label, `${failed} failed`, 'err');
    else toast(label, `${selected.size} mods`, 'ok');
    setSelected(new Set());
    refresh();
  };

  const removeSelected = () => {
    if (selected.size === 0) {
      toast('Nothing selected', 'Click a row to select it first', 'err');
      return;
    }
    if (!window.confirm(`Delete ${selected.size} mod(s)? The files are removed from the server.`)) return;
    bulk((file) => api(`/api/mods/${encodeURIComponent(file)}`, { method: 'DELETE' }), 'Removed');
  };

  const checkAll = async () => {
    if (!mods || checking) return;
    const run = ++checkRun.current;
    const list = mods.mods;
    setChecking({ done: 0, total: list.length });
    const queue = [...list];
    const workers = Array.from({ length: LIMITS.modCheckConcurrency }, async () => {
      while (queue.length && checkRun.current === run) {
        const mod = queue.shift();
        try {
          const r = await api(`/api/mods/${encodeURIComponent(mod.file)}/updates`);
          if (checkRun.current === run) {
            setChecks((c) => ({ ...c, [mod.file]: r }));
            setChecking((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        } catch {
          if (checkRun.current === run) {
            setChecks((c) => ({ ...c, [mod.file]: { error: true } }));
            setChecking((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        }
      }
    });
    await Promise.all(workers);
    if (checkRun.current !== run) return;
    setChecking(null);
    setChecks((c) => {
      const ups = Object.entries(c).filter(([f, r]) => list.some((m) => m.file === f) && updateOf(r));
      toast('Update check', ups.length ? `${ups.length} update${ups.length > 1 ? 's' : ''} available` : `${list.length} mods checked, all current`, ups.length ? '' : 'ok');
      return c;
    });
  };

  const installUpdate = async (mod) => {
    const check = checks[mod.file];
    const upd = updateOf(check);
    if (!upd) return;
    try {
      const { versions } = await api(
        `/api/mods/versions?source=modrinth&id=${encodeURIComponent(check.modrinth.projectId)}`,
      );
      const match = versions.find((v) => v.versionNumber === upd.version);
      if (!match) throw new Error('latest version not listed');
      await api('/api/mods/install', { method: 'POST', body: { source: 'modrinth', id: check.modrinth.projectId, versionId: match.id } });
      toast('Updated', `${mod.name} → ${upd.version}`, 'ok');
      refresh();
    } catch (err) {
      toast('Update failed', err.message, 'err');
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
      refresh();
    } catch (err) {
      toast('Upload failed', err.message, 'err');
    }
  };

  const exportList = async () => {
    try {
      const { text } = await api('/api/mods/export');
      await navigator.clipboard.writeText(text);
      toast('Exported', 'Mod list copied', 'ok');
    } catch (err) {
      toast('Export failed', err.message, 'err');
    }
  };

  const viewHomepage = () => {
    if (selected.size !== 1) {
      toast('Select one mod', 'Tick a single checkbox first', 'err');
      return;
    }
    const url = homeOf(checks[[...selected][0]]);
    if (!url) {
      toast('No page known', 'Run Check for Updates first', 'err');
      return;
    }
    window.open(url, '_blank', 'noopener');
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
          <div className="scroll">
            <table style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 64 }} /><col /><col style={{ width: 110 }} />
                <col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr><th>Enable</th><th>Name</th><th>Version</th><th>Last modified</th><th>Provider</th><th>Loader</th></tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const upd = updateOf(checks[m.file]);
                  return (
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
                      <td>
                        {checks[m.file] ? providerOf(checks[m.file]) : <span className="muted">…</span>}
                        {upd && (
                          <> <button onClick={() => installUpdate(m)} title={`Install ${upd.version}`}>{upd.label}</button></>
                        )}
                      </td>
                      <td>{m.loader}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {visible.length} of {mods.count} mods{selected.size ? ` · ${selected.size} selected` : ''} · changes apply on restart
            {checking ? ` · checking ${checking.done}/${checking.total}…` : ''}
          </p>
        </div>
        <div className="side">
          <button onClick={() => setDl({ source: 'modrinth', q: '', hits: null, picked: null, versions: null, busy: false })}>Download Mods</button>
          <button onClick={checkAll} disabled={!!checking}>{checking ? `Checking ${checking.done}/${checking.total}…` : 'Check for Updates'}</button>
          <button onClick={() => fileRef.current?.click()}>Add File</button>
          <input ref={fileRef} type="file" accept=".jar" style={{ display: 'none' }} onChange={upload} />
          <button className="danger" onClick={removeSelected}>Remove</button>
          <button onClick={() => bulk((file) => {
            const mod = mods.mods.find((x) => x.file === file);
            return setEnabled(mod, true);
          }, 'Enabled')}>Enable</button>
          <button onClick={() => bulk((file) => {
            const mod = mods.mods.find((x) => x.file === file);
            return setEnabled(mod, false);
          }, 'Disabled')}>Disable</button>
          <button onClick={viewHomepage}>View Homepage</button>
          <button onClick={exportList}>Export List</button>
        </div>
      </div>
      {dl && <DownloadDialog dl={dl} setDl={setDl} onInstalled={refresh} />}
    </div>
  );
}

function DownloadDialog({ dl, setDl, onInstalled }) {
  const [q, setQ] = useState(dl.q);
  const [hits, setHits] = useState(dl.hits);
  const [picked, setPicked] = useState(dl.picked);
  const [versions, setVersions] = useState(dl.versions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError('');
    setPicked(null);
    setVersions(null);
    try {
      const res = await api(`/api/mods/search?source=${dl.source}&q=${encodeURIComponent(q.trim())}&limit=${LIMITS.modSearch}`);
      setHits(res.hits);
      if (res.hits.length === 0) setError('No projects found.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (hit) => {
    setPicked(hit);
    setVersions(null);
    setError('');
    setBusy(true);
    try {
      const res = await api(`/api/mods/versions?source=${dl.source}&id=${encodeURIComponent(hit.id)}&limit=${LIMITS.modSearch}`);
      setVersions(res.versions);
      if (res.versions.length === 0) setError('No versions for this game + loader.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const install = async (v) => {
    const file = v.files.find((f) => f.primary) ?? v.files[0];
    if (!file) {
      setError('No jar in that version.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const info = await api('/api/mods/install', {
        method: 'POST',
        body: { source: dl.source, id: picked.id, versionId: v.id },
      });
      toast('Installed', info.file, 'ok');
      setDl(null);
      onInstalled();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalback open" onClick={(e) => { if (e.target === e.currentTarget) setDl(null); }}>
      <div className="card modal">
        <h3>Download Mods</h3>
        <div className="row" style={{ marginTop: 0 }}>
          <button className={dl.source === 'modrinth' ? 'primary' : ''} onClick={() => { setDl({ ...dl, source: 'modrinth' }); setHits(null); setPicked(null); setVersions(null); }}>Modrinth</button>
          <button className={dl.source === 'curseforge' ? 'primary' : ''} onClick={() => { setDl({ ...dl, source: 'curseforge' }); setHits(null); setPicked(null); setVersions(null); }}>CurseForge</button>
        </div>
        <form className="row" onSubmit={search}>
          <input className="search" style={{ margin: 0, flex: 1 }} placeholder={`Search ${dl.source}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="primary" disabled={busy}>{busy ? '…' : 'Search'}</button>
        </form>
        {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
        {hits && (
          <table>
            <tbody>
              {hits.map((h) => (
                <tr key={`${h.source}-${h.id}`} onClick={() => pick(h)} style={{ cursor: 'pointer' }}>
                  <td><b>{h.title}</b><br /><span className="muted">{h.description.slice(0, LIMITS.searchTruncate)}</span></td>
                  <td className="num">{h.downloads.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {picked && versions && (
          <>
            <h3>Versions · {picked.title}</h3>
            <table>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="num">{v.versionNumber}</td>
                    <td className="muted">{((v.files.find((f) => f.primary) ?? v.files[0])?.filename) ?? 'no jar'}</td>
                    <td align="right"><button className="primary" disabled={busy} onClick={() => install(v)}>Install</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="row"><button onClick={() => setDl(null)}>Close</button></div>
      </div>
    </div>
  );
}
