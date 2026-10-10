import { useEffect, useState } from 'react';
import { api, formatBytes, LIMITS, POLL } from '../api.js';

function Chart({ values, color, ticks, times, series2, color2 }) {
  const pts = values.filter((v) => v != null);
  const pts2 = series2 ? series2.filter((v) => v != null) : null;
  const n = Math.max(pts.length, pts2?.length ?? 0);
  if (n < 2) return <span style={{ fontSize: 12 }}>collecting…</span>;
  const W = 400;
  const H = 170;
  const BASE = 140;
  const LEFT = 30;
  const TOP = 12;
  const max = Math.max(1, ...pts, ...(pts2 ?? []));
  const step = (W - LEFT) / (n - 1);
  const x = (i) => LEFT + i * step;
  const y = (v) => BASE - (v / max) * (BASE - TOP);
  const path = (arr) =>
    arr
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');
  const grid = [0, max / 2, max];
  const labels = ticks ?? ['0', `${Math.round(max / 2)}`, `${Math.round(max)}`];
  const spanSec = times && times.length > 1 ? (times[times.length - 1] - times[0]) / 1000 : null;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {grid.map((g) => (
        <line key={g} x1={LEFT} y1={y(g)} x2={W} y2={y(g)} stroke="var(--border)" />
      ))}
      <line x1={LEFT} y1={8} x2={LEFT} y2={BASE} stroke="var(--border)" />
      {grid.map((g, i) => (
        <text key={g} x="2" y={y(g) + 4} fill="var(--muted)" fontSize="10" className="num">{labels[i]}</text>
      ))}
      {spanSec != null && spanSec > 0 && (
        <>
          <text x={LEFT} y={BASE + 18} fill="var(--muted)" fontSize="10" className="num">-{formatUptime(spanSec)}</text>
          <text x={W} y={BASE + 18} fill="var(--muted)" fontSize="10" textAnchor="end">now</text>
        </>
      )}
      {pts.length > 0 && <path d={path(pts)} fill="none" stroke={color} strokeWidth="2" />}
      {pts2 && pts2.length > 0 && <path d={path(pts2)} fill="none" stroke={color2} strokeWidth="2" />}
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
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [netHist, setNetHist] = useState([]);

  useEffect(() => {
    api('/api/server/info').then(setInfo).catch(() => {});
  }, []);

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
          setNetHist((h) => [...h, { rx: top.rxSecKb, tx: top.txSecKb, iface: top.iface, t: Date.now() }].slice(-LIMITS.netSamples));
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    };
    poll();
    const t = setInterval(poll, POLL.fast);
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
        <Chart values={hist.map((h) => h.cpuPct)} color="var(--accent)" ticks={['0', '50%', '100%']} times={hist.map((h) => h.t)} />
        <p className="muted">
          Minecraft using <b className="num" style={{ color: 'var(--text)' }}>{proc.running ? `${proc.totalCpuPct}%` : '—'}</b>
          {' '}· {s.cpu.cores.length} logical cores · up {formatUptime(s.uptimeSec)}
        </p>
      </div>
      <div className="card span6">
        <h3>Memory · {formatBytes(s.mem.usedMb)} of {formatBytes(s.mem.totalMb)} ({s.mem.usedPct}%)</h3>
        <div className="bigval num">{s.mem.usedPct}%</div>
        <Chart values={hist.map((h) => h.memPct)} color="var(--ok)" ticks={['0', formatBytes(s.mem.totalMb / 2), formatBytes(s.mem.totalMb)]} times={hist.map((h) => h.t)} />
        <p className="muted">
          Minecraft using <b className="num" style={{ color: 'var(--text)' }}>{proc.running ? formatBytes(proc.totalMemMb) : '—'}</b>
          {' '}· {proc.running ? proc.totalThreads : '—'} threads
        </p>
      </div>
      <div className="card span6">
        <h3>Network · down / up KB/s</h3>
        <div className="bigval num">↓ {net?.rx ?? '…'} · ↑ {net?.tx ?? '…'}</div>
        <Chart
          values={netHist.map((n) => n.rx)}
          series2={netHist.map((n) => n.tx)}
          color="var(--accent)"
          color2="var(--warn)"
          ticks={['0', `${Math.round(netMax / 2)} KB/s`, `${Math.round(netMax)} KB/s`]}
          times={netHist.map((n) => n.t)}
        />
        <p className="muted">
          {net ? `${net.iface} · ` : ''}
          Minecraft {info?.gamePort ? `:${info.gamePort} ` : ''}
          {m.server.players.count === 0 ? 'negligible while empty' : `serving ${m.server.players.count} player${m.server.players.count === 1 ? '' : 's'}`}
        </p>
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
