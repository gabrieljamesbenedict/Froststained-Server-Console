Froststained Server Console

FIRST RUN
1. Copy config.example.yml and rename the copy to config.yaml.
2. Edit config.yaml: set server_path to your Minecraft server folder and
   rcon.password to match enable-rcon in the server's server.properties.
3. Run fssc (fssc.exe on Windows).
4. Open http://localhost:3100 and create your admin account.

LAN ACCESS
Other devices: http://<your-pc-ip>:3100
Windows may ask to allow Node.js through the firewall - allow private networks.

FILES
config.yaml  your settings (keep next to the exe)
data/        sessions database, created on first run
backups/     world backups, created on first run

UPDATES
Replace fssc and re-copy config.example.yml if the settings format changed;
your config.yaml, data/ and backups/ stay as they are.
