import { useEffect, useState } from 'react';
import { api, toast } from './api.js';
import { AuthForm, Backups, PasswordForm } from './views/legacy.jsx';
import Console from './views/Console.jsx';
import Metrics from './views/Metrics.jsx';
import Players from './views/Players.jsx';
import Files from './views/Files.jsx';
import Mods from './views/Mods.jsx';
import Dashboard from './views/Dashboard.jsx';

const TITLES = {
  dash: 'Dashboard',
  console: 'Console',
  metrics: 'Metrics',
  players: 'Players',
  mods: 'Mods',
  files: 'Server files',
  backups: 'Backups',
  settings: 'Settings',
  account: 'Account',
};

const NAV = {
  dash: 'Dashboard',
  console: 'Console',
  metrics: 'Metrics',
  players: 'Players',
  mods: 'Mods',
  files: 'Files',
  backups: 'Backups',
  settings: 'Settings',
};

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('frost-theme') || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('frost-theme', theme);
  }, [theme]);
  return [theme, setTheme];
}

function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const id = Math.random().toString(36).slice(2);
      const { title, body, kind } = e.detail;
      setItems((prev) => [...prev, { id, title, body, kind }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener('toast', onToast);
    return () => window.removeEventListener('toast', onToast);
  }, []);
  return (
    <div id="toasts">
      {items.map((t) => (
        <div className={`toast ${t.kind || ''}`} key={t.id}>
          <b>{t.title}</b>
          {t.body ? <span>{t.body}</span> : null}
        </div>
      ))}
    </div>
  );
}

function MasterPower({ user }) {
  const [running, setRunning] = useState(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await api('/api/server/status');
        if (alive) setRunning(s.state === 'running' || s.state === 'starting');
      } catch {
        // sidebar stays neutral on errors
      }
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user]);

  const toggle = async () => {
    try {
      await api(running ? '/api/server/stop' : '/api/server/start', { method: 'POST' });
      const s = await api('/api/server/status');
      setRunning(s.state === 'running' || s.state === 'starting');
      toast(running ? 'Server stopping' : 'Server starting', running ? 'stopping gracefully…' : 'booting…', running ? 'err' : 'ok');
    } catch (err) {
      toast('Power failed', err.message, 'err');
    }
  };

  if (running === null) {
    return (
      <button id="master" disabled>
        <span>… checking</span>
      </button>
    );
  }
  return (
    <button id="master" className={running ? 'stop' : 'start'} onClick={toggle}>
      <span>{running ? '■ Stop server' : '▶ Start server'}</span>
    </button>
  );
}

function SettingsView({ theme, setTheme }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api('/api/server/info').then(setInfo).catch(() => {});
  }, []);
  return (
    <>
      <div className="card">
        <h3>Server</h3>
        {!info ? (
          <p className="muted">Loading…</p>
        ) : (
          <p>
            Folder: <code>{info.serverPath}</code><br />
            MC {info.minecraftVersion ?? '?'}
            {info.loader ? ` · ${info.loader} ${info.version ?? ''}` : ''} · RCON{' '}
            {info.rcon.configured ? (info.rcon.reachable ? 'reachable' : 'unreachable') : 'not configured'}
          </p>
        )}
      </div>
      <div className="card">
        <h3>Appearance</h3>
        <button onClick={() => setTheme('dark')}>Frost Dark</button>{' '}
        <button onClick={() => setTheme('light')}>Frost Light</button>
        <p className="muted">Current: {theme === 'dark' ? 'Frost Dark' : 'Frost Light'}</p>
      </div>
      <div className="card">
        <h3>Mod sources</h3>
        <p className="muted">Modrinth needs no key. Set <code>curseforge_api_key</code> in console config for CurseForge checks.</p>
      </div>
    </>
  );
}

function AccountView({ user, onLogout }) {
  const [sessions, setSessions] = useState(null);
  useEffect(() => {
    api('/api/auth/sessions').then(setSessions).catch(() => {});
  }, []);
  return (
    <>
      <div className="card">
        <h3>Account · {user.username}</h3>
        <p className="muted">Signed in · role {user.role}</p>
        <button onClick={onLogout}>Sign out</button>
      </div>
      <div className="card">
        <h3>Sessions · {sessions?.count ?? '…'}</h3>
        {!sessions ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <tbody>
              {sessions.sessions.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.current ? 'This session' : 'Other session'}
                    <br />
                    <span className="muted num">
                      since {new Date(s.createdAt).toLocaleString()} · expires {new Date(s.expiresAt).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h3>Change password</h3>
        <PasswordForm />
      </div>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState('dash');
  const [state, setState] = useState({ loading: true, needsSetup: false, user: null });
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const onAuth = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('unauthorized', onAuth);
    return () => window.removeEventListener('unauthorized', onAuth);
  }, []);

  useEffect(() => {
    if (state.user) api('/api/server/info').then(setInfo).catch(() => {});
  }, [state.user]);

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
  if (state.backendDown) {
    return <main style={{ padding: 24 }}>Backend unreachable. Start it with <code>npm run start -w server</code>.</main>;
  }

  if (state.needsSetup || !state.user) {
    return (
      <main style={{ padding: 24, maxWidth: 480 }}>
        <h1><span className="frost">FROST</span><span className="stained">STAINED</span></h1>
        <AuthForm
          mode={state.needsSetup ? 'setup' : 'login'}
          onDone={(user) => setState({ loading: false, needsSetup: false, user })}
        />
        <Toasts />
      </main>
    );
  }

  const views = {
    dash: <Dashboard go={setView} />,
    console: <Console />,
    metrics: <Metrics />,
    players: <Players />,
    mods: <Mods />,
    files: <Files />,
    backups: <Backups />,
    settings: <SettingsView theme={theme} setTheme={setTheme} />,
    account: <AccountView user={state.user} onLogout={logout} />,
  };

  return (
    <>
      <aside>
        <h1><span className="frost">FROST</span><span className="stained">STAINED</span></h1>
        <MasterPower user={state.user} />
        {Object.keys(NAV).map((v) => (
          <button key={v} className={`nav${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            <span>{NAV[v]}</span>
          </button>
        ))}
        <button className={`nav acct${view === 'account' ? ' active' : ''}`} onClick={() => setView('account')}>
          <span>Account · {state.user.username}</span>
        </button>
        <div className="foot">v{info?.console?.version ?? '…'} · :{info?.console?.port ?? '…'}</div>
      </aside>
      <main>
        <header className="top">
          <h2>{TITLES[view]}</h2>
          <span className="spacer"></span>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☾ theme' : '☀ theme'}
          </button>
        </header>
        <section className="view active" id={`v-${view}`}>{views[view]}</section>
        <Toasts />
      </main>
    </>
  );
}
