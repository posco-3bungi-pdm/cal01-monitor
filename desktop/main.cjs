const { app, BrowserWindow, Menu, ipcMain, protocol, net, session } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { normalizeServerUrl } = require("./server-url.cjs");

const SETTINGS_URL = "cal01-app://settings/index.html";
const DEFAULT_SERVER = "http://127.0.0.1:9017";
protocol.registerSchemesAsPrivileged([{ scheme: "cal01-app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.enableSandbox();
let window;
let connectionWindow;
let server = DEFAULT_SERVER;
let lastError = "";
const settingsPath = () => path.join(app.getPath("userData"), "connection.json");
const allowed = url => {
  try { return new URL(url).origin === server; } catch { return false; }
};
function restrict(contents, isSettings = false) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", event => event.preventDefault());
  for (const name of ["will-navigate", "will-redirect"]) contents.on(name, (event, url) => {
    if (isSettings ? url !== SETTINGS_URL : !allowed(url)) event.preventDefault();
  });
}
function showConnection() {
  if (connectionWindow && !connectionWindow.isDestroyed()) return connectionWindow.focus();
  connectionWindow = new BrowserWindow({
    width: 600, height: 500, resizable: false, title: "CAL01 · 서버 연결",
    backgroundColor: "#111411", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  restrict(connectionWindow.webContents, true);
  connectionWindow.loadURL(SETTINGS_URL);
  connectionWindow.on("closed", () => { connectionWindow = null; });
}
async function connect(value) {
  const next = normalizeServerUrl(value);
  const response = await net.fetch(`${next}/api/health`, { signal: AbortSignal.timeout(8000), redirect: "error", credentials: "omit" });
  if (!response.ok || (await response.json()).service !== "cal01-monitor") {
    throw new Error("CAL01 서버가 맞는지 확인해 주세요.");
  }
  if (next !== server) {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
  }
  server = next;
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify({ server }, null, 2), "utf8");
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({
      width: 1480, height: 940, minWidth: 820, minHeight: 620,
      title: "CAL01 Monitor", backgroundColor: "#111411", show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false },
    });
    restrict(window.webContents);
    window.on("closed", () => { window = null; });
    window.webContents.on("did-fail-load", (_event, code, _desc, _url, mainFrame) => {
      if (mainFrame && code !== -3) { lastError = "서버 화면을 열지 못했어요. 서버가 실행 중인지 확인해 주세요."; showConnection(); }
    });
  }
  await window.loadURL(server);
  window.show();
  lastError = "";
  if (connectionWindow && !connectionWindow.isDestroyed()) connectionWindow.close();
}
function trustedSettings(event) {
  return connectionWindow && event.sender === connectionWindow.webContents && event.senderFrame?.url === SETTINGS_URL;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const target = window || connectionWindow;
    if (target) { if (target.isMinimized()) target.restore(); target.focus(); }
  });
  app.whenReady().then(async () => {
    protocol.handle("cal01-app", request => {
      const url = new URL(request.url);
      const name = url.pathname.slice(1);
      if (url.host !== "settings" || !["index.html", "settings.js", "settings.css"].includes(name)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(path.join(__dirname, "settings", name)).href);
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on("will-download", event => event.preventDefault());
    ipcMain.handle("connection:read", event => {
      if (!trustedSettings(event)) throw new Error("설정 창에서만 사용할 수 있어요.");
      return { server, error: lastError };
    });
    ipcMain.handle("connection:connect", async (event, value) => {
      if (!trustedSettings(event)) throw new Error("설정 창에서만 사용할 수 있어요.");
      try { await connect(value); return { ok: true }; }
      catch (error) { return { ok: false, error: error.name === "TimeoutError" ? "서버 응답을 기다리다 중단했어요." : "연결하지 못했어요. 서버 주소와 실행 상태를 확인해 주세요." }; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "CAL01", submenu: [
        { label: "서버 연결 설정", click: showConnection },
        { label: "새로고침", accelerator: "Ctrl+R", click: () => window?.reload() },
        { type: "separator" }, { role: "quit", label: "종료" },
      ] },
      { label: "화면", submenu: [{ role: "resetZoom", label: "기본 크기" }, { role: "zoomIn", label: "확대" }, { role: "zoomOut", label: "축소" }, { role: "togglefullscreen", label: "전체 화면" }] },
    ]));
    try { server = normalizeServerUrl(JSON.parse(await fs.readFile(settingsPath(), "utf8")).server); } catch { server = DEFAULT_SERVER; }
    try { await connect(server); }
    catch { lastError = "서버가 아직 연결되지 않았어요. 이 PC의 서버를 실행하거나 팀 서버 주소를 입력해 주세요."; showConnection(); }
  });
  app.on("window-all-closed", () => app.quit());
}
