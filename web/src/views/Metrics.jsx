import { useEffect, useState } from 'react';
import { api, formatBytes } from '../api.js';

function Chart({ values, color, topLabel }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return <span style={{ fontSize: 12 }}>collecting…</span>;
  const W = 400;
  const H = 110;
  const BASE = 82;
  const max = Math.max(...pts, 1);
  const step = W / (pts.length - 1);
  const d = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(BASE - (v / max) * (BASE - 8)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width="100%" height="110" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--border)" />
      <text x="4" y="12" fill="var(--muted)" fontSize="10">{topLabel}</text>
      <text x="4" y="86" fill="var(--muted)" fontSize="10">0</text>
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function formatUptime(sec) {
  if (sec == null) return '…';
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export default function Metrics() {
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [netHist, setNetHist] = useState([]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const data = await api('/api/metrics');
        if (!alive) return;
        setM(data);
        setError('');
        const s = data.system?.latest;
        if (s?.net?.length) {
          const top = [...s.net].sort((a, b) => b.rxSecKb + b.txSecKb - (a.rxSecKb + a.txSecKb))[0];
          setNetHist((h) => [...h, { rx: top.rxSecKb, tx: top.txSecKb, iface: top.iface }].slice(-60));
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

  if (error) return <p style={{ color: 'var(--stain)' }}>metrics: {error}</p>;
  if (!m?.system?.latest) return <p>Loading metrics…</p>;

  const s = m.system.latest;
  const hist = m.system.history;
  const proc = m.process;
  const net = netHist.length ? netHist[netHist.length - 1] : null;
  const netMax = Math.max(1, ...netHist.map((n) => Math.max(n.rx, n.tx)));

  return (
    <div className="grid">
      <div className="card span6">
        <h3>CPU · host total</h3>
        <div className="bigval num">{s.cpu.loadPct}%</div>
        <Chart values={hist.map((h) => h.cpuPct)} color="var(--accent)" topLabel="100%" />
        <p className="muted">
          Minecraft using <b className="num" style={{ color: 'var(--text)' }}>{proc.running ? `${proc.totalCpuPct}%` : '—'}</b>
          {' '}· {s.cpu.cores.length} logical cores · up {formatUptime(s.uptimeSec)}
        </p>
      </div>
      <div className="card span6">
        <h3>Memory · {formatBytes(s.mem.usedMb)} of {formatBytes(s.mem.totalMb)} ({s.mem.usedPct}%)</h3>
        <div className="bigval num">{s.mem.usedPct}%</div>
        <Chart values={hist.map((h) => h.memPct)} color="var(--ok)" topLabel={formatBytes(s.mem.totalMb)} />
        <p className="muted">
          Minecraft using <b className="num" style={{ color: 'var(--text)' }}>{proc.running ? formatBytes(proc.totalMemMb) : '—'}</b>
          {' '}· {proc.running ? proc.totalThreads : '—'} threads
        </p>
      </div>
      <div className="card span6">
        <h3>Network · down / up KB/s</h3>
        <div className="bigval num">↓ {net?.rx ?? '…'} · ↑ {net?.tx ?? '…'}</div>
        {netHist.length < 2 ? (
          <span style={{ fontSize: 12 }}>collecting…</span>
        ) : (
          <svg width="100%" height="110" viewBox="0 0 400 110" preserveAspectRatio="none">
            <path
              d={netHist.map((n, i) => `${i === 0 ? 'M' : 'L'}${((i * 400) / (netHist.length - 1)).toFixed(1)},${(82 - (n.rx / netMax) * 74).toFixed(1)}`).join(' ')}
              fill="none" stroke="var(--accent)" strokeWidth="2"
            />
            <path
              d={netHist.map((n, i) => `${i === 0 ? 'M' : 'L'}${((i * 400) / (netHist.length - 1)).toFixed(1)},${(82 - (n.tx / netMax) * 74).toFixed(1)}`).join(' ')}
              fill="none" stroke="var(--warn)" strokeWidth="2"
            />
          </svg>
        )}
        <p className="muted">{net ? `${net.iface} · ` : ''}Minecraft :25565 negligible while empty</p>
      </div>
      <div className="card span6">
        <h3>Processes</h3>
        {!proc.running ? (
          <p className="muted">Server process not running.</p>
        ) : (
          <table>
            <thead><tr><th>PID</th><th>Name</th><th className="num">CPU%</th><th className="num">RSS</th><th className="num">Threads</th></tr></thead>
            <tbody>
              {proc.processes.map((p) => (
                <tr key={p.pid}>
                  <td className="num">{p.pid}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.cpuPct}</td>
                  <td className="num">{formatBytes(p.memRssMb)}</td>
                  <td className="num">{p.threads ?? '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
