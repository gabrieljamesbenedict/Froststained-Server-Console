import { useEffect, useRef, useState } from 'react';
import { api, POLL, toast } from '../api.js';

const ACTIONS = ['kick', 'ban', 'pardon', 'op', 'deop', 'whitelist-add', 'whitelist-remove'];

const MENU_LABELS = {
  kick: 'Kick',
  ban: 'Ban',
  pardon: 'Pardon',
  op: 'Op',
  deop: 'Deop',
  'whitelist-add': 'Whitelist add',
  'whitelist-remove': 'Whitelist remove',
};

function formatDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? `${m % 60}m` : ''}`;
  return `${Math.floor(h / 24)}d`;
}

const shortUuid = (uuid) => (uuid ? `${uuid.slice(0, 4)}…${uuid.slice(-4)}` : '—');

export default function Players() {
  const [tab, setTab] = useState('on');
  const [online, setOnline] = useState({ count: 0, players: [] });
  const [all, setAll] = useState({ count: 0, players: [] });
  const [rcon, setRcon] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(null);
  const [name, setName] = useState('');
  const [action, setAction] = useState('kick');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const menuRef = useRef(null);

  const refreshOnline = async () => {
    try {
      setOnline(await api('/api/players'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshAll = async () => {
    try {
      setAll(await api('/api/players/all'));
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
    refreshOnline();
    refreshAll();
    refreshRcon();
    const t = setInterval(refreshOnline, POLL.status);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const act = async (route, body) => {
    setError('');
    setMenu(null);
    try {
      const r = await api(`/api/players/${route}`, { method: 'POST', body });
      toast(`${MENU_LABELS[route]} ${body.name ?? ''}`.trim(), r.response || 'ok', 'ok');
      refreshOnline();
      refreshAll();
    } catch (err) {
      toast('Player action failed', err.message, 'err');
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) act(action, { name: name.trim(), ...(reason ? { reason } : {}) });
  };

  const say = (e) => {
    e.preventDefault();
    if (message.trim()) act('say', { message: message.trim() });
    setMessage('');
  };

  const byName = new Map(all.players.map((p) => [p.name.toLowerCase(), p]));
  const onlineRows = online.players.map((p) => ({
    name: p.name,
    since: p.since,
    info: byName.get(p.name.toLowerCase()) ?? null,
  }));
  const rows = tab === 'on' ? onlineRows : all.players.map((info) => {
    const on = online.players.find((p) => p.name.toLowerCase() === info.name.toLowerCase());
    return { name: info.name, since: on?.since ?? null, info };
  });

  const openMenu = (e, row) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ name: row.name, top: r.bottom + 4, left: Math.max(8, r.left - 120) });
  };

  const showDetail = (row) => {
    const info = row.info;
    setDetail({
      name: row.name,
      sub: info ? `${shortUuid(info.uuid)} · Playtime ${info.playtimeH}h · Deaths ${info.deaths} · Advancements ${info.advancements ?? '—'}` : 'no record yet',
      state: info
        ? `${info.opLevel > 0 ? `OP level ${info.opLevel}` : 'not op'} · ${info.whitelisted ? 'whitelisted' : 'not whitelisted'} · ${row.since ? `online ${formatDuration(Date.now() - row.since)}` : 'offline'}`
        : row.since ? `online ${formatDuration(Date.now() - row.since)}` : 'offline',
    });
  };

  return (
    <>
      <div className="card fill">
        <div className="row" style={{ margin: '0 0 8px 0' }}>
          <button className={tab === 'on' ? 'primary' : ''} onClick={() => { setTab('on'); setDetail(null); }}>
            Online · {online.count}
          </button>
          <button className={tab === 'all' ? 'primary' : ''} onClick={() => { setTab('all'); setDetail(null); refreshAll(); }}>
            All · {all.count}
          </button>
        </div>
        <div className="scroll">
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup><col style={{ width: '30%' }} /><col style={{ width: '18%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col /></colgroup>
            <thead><tr><th>Player</th><th>Online for</th><th>Playtime</th><th>Deaths</th><th align="right"></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} onClick={() => showDetail(row)} style={{ cursor: 'pointer' }}>
                  <td>
                    {row.name}{row.info && row.info.opLevel > 0 ? ' (Op)' : ''}
                    <br /><span className="muted num">{shortUuid(row.info?.uuid)}</span>
                  </td>
                  <td>{row.since ? formatDuration(Date.now() - row.since) : '—'}</td>
                  <td>{row.info ? `${row.info.playtimeH}h` : '—'}</td>
                  <td>{row.info ? row.info.deaths : '—'}</td>
                  <td align="right" style={{ position: 'relative' }}>
                    <button onClick={(e) => openMenu(e, row)}>⋯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">{tab === 'on' ? 'Nobody online.' : 'No known players yet.'}</p>}
        </div>
        {detail && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, maxHeight: '30%', overflowY: 'auto' }}>
            <b>{detail.name}</b> <span className="muted">{detail.sub}</span><br />
            <span className="muted">{detail.state}</span>
          </div>
        )}
        {menu && (
          <div className="menu open" ref={menuRef} style={{ top: menu.top, left: menu.left }}>
            {ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => act(a, a === 'kick' ? { name: menu.name, reason: 'Kicked by admin' } : { name: menu.name })}
              >
                {MENU_LABELS[a]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h3>Manual action</h3>
        {rcon && !rcon.configured && (
          <p>RCON not configured: set <code>rcon.password</code> and <code>enable-rcon=true</code> on the MC server.</p>
        )}
        {rcon?.configured && (
          <p style={{ fontSize: 12 }}>
            RCON {rcon.reachable ? 'reachable' : 'unreachable'} <button onClick={refreshRcon}>Recheck</button>
          </p>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder="Username" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="submit">Run</button>
        </form>
        <form onSubmit={say} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder="Broadcast message" value={message} onChange={(e) => setMessage(e.target.value)} style={{ flex: 1 }} />
          <button type="submit">Say</button>
        </form>
        {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      </div>
    </>
  );
}
