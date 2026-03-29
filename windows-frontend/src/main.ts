// main.ts
import {
  app, BrowserWindow, ipcMain, dialog, globalShortcut,
  Tray, Menu, nativeImage, Event, shell
} from 'electron';
import { screen } from 'electron';
import * as path from 'path';

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;   // notch
let edgeWindow: InstanceType<typeof BrowserWindow> | null = null;   // top-edge activator
let tray: InstanceType<typeof Tray> | null = null;

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isDev = process.env.NODE_ENV === 'development';

// ---- safe work area helper (handles transient undefined) ----
const getWorkArea = () => {
  const d = screen.getPrimaryDisplay();
  // @ts-ignore
  return d.workArea ?? d.workAreaSize ?? { x: 0, y: 0, width: d.bounds.width, height: d.bounds.height };
};

const topCenterFor = (width: number, height: number) => {
  const wa = getWorkArea();
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y),
    width: Math.round(width),
    height: Math.round(height),
  };
};

// Cache the notch size once and never read width/height during animation
const COMPACT_NOTCH = { width: 448, height: 96 };
const EXPANDED_NOTCH = { width: 448, height: 96 };

let NOTCH_WIDTH = EXPANDED_NOTCH.width;
let NOTCH_HEIGHT = EXPANDED_NOTCH.height;

const placeMainAtTopCenter = () => {
  if (!mainWindow) return;
  const r = topCenterFor(NOTCH_WIDTH, NOTCH_HEIGHT);
  mainWindow.setBounds(r);
};

const placeEdgeActivator = () => {
  if (!edgeWindow) return;
  const width = Math.max(380, NOTCH_WIDTH + 60);
  const bounds = topCenterFor(width, 2);
  edgeWindow.setBounds({ ...bounds, y: bounds.y - 1 });
};

// ---- smooth animation (use setPosition, not setBounds) ----
let animating = false;
let cancelAnim = false;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function animateY(fromY: number, toY: number, durationMs: number) {
  if (!mainWindow) return Promise.resolve();
  animating = true;
  cancelAnim = false;

  return new Promise<void>((resolve) => {
    const start = Date.now();

    const step = () => {
      if (!mainWindow || cancelAnim) { animating = false; return resolve(); }

      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOutCubic(t);

      const wa = getWorkArea();
      const x = Math.round(wa.x + (wa.width - NOTCH_WIDTH) / 2);
      const y = Math.round(fromY + (toY - fromY) * e);

      // Guard all numbers
      if (Number.isFinite(x) && Number.isFinite(y)) {
        try {
          mainWindow.setPosition(x, y); // move only; keep size fixed
        } catch {
          // if Electron rejects (window destroyed), just stop
          animating = false;
          return resolve();
        }
      }

      if (t < 1) setTimeout(step, 16);
      else { animating = false; resolve(); }
    };

    step();
  });
}

function animateBoundsTo(width: number, height: number, durationMs: number) {
  if (!mainWindow) return Promise.resolve();
  const windowRef = mainWindow;

  return new Promise<void>((resolve) => {
    const start = Date.now();
    const initial = windowRef.getBounds();
    const target = topCenterFor(width, height);

    const step = () => {
      if (!mainWindow || mainWindow !== windowRef) return resolve();

      const now = Date.now();
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOutCubic(t);

      const nextWidth = Math.round(initial.width + (target.width - initial.width) * e);
      const nextHeight = Math.round(initial.height + (target.height - initial.height) * e);
      const nextX = Math.round(initial.x + (target.x - initial.x) * e);
      const nextY = Math.round(initial.y + (target.y - initial.y) * e);

      try {
        windowRef.setBounds({
          x: nextX,
          y: nextY,
          width: nextWidth,
          height: nextHeight,
        });
      } catch {
        return resolve();
      }

      if (t < 1) {
        setTimeout(step, 16);
      } else {
        resolve();
      }
    };

    step();
  });
}

async function syncNotchBounds(_expanded: boolean) {
  if (!mainWindow) return;

  const target = EXPANDED_NOTCH;
  NOTCH_WIDTH = target.width;
  NOTCH_HEIGHT = target.height;
  placeEdgeActivator();

  if (!mainWindow.isVisible()) return;

  await animateBoundsTo(target.width, target.height, 0);
}

const revealNotch = async () => {
  if (!mainWindow || animating || mainWindow.isVisible()) return;

  // cancel any running anim cleanly
  cancelAnim = true; await new Promise(r => setTimeout(r, 0)); cancelAnim = false;

  const wa = getWorkArea();
  const startY = Math.round(wa.y - NOTCH_HEIGHT + 2);
  const endY   = Math.round(wa.y);
  const x      = Math.round(wa.x + (wa.width - NOTCH_WIDTH) / 2);

  mainWindow.setBounds({ x, y: startY, width: NOTCH_WIDTH, height: NOTCH_HEIGHT });
  mainWindow.showInactive();

  await animateY(startY, endY, 196); // ~200ms
};

const hideNotch = async () => {
  if (!mainWindow || animating || !mainWindow.isVisible()) return;

  cancelAnim = true; await new Promise(r => setTimeout(r, 0)); cancelAnim = false;

  const wa = getWorkArea();
  const [ , yNow ] = mainWindow.getPosition();
  const startY = Math.round(yNow);
  const endY   = Math.round(wa.y - NOTCH_HEIGHT + 2);

  await animateY(startY, endY, 140); // ~140ms
  if (mainWindow && !cancelAnim) mainWindow.hide();
};

