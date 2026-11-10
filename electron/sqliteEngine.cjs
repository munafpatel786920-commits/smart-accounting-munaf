const path = require('path');
const fs = require('fs');

/**
 * SQLite file storage engine for Electron Main Process.
 * Operates on persistent Windows application-data directory.
 */
class ElectronSqliteEngine {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.dbDir = path.join(userDataPath, 'database');
    this.dbPath = path.join(this.dbDir, 'smart_accounting.db');
    this.backupDir = path.join(userDataPath, 'backups');
    this.data = {
      companies: {},
      users: {},
      ledgers: {},
      vouchers: {},
      products: {},
      godowns: {},
      costCenters: {},
      costCategories: {},
      voucher_templates: {},
      employees: {},
      payheads: {},
      payruns: {},
      settings: {}
    };
    this.ensureDirectories();
    this.loadDatabase();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  loadDatabase() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
      } else {
        this.saveDatabase();
      }
    } catch (err) {
      console.error('Error loading SQLite database file:', err);
    }
  }

  saveDatabase() {
    try {
      this.ensureDirectories();
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving SQLite database file:', err);
    }
  }

  getDocuments(collectionName, conditions = [], order = null, limitCount = 0) {
    const col = this.data[collectionName] || {};
    let list = Object.values(col);

    if (conditions && conditions.length > 0) {
      list = list.filter((item) => {
        return conditions.every((cond) => {
          const val = item[cond.field];
          if (cond.operator === '==') return val === cond.value;
          if (cond.operator === '!=') return val !== cond.value;
          if (cond.operator === '<') return val < cond.value;
          if (cond.operator === '<=') return val <= cond.value;
          if (cond.operator === '>') return val > cond.value;
          if (cond.operator === '>=') return val >= cond.value;
          if (cond.operator === 'in' && Array.isArray(cond.value)) return cond.value.includes(val);
          return true;
        });
      });
    }

    if (order && order.field) {
      list.sort((a, b) => {
        const valA = a[order.field];
        const valB = b[order.field];
        if (valA < valB) return order.direction === 'desc' ? 1 : -1;
        if (valA > valB) return order.direction === 'desc' ? -1 : 1;
        return 0;
      });
    }

    if (limitCount && limitCount > 0) {
      list = list.slice(0, limitCount);
    }

    return list;
  }

  getDocument(collectionName, id) {
    const col = this.data[collectionName] || {};
    return col[id] || null;
  }

  addDocument(collectionName, docData) {
    if (!this.data[collectionName]) {
      this.data[collectionName] = {};
    }
    const id = docData.id || docData.uid || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const full = { ...docData, id };
    this.data[collectionName][id] = full;
    this.saveDatabase();
    return { id };
  }

  setDocument(collectionName, id, docData) {
    if (!this.data[collectionName]) {
      this.data[collectionName] = {};
    }
    const existing = this.data[collectionName][id] || {};
    this.data[collectionName][id] = { ...existing, ...docData, id };
    this.saveDatabase();
  }

  updateDocument(collectionName, id, docData) {
    this.setDocument(collectionName, id, docData);
  }

  deleteDocument(collectionName, id) {
    if (this.data[collectionName]) {
      delete this.data[collectionName][id];
      this.saveDatabase();
    }
  }

  deleteDocuments(collectionName, conditions) {
    const matching = this.getDocuments(collectionName, conditions);
    matching.forEach((doc) => {
      const id = doc.id || doc.uid;
      if (id) this.deleteDocument(collectionName, id);
    });
    return matching.length;
  }

  batchWrite(operations) {
    for (const op of operations) {
      if (op.type === 'delete' && op.id) {
        this.deleteDocument(op.collection, op.id);
      } else if (op.type === 'set' && op.id) {
        this.setDocument(op.collection, op.id, op.data);
      } else if (op.type === 'update' && op.id) {
        this.updateDocument(op.collection, op.id, op.data);
      } else if (op.type === 'insert') {
        this.addDocument(op.collection, op.data);
      }
    }
  }

  backupDatabase() {
    try {
      this.ensureDirectories();
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const filename = `SmartAccounting_Backup_${yyyy}-${mm}-${dd}_${hh}-${min}.db`;
      const backupPath = path.join(this.backupDir, filename);

      fs.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf8');

      const recordCounts = {};
      for (const [key, val] of Object.entries(this.data)) {
        recordCounts[key] = Object.keys(val).length;
      }

      return {
        success: true,
        filename,
        recordCounts
      };
    } catch (err) {
      return {
        success: false,
        filename: '',
        error: err.message
      };
    }
  }

  restoreDatabase(backupContent) {
    try {
      let parsed = backupContent;
      if (typeof backupContent === 'string') {
        parsed = JSON.parse(backupContent);
      }
      this.data = { ...this.data, ...parsed };
      this.saveDatabase();
      return {
        success: true,
        count: Object.keys(parsed).length
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  importFromFirebase(firebaseData) {
    try {
      let total = 0;
      const details = {};
      for (const [colName, items] of Object.entries(firebaseData)) {
        if (!this.data[colName]) {
          this.data[colName] = {};
        }
        if (Array.isArray(items)) {
          items.forEach((item) => {
            const id = item.id || item.uid || `imp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            this.data[colName][id] = { ...item, id };
            total++;
          });
          details[colName] = items.length;
        }
      }
      this.saveDatabase();
      return {
        success: true,
        importedCount: total,
        details
      };
    } catch (err) {
      return {
        success: false,
        importedCount: 0,
        error: err.message
      };
    }
  }
}

module.exports = ElectronSqliteEngine;
