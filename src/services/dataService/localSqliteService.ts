import initSqlJs, { Database } from 'sql.js';
import {
  IDataService,
  QueryCondition,
  QueryOrder,
  BatchOperation,
  AuthUser,
  BackupResult,
  RestoreResult,
  ImportResult
} from './types';

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getEnvironment: () => 'web' | 'electron';
      db: {
        getDocuments: (collection: string, conditions?: QueryCondition[], order?: QueryOrder, limit?: number) => Promise<any[]>;
        getDocument: (collection: string, id: string) => Promise<any>;
        addDocument: (collection: string, data: any) => Promise<{ id: string }>;
        setDocument: (collection: string, id: string, data: any) => Promise<void>;
        updateDocument: (collection: string, id: string, data: any) => Promise<void>;
        deleteDocument: (collection: string, id: string) => Promise<void>;
        deleteDocuments: (collection: string, conditions: QueryCondition[]) => Promise<number>;
        batchWrite: (operations: BatchOperation[]) => Promise<void>;
        backupDatabase: () => Promise<BackupResult>;
        restoreDatabase: (data: string | Uint8Array | object) => Promise<RestoreResult>;
        importFromFirebase: (data: Record<string, any[]>) => Promise<ImportResult>;
        exportDatabase: () => Promise<{ success: boolean; data?: any; filename?: string; error?: string }>;
        onSnapshot: (collection: string, callback: (docs: any[]) => void) => () => void;
      };
      auth: {
        getAuthUser: () => Promise<AuthUser | null>;
        onAuthStateChanged: (callback: (user: AuthUser | null) => void) => () => void;
        signInLocal: (email?: string, password?: string) => Promise<AuthUser>;
        signOut: () => Promise<void>;
      };
    };
  }
}

const LOCAL_STORAGE_SQLITE_KEY = 'smart_accounting_sqlite_db_v1';
const LOCAL_STORAGE_USER_KEY = 'smart_accounting_local_auth_user';

export class LocalSqliteService implements IDataService {
  private db: Database | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private listeners: Map<string, Set<(docs: any[]) => void>> = new Map();
  private authListeners: Set<(user: AuthUser | null) => void> = new Set();
  private currentLocalUser: AuthUser | null = null;

  constructor() {
    this.restoreLocalUser();
  }