// Is cursor over notch rect (with margin)?
const cursorOverNotch = (margin = 6) => {
  if (!mainWindow) return false;
  const c = screen.getCursorScreenPoint();
  const [x, y] = mainWindow.getPosition();
  return (
    c.x >= x - margin && c.x <= x + NOTCH_WIDTH + margin &&
    c.y >= y - margin && c.y <= y + NOTCH_HEIGHT + margin
  );
};

// ---- windows ----
function createMainWindow() {
  if (isWin) app.setAppUserModelId('com.example.notch');

  mainWindow = new BrowserWindow({
    width: NOTCH_WIDTH, height: NOTCH_HEIGHT,
    minWidth: 448, maxWidth: 448, minHeight: 96, maxHeight: 96,
    useContentSize: true,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, focusable: true, backgroundColor: '#00000000',
    titleBarStyle: isMac ? 'hidden' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
    show: false,
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;

    // Cache final size once (guards against zero/NaN after hide/minimize)
    const b = mainWindow.getBounds();
    NOTCH_WIDTH  = Math.round(b.width || NOTCH_WIDTH);
    NOTCH_HEIGHT = Math.round(b.height || NOTCH_HEIGHT);

    placeMainAtTopCenter();
    placeEdgeActivator();

    setTimeout(() => {
      if (!mainWindow || mainWindow.isVisible()) return;
      NOTCH_WIDTH = EXPANDED_NOTCH.width;
      NOTCH_HEIGHT = EXPANDED_NOTCH.height;
      placeMainAtTopCenter();
      placeEdgeActivator();
      revealNotch().catch(() => {});
    }, 350);
  });

  mainWindow.on('minimize', () => {
    if (!isDev) {
      mainWindow?.hide();
    }
  });
  mainWindow.on('close', (e: Event) => {
    if (!isMac && !isDev) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('move', () => {
    if (!mainWindow) return;
    const wa = getWorkArea();
    const [ , y ] = mainWindow.getPosition();
    if (y <= wa.y + 40) placeMainAtTopCenter();
  });
}

let hoverArmed = false;
function createEdgeWindow() {
  edgeWindow = new BrowserWindow({
    ...topCenterFor(400, 2),
    frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: true,
    backgroundColor: '#00000000', webPreferences: { offscreen: false }, show: true,
  });
  edgeWindow.setIgnoreMouseEvents(true, { forward: true });
  edgeWindow.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">');

  // Reveal when cursor rests in the edge strip briefly
  setInterval(() => {
    if (!mainWindow || !edgeWindow) return;
    const c = screen.getCursorScreenPoint();
    const b = edgeWindow.getBounds();
    const inside = c.x >= b.x && c.x <= b.x + b.width && c.y >= b.y && c.y <= b.y + b.height;

    if (inside) {
      if (!hoverArmed) {
        hoverArmed = true;
        setTimeout(() => {
          if (hoverArmed && !mainWindow!.isVisible() && !animating) {
            placeMainAtTopCenter();
            revealNotch().catch(() => {});
          }
        }, 60);
      }
    } else {
      hoverArmed = false;
    }
  }, 30);

  // Hide when the cursor leaves the notch
  setInterval(() => {
    if (!mainWindow || animating) return;
    if (mainWindow.isVisible() && !cursorOverNotch(8)) {
      hideNotch().catch(() => {});
    }
  }, 120);
}

// ---- tray + shortcuts ----
function createTray() {
  if (isDev) return;
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Notch');
  const toggle = () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) hideNotch().catch(() => {});
    else { placeMainAtTopCenter(); revealNotch().catch(() => {}); }
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: toggle }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', toggle);
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) hideNotch().catch(() => {});
    else { placeMainAtTopCenter(); revealNotch().catch(() => {}); }
  });
}

// ---- IPC (unchanged) ----
ipcMain.handle('show-file-dialog', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'csv'] },
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'CSV Files', extensions: ['csv'] },
    ],
  });
  return result;
});
ipcMain.handle('read-file', async (_event, filePath: string) => {
  const fs = await import('fs/promises');
  const pathModule = await import('path');
  const buffer = await fs.readFile(filePath);
  return {
    data: Array.from(buffer),
    name: pathModule.basename(filePath),
  };
});
ipcMain.handle('open-external-url', async (_event, url: string) => {
  await shell.openExternal(url);
});
ipcMain.handle('set-notch-expanded', async (_event, expanded: boolean) => {
  await syncNotchBounds(expanded);
});
ipcMain.handle('show-window', () => {
  const target = EXPANDED_NOTCH;
  NOTCH_WIDTH = target.width;
  NOTCH_HEIGHT = target.height;
  placeMainAtTopCenter();
  placeEdgeActivator();
  revealNotch().catch(() => {});
});
ipcMain.handle('hide-window', () => { hideNotch().catch(() => {}); });
ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('close-window', () => { if (!isMac) hideNotch().catch(() => {}); else mainWindow?.close(); });

// ---- lifecycle ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock && !isDev) {
  app.quit();
} else {
  if (!isDev) {
    app.on('second-instance', () => { placeMainAtTopCenter(); revealNotch().catch(() => {}); });
  }

  app.whenReady().then(() => {
    createMainWindow();
    createEdgeWindow();
    createTray();
    registerShortcuts();

    screen.on('display-metrics-changed', () => { placeMainAtTopCenter(); placeEdgeActivator(); });
    screen.on('display-added',           () => { placeMainAtTopCenter(); placeEdgeActivator(); });
    screen.on('display-removed',         () => { placeMainAtTopCenter(); placeEdgeActivator(); });
  });
}

app.on('window-all-closed', () => { if (isMac) app.quit(); });
app.on('will-quit', () => { cancelAnim = true; globalShortcut.unregisterAll(); });
