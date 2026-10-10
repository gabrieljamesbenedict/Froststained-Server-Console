import { execFile } from 'node:child_process';
import fs from 'node:fs';
import si from 'systeminformation';

// Resource usage of the MC process tree (launcher + forked real server).
// cpu/mem come from systeminformation; thread counts from OS-specific
// lookups (best-effort: missing counts report as null, never fail the tree).
async function threadCounts(pids) {
  const out = new Map();
  if (pids.length === 0) return out;
  try {
    if (process.platform === 'win32') {
      const stdout = await new Promise((resolve) => {
        execFile(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `(Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id, @{N='T';E={$_.Threads.Count}} | ConvertTo-Json -Compress)`,
          ],
          { timeout: 10000 },
          (err, so) => resolve(err ? '' : so),
        );
      });
      const rows = JSON.parse(stdout || '[]');
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        if (r && r.Id != null) out.set(Number(r.Id), Number(r.T));
      }
    } else {
      for (const pid of pids) {
        try {
          const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
          const m = status.match(/^Threads:\s+(\d+)/m);
          if (m) out.set(pid, Number(m[1]));
        } catch {
          // process may have exited between listing and lookup
        }
      }
    }
  } catch {
    // ignore; tree still reports cpu/mem
  }
  return out;
}

export async function processTree(rootPid, { threads = true } = {}) {
  if (!rootPid) return { running: false };
  const { list } = await si.processes();
  const byPid = new Map(list.map((p) => [p.pid, p]));
  if (!byPid.has(rootPid)) return { running: false };

  const children = new Map();
  for (const p of list) {
    // systeminformation v5 uses parentPid; older shapes used ppid.
    const ppid = p.parentPid ?? p.ppid;
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(p.pid);
  }
  const tree = [];
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    const p = byPid.get(pid);
    if (!p) continue;
    tree.push(p);
    for (const c of children.get(pid) ?? []) stack.push(c);
  }

  const counts = threads ? await threadCounts(tree.map((p) => p.pid)) : new Map();
  const processes = tree.map((p) => ({
    pid: p.pid,
    name: p.name,
    cpuPct: Math.round(p.cpu * 10) / 10,
    memPct: Math.round(p.mem * 10) / 10,
    memRssMb: Math.round(p.memRss / 1024),
    threads: threads ? (counts.get(p.pid) ?? null) : null,
  }));
  const totalCpu = Math.round(processes.reduce((a, p) => a + p.cpuPct, 0) * 10) / 10;
  const totalMemMb = processes.reduce((a, p) => a + p.memRssMb, 0);
  const totalThreads = [...counts.values()].reduce((a, n) => a + n, 0);

  return { running: true, rootPid, totalCpuPct: totalCpu, totalMemMb, totalThreads, processes };
}