  private restoreLocalUser() {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      if (saved) {
        this.currentLocalUser = JSON.parse(saved);
      } else {
        // Default local offline user
        this.currentLocalUser = {
          uid: 'offline_admin_user',
          email: 'offline@smartaccounting.local',
          displayName: 'Offline Admin',
          role: 'admin',
          isLocalUser: true
        };
      }
    } catch {
      this.currentLocalUser = {
        uid: 'offline_admin_user',
        email: 'offline@smartaccounting.local',
        displayName: 'Offline Admin',
        role: 'admin',
        isLocalUser: true
      };
    }
  }

  getEnvironment(): 'web' | 'electron' {
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      return 'electron';
    }
    return 'electron'; // LocalSqliteService is the offline desktop/SQLite engine
  }

  isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isElectron()) {
      return;
    }
    if (this.isInitialized && this.db) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
        });

        const savedDb = localStorage.getItem(LOCAL_STORAGE_SQLITE_KEY);
        if (savedDb) {
          try {
            const binaryArray = Uint8Array.from(atob(savedDb), (c) => c.charCodeAt(0));
            this.db = new SQL.Database(binaryArray);
          } catch (e) {
            console.warn('Could not parse existing SQLite DB from storage, creating fresh instance:', e);
            this.db = new SQL.Database();
          }
        } else {
          this.db = new SQL.Database();
        }

        this.createTablesIfNotExist();
        this.isInitialized = true;
      } catch (err) {
        console.error('Failed to initialize sql.js in browser:', err);
        // Create in-memory fallback if sql.js CDN fails
        const SQL = await initSqlJs({});
        this.db = new SQL.Database();
        this.createTablesIfNotExist();
        this.isInitialized = true;
      }
    })();

    return this.initPromise;
  }

  private createTablesIfNotExist() {
    if (!this.db) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        gstNumber TEXT,
        country TEXT,
        state TEXT,
        financialYear TEXT,
        logoUrl TEXT,
        useSeparateQtyColumns INTEGER,
        enableGst INTEGER,
        enableDiscount INTEGER,
        enableGodowns INTEGER,
        enableBatches INTEGER,
        enableCostCenters INTEGER,
        enablePayroll INTEGER,
        enablePosInvoice INTEGER,
        enableBOM INTEGER,
        useSecurity INTEGER,
        securityUsername TEXT,
        securityPassword TEXT,
        voucherSettings TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        email TEXT,
        displayName TEXT,
        role TEXT,
        createdAt TEXT,
        suspended INTEGER,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS ledgers (
        id TEXT PRIMARY KEY,
        name TEXT,
        groupName TEXT,
        openingBalance REAL,
        balanceType TEXT,
        currentBalance REAL,
        gstNumber TEXT,
        address TEXT,
        phone TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        costCentersEnabled INTEGER,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        id TEXT PRIMARY KEY,
        type TEXT,
        mode TEXT,
        date TEXT,
        voucherNumber TEXT,
        orderNumber TEXT,
        referenceVoucherId TEXT,
        referenceOrderNo TEXT,
        skipStockUpdate INTEGER,
        ledgerId TEXT,
        salesPurchaseLedgerId TEXT,
        debitLedgerId TEXT,
        creditLedgerId TEXT,
        ledgerName TEXT,
        amount REAL,
        gstRate REAL,
        withTax INTEGER,
        cgst REAL,
        sgst REAL,
        igst REAL,
        taxType TEXT,
        vatAmount REAL,
        tdsAmount REAL,
        exciseAmount REAL,
        serviceTaxAmount REAL,
        totalAmount REAL,
        narration TEXT,
        status TEXT,
        items TEXT,
        isInterState INTEGER,
        useSeparateQtyColumns INTEGER,
        isPos INTEGER,
        posPaymentMode TEXT,
        posCashReceived REAL,
        posCashReturned REAL,
        posCardAmount REAL,
        posCashAmount REAL,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        manufacturedProductId TEXT,
        manufacturedQuantity REAL,
        manufacturedGodownId TEXT,
        additionalCharges TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        hsnCode TEXT,
        unit TEXT,
        openingStock REAL,
        stockQuantity REAL,
        purchasePrice REAL,
        salesPrice REAL,
        gstRate REAL,
        decimalPlaces INTEGER,
        minStockLevel REAL,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        enableBom INTEGER,
        bom TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS godowns (
        id TEXT PRIMARY KEY,
        name TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS costCenters (
        id TEXT PRIMARY KEY,
        name TEXT,
        categoryId TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS costCategories (
        id TEXT PRIMARY KEY,
        name TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS voucher_templates (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        mode TEXT,
        ledgerId TEXT,
        salesPurchaseLedgerId TEXT,
        debitLedgerId TEXT,
        creditLedgerId TEXT,
        amount REAL,
        gstRate REAL,
        withTax INTEGER,
        narration TEXT,
        items TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT,
        employeeId TEXT,
        designation TEXT,
        department TEXT,
        dateOfJoining TEXT,
        basicPay REAL,
        bankName TEXT,
        bankAccount TEXT,
        pfNumber TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS payheads (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        calculationType TEXT,
        defaultValue REAL,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS payruns (
        id TEXT PRIMARY KEY,
        month TEXT,
        notes TEXT,
        companyId TEXT,
        createdBy TEXT,
        createdAt TEXT,
        records TEXT,
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updatedAt TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ledgers_company ON ledgers(companyId);
      CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers(companyId);
      CREATE INDEX IF NOT EXISTS idx_products_company ON products(companyId);
      CREATE INDEX IF NOT EXISTS idx_godowns_company ON godowns(companyId);
      CREATE INDEX IF NOT EXISTS idx_costCenters_company ON costCenters(companyId);
      CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(companyId);
      CREATE INDEX IF NOT EXISTS idx_payruns_company ON payruns(companyId);
    `;

    this.db.run(schema);
    this.saveToStorage();
  }

  private saveToStorage() {
    if (!this.db || this.isElectron()) return;
    try {
      const data = this.db.export();
      let binary = '';
      const len = data.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
      }
      const base64 = btoa(binary);
      localStorage.setItem(LOCAL_STORAGE_SQLITE_KEY, base64);
    } catch (e) {
      console.warn('Failed to persist SQLite DB to localStorage:', e);
    }
  }

  private notifyCollectionChange(collectionName: string) {
    const list = this.listeners.get(collectionName);
    if (list) {
      this.getDocuments(collectionName).then((docs) => {
        list.forEach((cb) => cb(docs));
      });
    }
  }

  async getDocuments<T = any>(
    collectionName: string,
    conditions?: QueryCondition[],
    order?: QueryOrder,
    limitCount?: number
  ): Promise<T[]> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getDocuments(collectionName, conditions, order, limitCount);
    }

    await this.ensureInitialized();
    if (!this.db) return [];

    let sql = `SELECT * FROM ${collectionName}`;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (conditions && conditions.length > 0) {
      for (const cond of conditions) {
        if (cond.operator === '==') {
          whereClauses.push(`${cond.field} = ?`);
          params.push(cond.value);
        } else if (cond.operator === '!=') {
          whereClauses.push(`${cond.field} != ?`);
          params.push(cond.value);
        } else if (cond.operator === '<') {
          whereClauses.push(`${cond.field} < ?`);
          params.push(cond.value);
        } else if (cond.operator === '<=') {
          whereClauses.push(`${cond.field} <= ?`);
          params.push(cond.value);
        } else if (cond.operator === '>') {
          whereClauses.push(`${cond.field} > ?`);
          params.push(cond.value);
        } else if (cond.operator === '>=') {
          whereClauses.push(`${cond.field} >= ?`);
          params.push(cond.value);
        }
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ` + whereClauses.join(' AND ');
    }

    if (order) {
      sql += ` ORDER BY ${order.field} ${order.direction.toUpperCase()}`;
    }

    if (limitCount && limitCount > 0) {
      sql += ` LIMIT ${limitCount}`;
    }

    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const results: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        if (row.raw_json) {
          try {
            const parsed = JSON.parse(row.raw_json);
            results.push({ id: row.id || row.uid, ...parsed });
          } catch {
            results.push(row as T);
          }
        } else {
          results.push(row as T);
        }
      }
      stmt.free();
      return results;
    } catch (err) {
      console.warn(`Query on ${collectionName} error:`, err);
      return [];
    }
  }

  onSnapshotCollection<T = any>(
    collectionName: string,
    conditions: QueryCondition[] | undefined,
    callback: (docs: T[]) => void,
    onError?: (err: any) => void,
    order?: QueryOrder
  ): () => void {
    if (this.isElectron() && window.electronAPI) {
      // Electron subscription
      const unsub = window.electronAPI.db.onSnapshot(collectionName, async () => {
        try {
          const docs = await this.getDocuments<T>(collectionName, conditions, order);
          callback(docs);
        } catch (e) {
          if (onError) onError(e);
        }
      });
      // Initial fetch
      this.getDocuments<T>(collectionName, conditions, order)
        .then(callback)
        .catch((e) => onError && onError(e));
      return unsub;
    }

    let colListeners = this.listeners.get(collectionName);
    if (!colListeners) {
      colListeners = new Set();
      this.listeners.set(collectionName, colListeners);
    }

    const listener = async () => {
      try {
        const docs = await this.getDocuments<T>(collectionName, conditions, order);
        callback(docs);
      } catch (err) {
        if (onError) onError(err);
      }
    };

    colListeners.add(listener);

    // Trigger initial load
    listener();

    return () => {
      colListeners?.delete(listener);
    };
  }

  async getDocument<T = any>(collectionName: string, id: string): Promise<T | null> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.getDocument(collectionName, id);
    }

    await this.ensureInitialized();
    if (!this.db) return null;

    const keyField = collectionName === 'users' ? 'uid' : 'id';
    try {
      const stmt = this.db.prepare(`SELECT * FROM ${collectionName} WHERE ${keyField} = ? LIMIT 1`);
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        stmt.free();
        if (row.raw_json) {
          return { id, ...JSON.parse(row.raw_json) } as T;
        }
        return row as T;
      }
      stmt.free();
      return null;
    } catch (err) {
      console.warn(`getDocument ${collectionName}/${id} error:`, err);
      return null;
    }
  }

  onSnapshotDoc<T = any>(
    collectionName: string,
    id: string,
    callback: (doc: T | null) => void,
    onError?: (err: any) => void
  ): () => void {
    const listener = () => {
      this.getDocument<T>(collectionName, id)
        .then((doc) => callback(doc))
        .catch((err) => {
          if (onError) onError(err);
        });
    };

    let colListeners = this.listeners.get(collectionName);
    if (!colListeners) {
      colListeners = new Set();
      this.listeners.set(collectionName, colListeners);
    }
    colListeners.add(listener);

    // Initial query
    listener();

    return () => {
      colListeners?.delete(listener);
    };
  }

  async addDocument<T = any>(collectionName: string, data: T): Promise<{ id: string }> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.addDocument(collectionName, data);
    }

    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const generatedId = (data as any).id || (data as any).uid || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullData = { ...(data as any), id: generatedId };

    await this.setDocument(collectionName, generatedId, fullData);
    return { id: generatedId };
  }

  async setDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.db.setDocument(collectionName, id, data);
      return;
    }

    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const keyField = collectionName === 'users' ? 'uid' : 'id';
    const rawJson = JSON.stringify({ ...data, [keyField]: id });

    const sql = `INSERT OR REPLACE INTO ${collectionName} (${keyField}, raw_json) VALUES (?, ?)`;
    this.db.run(sql, [id, rawJson]);

    // Also populate common fields if available
    this.syncIndexedFields(collectionName, id, data);

    this.saveToStorage();
    this.notifyCollectionChange(collectionName);
  }

  private syncIndexedFields(collectionName: string, id: string, data: any) {
    if (!this.db) return;
    const keyField = collectionName === 'users' ? 'uid' : 'id';
    const fieldsToUpdate: string[] = [];
    const values: any[] = [];

    if (data.companyId !== undefined) {
      fieldsToUpdate.push('companyId = ?');
      values.push(data.companyId);
    }
    if (data.name !== undefined) {
      fieldsToUpdate.push('name = ?');
      values.push(data.name);
    }
    if (data.createdBy !== undefined) {
      fieldsToUpdate.push('createdBy = ?');
      values.push(data.createdBy);
    }
    if (data.createdAt !== undefined) {
      fieldsToUpdate.push('createdAt = ?');
      values.push(data.createdAt);
    }

    if (fieldsToUpdate.length > 0) {
      values.push(id);
      try {
        this.db.run(`UPDATE ${collectionName} SET ${fieldsToUpdate.join(', ')} WHERE ${keyField} = ?`, values);
      } catch {
        // Ignored if column doesn't exist on this specific table
      }
    }
  }

  async updateDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.db.updateDocument(collectionName, id, data);
      return;
    }

    const existing = await this.getDocument(collectionName, id);
    const merged = { ...(existing || {}), ...data };
    await this.setDocument(collectionName, id, merged);
  }

  async deleteDocument(collectionName: string, id: string): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.db.deleteDocument(collectionName, id);
      return;
    }

    await this.ensureInitialized();
    if (!this.db) return;

    const keyField = collectionName === 'users' ? 'uid' : 'id';
    this.db.run(`DELETE FROM ${collectionName} WHERE ${keyField} = ?`, [id]);
    this.saveToStorage();
    this.notifyCollectionChange(collectionName);
  }

  async deleteDocuments(collectionName: string, conditions: QueryCondition[]): Promise<number> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.deleteDocuments(collectionName, conditions);
    }

    const docs = await this.getDocuments(collectionName, conditions);
    for (const d of docs) {
      if (d.id || d.uid) {
        await this.deleteDocument(collectionName, d.id || d.uid);
      }
    }
    return docs.length;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.db.batchWrite(operations);
      return;
    }

    await this.ensureInitialized();
    for (const op of operations) {
      if (op.type === 'delete' && op.id) {
        await this.deleteDocument(op.collection, op.id);
      } else if (op.type === 'set' && op.id) {
        await this.setDocument(op.collection, op.id, op.data);
      } else if (op.type === 'update' && op.id) {
        await this.updateDocument(op.collection, op.id, op.data);
      } else if (op.type === 'insert') {
        await this.addDocument(op.collection, op.data);
      }
    }
  }

  getAuthUser(): AuthUser | null {
    return this.currentLocalUser;
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.auth.onAuthStateChanged(callback);
    }

    this.authListeners.add(callback);
    callback(this.currentLocalUser);
    return () => {
      this.authListeners.delete(callback);
    };
  }

  async signInWithGoogle(): Promise<AuthUser> {
    // In local desktop mode, Google OAuth isn't needed; provide local admin session
    return this.signInLocal();
  }

  async signInLocal(email?: string, password?: string): Promise<AuthUser> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.auth.signInLocal(email, password);
    }

    const isSuperAdmin = (email?.toLowerCase().trim() === 'patelmunaf90@gmail.com');
    const user: AuthUser = {
      uid: isSuperAdmin ? 'Lp55TQ0xXpVe6Rb5t2eu3eg0iEU2' : 'offline_admin_user',
      email: email || 'offline@smartaccounting.local',
      displayName: isSuperAdmin ? 'Super Admin' : 'Offline Admin',
      role: 'admin',
      isLocalUser: true
    };
    this.currentLocalUser = user;
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
    this.authListeners.forEach((cb) => cb(user));
    return user;
  }

  async signOut(): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.auth.signOut();
      return;
    }

    this.currentLocalUser = null;
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    this.authListeners.forEach((cb) => cb(null));
  }

  async backupDatabase(): Promise<BackupResult> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.backupDatabase();
    }

    await this.ensureInitialized();
    if (!this.db) {
      return { success: false, filename: '', error: 'SQLite Database not initialized' };
    }

    try {
      const binaryData = this.db.export();
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const filename = `SmartAccounting_Backup_${yyyy}-${mm}-${dd}_${hh}-${min}.db`;

      const blob = new Blob([binaryData], { type: 'application/x-sqlite3' });
      const dataUrl = URL.createObjectURL(blob);

      return {
        success: true,
        filename,
        dataUrl,
        binaryData
      };
    } catch (err: any) {
      return {
        success: false,
        filename: '',
        error: err?.message || 'Failed to export SQLite database'
      };
    }
  }

  async restoreDatabase(backupData: string | Uint8Array | object): Promise<RestoreResult> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.restoreDatabase(backupData);
    }

    try {
      const SQL = await initSqlJs({
        locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
      });

      if (backupData instanceof Uint8Array) {
        this.db = new SQL.Database(backupData);
      } else if (typeof backupData === 'string' && backupData.startsWith('data:')) {
        const base64 = backupData.split(',')[1];
        const binaryString = atob(base64);
        const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
        this.db = new SQL.Database(bytes);
      } else if (typeof backupData === 'object') {
        return this.importFromFirebase(backupData as Record<string, any[]>);
      } else {
        throw new Error('Unsupported backup format. Please provide a .db binary or JSON backup.');
      }

      this.createTablesIfNotExist();
      this.saveToStorage();

      return {
        success: true,
        count: 1
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to restore SQLite database'
      };
    }
  }

  async importFromFirebase(firebaseData: Record<string, any[]>): Promise<ImportResult> {
    if (this.isElectron() && window.electronAPI) {
      return window.electronAPI.db.importFromFirebase(firebaseData);
    }

    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    let totalImported = 0;
    const details: Record<string, number> = {};

    for (const [colName, items] of Object.entries(firebaseData)) {
      if (!Array.isArray(items)) continue;
      let count = 0;
      for (const item of items) {
        const id = item.id || item.uid || `imp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await this.setDocument(colName, id, item);
        count++;
      }
      details[colName] = count;
      totalImported += count;
    }

    return {
      success: true,
      importedCount: totalImported,
      details
    };
  }

  async exportDatabase(): Promise<{ success: boolean; data?: any; filename?: string; error?: string }> {
    const res = await this.backupDatabase();
    return {
      success: res.success,
      data: res.dataUrl,
      filename: res.filename,
      error: res.error
    };
  }
}
