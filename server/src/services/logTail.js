import fs from 'node:fs';
import path from 'node:path';

// Reads the tail of logs/latest.log so a freshly connected console has
// context even for output printed before this process started watching.
export function readLogTail(serverPath, maxLines = 200, maxBytes = 65536) {
  const file = path.join(serverPath, 'logs', 'latest.log');
  if (!fs.existsSync(file)) return [];
  const { size } = fs.statSync(file);
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines)
      .map((line) => ({ t: null, stream: 'log', line }));
  } finally {
    fs.closeSync(fd);
  }
}
