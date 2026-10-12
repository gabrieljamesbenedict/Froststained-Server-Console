# Froststained Server Console

## What you need

- Java installed (the console uses it to launch your server).
- Your Minecraft Java server, already set up.

## Setup

1. **Copy the sample config.** Copy `config.example.yaml` and rename the copy
   to `config.yaml`.

2. **Point it at your server.** Open `config.yaml` and set:

   ```yaml
   server_path: "D:/MC-Survival"            # Windows
   # server_path: "/home/user/mc-survival"  # Linux

   rcon:
     password: "your-rcon-password"          # must match server.properties
   ```

3. **Enable RCON** in your server's `server.properties` if you want player
   commands (kick, ban, op, whitelist):

   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=your-rcon-password
   ```

4. **Run the console.** Double-click `fssc.exe`.

5. **Create your admin account.** Open <http://localhost:3100>.

## Playing over LAN

Other devices on your network:

```
http://<this-computer-ip>:3100
```

If Windows Firewall asks, allow access on private networks.

## Updating

Replace `fssc.exe` with the new version. Leave `config.yaml`, `data/` and
`backups/` as they are — nothing else needs touching.

## Troubleshooting

- Windows may warn about an unknown publisher on first run (the exe is not
  code-signed). Choose **More info** → **Run anyway**.
- "No console config found" means `config.yaml` is not sitting next to
  `fssc.exe`.
