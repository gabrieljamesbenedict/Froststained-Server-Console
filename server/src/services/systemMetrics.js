import si from 'systeminformation';

const HISTORY_MAX = 120; // 10 min at 5s polls

// Host-level snapshot + short history. Polled on an interval; the route
// serves the latest cached sample so requests never block on OS calls.
export class SystemMetrics {
  constructor({ intervalMs = 5000 } = {}) {
    this.intervalMs = intervalMs;
    this.latest = null;
    this.history = [];
    this.timer = null;
  }

  start(serverPath) {
    this.serverPath = serverPath;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  async poll() {
    try {
      const [load, mem, disks, nets, os, time] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.osInfo(),
        si.time(),
      ]);
      const cpuPct = Math.round(load.currentLoad * 10) / 10;
      const memPct = Math.round((mem.used / mem.total) * 1000) / 10;
      this.latest = {
        t: Date.now(),
        cpu: { loadPct: cpuPct, cores: load.cpus.map((c) => Math.round(c.load * 10) / 10) },
        mem: {
          totalMb: Math.round(mem.total / 1048576),
          usedMb: Math.round(mem.used / 1048576),
          usedPct: memPct,
        },
        disks: disks.map((d) => ({
          fs: d.fs,
          mount: d.mount,
          sizeMb: Math.round(d.size / 1048576),
          usedPct: d.use,
        })),
        net: nets.map((n) => ({ iface: n.iface, rxSecKb: Math.round(n.rx_sec / 1024), txSecKb: Math.round(n.tx_sec / 1024) })),
        os: { platform: os.platform, distro: os.distro, release: os.release, arch: os.arch },
        uptimeSec: time.uptime,
      };
      this.history.push({ t: this.latest.t, cpuPct, memPct });
      if (this.history.length > HISTORY_MAX) this.history.shift();
    } catch {
      // A failed poll keeps the previous sample; next tick retries.
    }
  }

  snapshot() {
    return { latest: this.latest, history: this.history };
  }
}
