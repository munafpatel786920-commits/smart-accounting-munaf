const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getEnvironment: () => 'electron',
  db: {
    getDocuments: (collection, conditions, order, limit) =>
      ipcRenderer.invoke('db:getDocuments', { collection, conditions, order, limit }),
    getDocument: (collection, id) =>
      ipcRenderer.invoke('db:getDocument', { collection, id }),
    addDocument: (collection, data) =>
      ipcRenderer.invoke('db:addDocument', { collection, data }),
    setDocument: (collection, id, data) =>
      ipcRenderer.invoke('db:setDocument', { collection, id, data }),
    updateDocument: (collection, id, data) =>
      ipcRenderer.invoke('db:updateDocument', { collection, id, data }),
    deleteDocument: (collection, id) =>
      ipcRenderer.invoke('db:deleteDocument', { collection, id }),
    deleteDocuments: (collection, conditions) =>
      ipcRenderer.invoke('db:deleteDocuments', { collection, conditions }),
    batchWrite: (operations) =>
      ipcRenderer.invoke('db:batchWrite', { operations }),
    backupDatabase: () =>
      ipcRenderer.invoke('db:backupDatabase'),
    restoreDatabase: (data) =>
      ipcRenderer.invoke('db:restoreDatabase', { data }),
    importFromFirebase: (data) =>
      ipcRenderer.invoke('db:importFromFirebase', { data }),
    exportDatabase: () =>
      ipcRenderer.invoke('db:exportDatabase'),
    onSnapshot: (collection, callback) => {
      const channel = `db:change:${collection}`;
      const listener = (_event, data) => callback(data);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  },
  auth: {
    getAuthUser: () =>
      ipcRenderer.invoke('auth:getAuthUser'),
    onAuthStateChanged: (callback) => {
      const listener = (_event, user) => callback(user);
      ipcRenderer.on('auth:stateChanged', listener);
      return () => ipcRenderer.removeListener('auth:stateChanged', listener);
    },
    signInLocal: (email, password) =>
      ipcRenderer.invoke('auth:signInLocal', { email, password }),
    signOut: () =>
      ipcRenderer.invoke('auth:signOut')
  }
});
