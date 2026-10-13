const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
let win, agent;
const configPath = () => path.join(app.getPath("userData"), "settings.json");
const fields = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "POP9_AGENT_EMAIL", "POP9_AGENT_PASSWORD", "POP9_UNIT_ID"];
function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    if (raw.passwordCipher) raw.POP9_AGENT_PASSWORD = safeStorage.decryptString(Buffer.from(raw.passwordCipher, "base64"));
    delete raw.passwordCipher;
    return raw;
  } catch { return {}; }
}
function validate(cfg) {
  for (const field of fields) if (!String(cfg[field] ?? "").trim()) throw Error("Campo obrigatorio: " + field);
  const url = new URL(cfg.SUPABASE_URL);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("Supabase URL precisa usar HTTPS");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cfg.POP9_UNIT_ID)) throw Error("ID da unidade invalido");
}
function stopAgent() { if (agent) { agent.kill(); agent = null; } }
function launch(test = false) {
  stopAgent();
  const cfg = readConfig();
  validate(cfg);
  const script = path.join(app.getAppPath(), "src", "index.mjs");
  agent = spawn(process.execPath, [script, ...(test ? ["--test"] : [])], {
    cwd: app.getAppPath(), windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...Object.fromEntries(fields.map(k => [k, cfg[k]])) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const send = (level, data) => { if (win && !win.isDestroyed()) win.webContents.send("agent:log", { level, text: String(data).replace(/(password|token|eyJ[A-Za-z0-9_-]+)/gi, "[REDACTED]").slice(-4000) }); };
  agent.stdout.on("data", d => send("info", d.toString()));
  agent.stderr.on("data", d => send("error", d.toString()));
  agent.on("error", e => send("error", e.message));
  agent.on("exit", (code) => { agent = null; send("info", "Agente encerrado (codigo " + code + ")"); });
}
app.whenReady().then(() => {
  ipcMain.handle("config:read", () => readConfig());
  ipcMain.handle("config:save", (_evt, cfg) => {
    validate(cfg);
    if (!safeStorage.isEncryptionAvailable()) throw Error("Criptografia local indisponivel. Nao foi possivel salvar senha.");
    const saved = Object.fromEntries(fields.filter(k => k !== "POP9_AGENT_PASSWORD").map(k => [k, String(cfg[k]).trim()]));
    saved.passwordCipher = safeStorage.encryptString(cfg.POP9_AGENT_PASSWORD).toString("base64");
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(saved), { mode: 0o600 });
    return true;
  });
  ipcMain.handle("agent:start", () => { launch(); return true; });
  ipcMain.handle("agent:test", () => { launch(true); return true; });
  ipcMain.handle("agent:stop", () => { stopAgent(); return true; });
  ipcMain.handle("app:autostart", (_evt, enabled) => { app.setLoginItemSettings({ openAtLogin: Boolean(enabled) }); return app.getLoginItemSettings().openAtLogin; });
  ipcMain.handle("app:autostart-status", () => app.getLoginItemSettings().openAtLogin);
  win = new BrowserWindow({ width: 690, height: 670, minWidth: 560, minHeight: 520, webPreferences: {
    preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true
  } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("close", () => stopAgent());
  try { launch(); } catch { /* first launch requires configuration */ }
});
app.on("window-all-closed", () => app.quit());
