const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ElectronSqliteEngine = require('./sqliteEngine.cjs');

let mainWindow = null;
let dbEngine = null;

// Local offline session state
let currentAuthUser = {
  uid: 'offline_admin_user',
  email: 'offline@smartaccounting.local',
  displayName: 'Offline Admin',
  role: 'admin',
  isLocalUser: true
};

function createWindow() {
  const userDataPath = app.getPath('userData');
  dbEngine = new ElectronSqliteEngine(userDataPath);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 1024,
    minHeight: 700,
    title: 'Smart Accounting System - Offline Edition',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Remove default menu for clean accounting workstation look
  mainWindow.setMenuBarVisibility(false);

  // In production load dist/index.html, in dev load localhost:3000
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev && process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function notifyCollectionChange(collection) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`db:change:${collection}`, { updated: true });
  }
}

// Register IPC handlers for SQLite database operations
function setupIpcHandlers() {
  ipcMain.handle('db:getDocuments', async (_event, { collection, conditions, order, limit }) => {
    return dbEngine.getDocuments(collection, conditions, order, limit);
  });

  ipcMain.handle('db:getDocument', async (_event, { collection, id }) => {
    return dbEngine.getDocument(collection, id);
  });

  ipcMain.handle('db:addDocument', async (_event, { collection, data }) => {
    const res = dbEngine.addDocument(collection, data);
    notifyCollectionChange(collection);
    return res;
  });

  ipcMain.handle('db:setDocument', async (_event, { collection, id, data }) => {
    dbEngine.setDocument(collection, id, data);
    notifyCollectionChange(collection);
    return true;
  });

  ipcMain.handle('db:updateDocument', async (_event, { collection, id, data }) => {
    dbEngine.updateDocument(collection, id, data);
    notifyCollectionChange(collection);
    return true;
  });

  ipcMain.handle('db:deleteDocument', async (_event, { collection, id }) => {
    dbEngine.deleteDocument(collection, id);
    notifyCollectionChange(collection);
    return true;
  });

  ipcMain.handle('db:deleteDocuments', async (_event, { collection, conditions }) => {
    const count = dbEngine.deleteDocuments(collection, conditions);
    notifyCollectionChange(collection);
    return count;
  });

  ipcMain.handle('db:batchWrite', async (_event, { operations }) => {
    dbEngine.batchWrite(operations);
    const affectedCollections = new Set(operations.map((op) => op.collection));
    affectedCollections.forEach(notifyCollectionChange);
    return true;
  });

  ipcMain.handle('db:backupDatabase', async () => {
    return dbEngine.backupDatabase();
  });

  ipcMain.handle('db:restoreDatabase', async (_event, { data }) => {
    const res = dbEngine.restoreDatabase(data);
    if (res.success) {
      Object.keys(dbEngine.data).forEach(notifyCollectionChange);
    }
    return res;
  });

  ipcMain.handle('db:importFromFirebase', async (_event, { data }) => {
    const res = dbEngine.importFromFirebase(data);
    if (res.success) {
      Object.keys(data).forEach(notifyCollectionChange);
    }
    return res;
  });

  ipcMain.handle('db:exportDatabase', async () => {
    return dbEngine.backupDatabase();
  });

  // Auth handlers
  ipcMain.handle('auth:getAuthUser', async () => {
    return currentAuthUser;
  });

  ipcMain.handle('auth:signInLocal', async (_event, { email }) => {
    currentAuthUser = {
      uid: 'offline_admin_user',
      email: email || 'offline@smartaccounting.local',
      displayName: 'Offline Admin',
      role: 'admin',
      isLocalUser: true
    };
    if (mainWindow) {
      mainWindow.webContents.send('auth:stateChanged', currentAuthUser);
    }
    return currentAuthUser;
  });

  ipcMain.handle('auth:signOut', async () => {
    currentAuthUser = null;
    if (mainWindow) {
      mainWindow.webContents.send('auth:stateChanged', null);
    }
    return true;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
