import { useEffect, useRef, useState } from 'react';
import { api, logClass, toast, wsUrl } from '../api.js';

function severity(line) {
  if (/\[.*ERROR|exception|caused by/i.test(line)) return 'error';
  if (logClass(line) === 'warn') return 'warn';
  return 'info';
}

export default function Console() {
  const [lines, setLines] = useState([]);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [level, setLevel] = useState('all');
  const logRef = useRef(null);

  const pushLines = (next) =>
    setLines((prev) => [...prev, ...next].slice(-500));

  useEffect(() => {
    let ws;
    let alive = true;
    let retry;
    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'history') pushLines(msg.lines);
        else if (msg.type === 'line') pushLines([{ t: msg.t, stream: msg.stream, line: msg.line }]);
      };
      ws.onclose = () => {
        if (alive) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (follow) logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [lines, follow]);

  const sendCommand = async (e) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd) return;
    setCommand('');
    setHistIdx(-1);
    setHistory((h) => [cmd, ...h].slice(0, 50));
    pushLines([{ t: Date.now(), stream: 'input', line: `> ${cmd}` }]);
    try {
      await api('/api/server/command', { method: 'POST', body: { command: cmd } });
    } catch (err) {
      toast('Command failed', err.message, 'err');
    }
  };

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (history.length === 0) return;
    const next = e.key === 'ArrowUp'
      ? Math.min(histIdx + 1, history.length - 1)
      : Math.max(histIdx - 1, -1);
    setHistIdx(next);
    setCommand(next === -1 ? '' : history[next]);
  };

  const download = () => {
    const text = visible.map((l) => l.line).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'console.log';
    a.click();
    URL.revokeObjectURL(url);
  };

  const visible = lines.filter((l) => {
    if (level === 'all') return true;
    if (level === 'warn') return severity(l.line) !== 'info';
    return severity(l.line) === 'error';
  });

  return (
    <div className="card fill">
      <div className="row" style={{ margin: '0 0 8px 0' }}>
        <button onClick={() => setFollow((f) => !f)}>{follow ? 'Following ✓' : 'Follow'}</button>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="all">All levels</option>
          <option value="warn">Warnings + errors</option>
          <option value="error">Errors only</option>
        </select>
        <span className="spacer"></span>
        <span className="muted num">{visible.length} lines</span>
        <button onClick={download}>Download</button>
        <button onClick={() => setLines([])}>Clear</button>
      </div>
      <div className="term" id="logfull" ref={logRef}>
        {visible.map((l, i) => (
          <div key={i} className={logClass(l.line) || undefined}>{l.line}</div>
        ))}
      </div>
      <form className="row cmdrow" onSubmit={sendCommand}>
        <input
          placeholder="command… (try: list)"
          autoComplete="off"
          value={command}
          onChange={(e) => { setCommand(e.target.value); setHistIdx(-1); }}
          onKeyDown={onKeyDown}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
