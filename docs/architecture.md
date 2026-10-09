# Architecture (skeleton)

Single-server design: one Fastify process owns one `java -jar` child process.

```
Browser -> Fastify [:3100] -> serves web/dist + /api + /ws
  AuthService | MCProcessManager | MetricsCollector | ModManager | FileService -> SQLite (data.db)
```

Multi-server = multiple console processes, distinct ports/configs. `MCProcessManager` stays behind an interface so `server:` can later become `servers:[]`.
