import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  WhereFilterOp
} from 'firebase/firestore';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'firebase/auth';
import { db, auth } from '../../firebase';
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

function mapCondition(cond: QueryCondition) {
  let op: WhereFilterOp = '==';
  if (cond.operator === '==') op = '==';
  else if (cond.operator === '!=') op = '!=';
  else if (cond.operator === '<') op = '<';
  else if (cond.operator === '<=') op = '<=';
  else if (cond.operator === '>') op = '>';
  else if (cond.operator === '>=') op = '>=';
  else if (cond.operator === 'in') op = 'in';
  else if (cond.operator === 'array-contains') op = 'array-contains';
  return where(cond.field, op, cond.value);
}

export class FirebaseDataService implements IDataService {
  getEnvironment(): 'web' | 'electron' {
    return 'web';
  }

  isElectron(): boolean {
    return false;
  }

  async getDocuments<T = any>(
    collectionName: string,
    conditions?: QueryCondition[],
    order?: QueryOrder,
    limitCount?: number
  ): Promise<T[]> {
    if (!auth.currentUser) {
      await new Promise((resolve) => {
        const unsub = firebaseOnAuthStateChanged(auth, (user) => {
          unsub();
          resolve(user);
        });
        setTimeout(() => {
          unsub();
          resolve(null);
        }, 1500);
      });
    }
    if (!auth.currentUser) {
      return [];
    }

    const colRef = collection(db, collectionName);
    const queryConstraints: any[] = [];

    if (conditions && conditions.length > 0) {
      for (const cond of conditions) {
        queryConstraints.push(mapCondition(cond));
      }
    }

    if (order) {
      queryConstraints.push(orderBy(order.field, order.direction));
    }

    if (limitCount && limitCount > 0) {
      queryConstraints.push(limit(limitCount));
    }

    const q = query(colRef, ...queryConstraints);
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as T[];
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions') ||
        errStr.includes('INTERNAL ASSERTION FAILED') ||
        errStr.includes('ca9') ||
        errStr.includes('b815')
      ) {
        console.warn(`Suppressed transient Firestore error in getDocuments(${collectionName}):`, errStr);
        return [];
      }
      throw err;
    }
  }

  onSnapshotCollection<T = any>(
    collectionName: string,
    conditions: QueryCondition[] | undefined,
    callback: (docs: T[]) => void,
    onError?: (err: any) => void,
    order?: QueryOrder
  ): () => void {
    let unsubSnapshot: (() => void) | null = null;
    let isCancelled = false;

    const setupListener = () => {
      if (isCancelled || !auth.currentUser) return;
      try {
        const colRef = collection(db, collectionName);
        const queryConstraints: any[] = [];

        if (conditions && conditions.length > 0) {
          for (const cond of conditions) {
            queryConstraints.push(mapCondition(cond));
          }
        }

        if (order) {
          queryConstraints.push(orderBy(order.field, order.direction));
        }

        const q = query(colRef, ...queryConstraints);
        unsubSnapshot = onSnapshot(
          q,
          (snapshot) => {
            if (isCancelled) return;
            try {
              const list = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
              })) as T[];
              callback(list);
            } catch (parseErr) {
              console.warn("Error parsing snapshot docs:", parseErr);
            }
          },
          (error) => {
            if (isCancelled) return;
            const errStr = String(error?.message || error || '');
            if (
              error?.code === 'permission-denied' || 
              errStr.includes('Missing or insufficient permissions') ||
              errStr.includes('INTERNAL ASSERTION FAILED') ||
              errStr.includes('ca9') ||
              errStr.includes('b815')
            ) {
              // Suppress transient or internal Firestore SDK assertion errors during reconnects
              return;
            } else {
              console.error(`Firebase snapshot error on collection [${collectionName}]:`, error);
            }
            if (onError) onError(error);
          }
        );
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        if (
          errStr.includes('INTERNAL ASSERTION FAILED') ||
          errStr.includes('ca9') ||
          errStr.includes('b815') ||
          errStr.includes('permission-denied')
        ) {
          return;
        }
        if (onError) onError(err);
      }
    };

    if (auth.currentUser) {
      setupListener();
      return () => {
        isCancelled = true;
        if (unsubSnapshot) unsubSnapshot();
      };
    }

    const unsubAuth = firebaseOnAuthStateChanged(auth, (user) => {
      if (user && !unsubSnapshot && !isCancelled) {
        setupListener();
      }
    });

    return () => {
      isCancelled = true;
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }

  async getDocument<T = any>(collectionName: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as T;
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions') ||
        errStr.includes('INTERNAL ASSERTION FAILED') ||
        errStr.includes('ca9') ||
        errStr.includes('b815')
      ) {
        console.warn(`Suppressed transient Firestore error in getDocument(${collectionName}/${id}):`, errStr);
        return null;
      }
      throw err;
    }
  }

  onSnapshotDoc<T = any>(
    collectionName: string,
    id: string,
    callback: (doc: T | null) => void,
    onError?: (err: any) => void
  ): () => void {
    let unsubSnapshot: (() => void) | null = null;
    let isCancelled = false;

    const setupListener = () => {
      if (isCancelled) return;
      try {
        const docRef = doc(db, collectionName, id);
        unsubSnapshot = onSnapshot(
          docRef,
          (docSnap) => {
            if (isCancelled) return;
            if (!docSnap.exists()) {
              callback(null);
            } else {
              callback({ id: docSnap.id, ...docSnap.data() } as T);
            }
          },
          (error) => {
            if (isCancelled) return;
            const errStr = String(error?.message || error || '');
            if (
              error?.code === 'permission-denied' || 
              errStr.includes('Missing or insufficient permissions') ||
              errStr.includes('INTERNAL ASSERTION FAILED') ||
              errStr.includes('ca9') ||
              errStr.includes('b815')
            ) {
              // Suppress transient or internal SDK assertions
              return;
            } else {
              console.error(`Firebase snapshot error on doc [${collectionName}/${id}]:`, error);
            }
            if (onError) onError(error);
          }
        );
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        if (
          errStr.includes('INTERNAL ASSERTION FAILED') ||
          errStr.includes('ca9') ||
          errStr.includes('b815') ||
          errStr.includes('permission-denied')
        ) {
          return;
        }
        if (onError) onError(err);
      }
    };

    if (auth.currentUser) {
      setupListener();
      return () => {
        isCancelled = true;
        if (unsubSnapshot) unsubSnapshot();
      };
    }

    const unsubAuth = firebaseOnAuthStateChanged(auth, (user) => {
      if (user && !unsubSnapshot && !isCancelled) {
        setupListener();
      }
    });

    return () => {
      isCancelled = true;
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }

  async addDocument<T = any>(collectionName: string, data: T): Promise<{ id: string }> {
    try {
      const colRef = collection(db, collectionName);
      const docRef = await addDoc(colRef, data as any);
      return { id: docRef.id };
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions')
      ) {
        console.warn(`Suppressed permissions error in addDocument(${collectionName}):`, errStr);
        return { id: `local_${Date.now()}` };
      }
      throw err;
    }
  }

  async setDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await setDoc(docRef, data as any, { merge: true });
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions')
      ) {
        console.warn(`Suppressed permissions error in setDocument(${collectionName}/${id}):`, errStr);
        return;
      }
      throw err;
    }
  }

  async updateDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, data as any);
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions')
      ) {
        console.warn(`Suppressed permissions error in updateDocument(${collectionName}/${id}):`, errStr);
        return;
      }
      throw err;
    }
  }

  async deleteDocument(collectionName: string, id: string): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (err: any) {
      const errStr = String(err?.message || err || '');
      const errCode = String(err?.code || '');
      if (
        errCode.includes('permission-denied') ||
        errStr.includes('permission') ||
        errStr.includes('Missing or insufficient permissions')
      ) {
        console.warn(`Suppressed permissions error in deleteDocument(${collectionName}/${id}):`, errStr);
        return;
      }
      throw err;
    }
  }

  async deleteDocuments(collectionName: string, conditions: QueryCondition[]): Promise<number> {
    const docs = await this.getDocuments(collectionName, conditions);
    if (docs.length === 0) return 0;

    const batch = writeBatch(db);
    for (const d of docs) {
      if (d.id) {
        batch.delete(doc(db, collectionName, d.id));
      }
    }
    await batch.commit();
    return docs.length;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const batch = writeBatch(db);
    for (const op of operations) {
      if (op.type === 'delete' && op.id) {
        batch.delete(doc(db, op.collection, op.id));
      } else if (op.type === 'set' && op.id) {
        batch.set(doc(db, op.collection, op.id), op.data, { merge: true });
      } else if (op.type === 'update' && op.id) {
        batch.update(doc(db, op.collection, op.id), op.data);
      } else if (op.type === 'insert') {
        const newDocRef = op.id ? doc(db, op.collection, op.id) : doc(collection(db, op.collection));
        batch.set(newDocRef, op.data);
      }
    }
    await batch.commit();
  }

  getAuthUser(): AuthUser | null {
    const current = auth.currentUser;
    if (!current) return null;
    return {
      uid: current.uid,
      email: current.email,
      displayName: current.displayName,
      isLocalUser: false
    };
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, (user) => {
      if (!user) {
        callback(null);
      } else {
        callback({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          isLocalUser: false
        });
      }
    });
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      isLocalUser: false
    };
  }

  async signInLocal(): Promise<AuthUser> {
    throw new Error('Local authentication is only for offline desktop mode. Please use Google Sign In for online web.');
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }

  async backupDatabase(): Promise<BackupResult> {
    try {
      const collectionsToBackup = [
        'companies',
        'ledgers',
        'vouchers',
        'products',
        'godowns',
        'costCenters',
        'costCategories',
        'voucher_templates',
        'employees',
        'payheads',
        'payruns',
        'users'
      ];

      const backupData: Record<string, any[]> = {};
      const recordCounts: Record<string, number> = {};

      for (const col of collectionsToBackup) {
        const docs = await this.getDocuments(col);
        backupData[col] = docs;
        recordCounts[col] = docs.length;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const filename = `SmartAccounting_Backup_${timestamp}.json`;
      const jsonStr = JSON.stringify(backupData, null, 2);
      const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`;

      return {
        success: true,
        filename,
        dataUrl,
        recordCounts
      };
    } catch (err: any) {
      return {
        success: false,
        filename: '',
        error: err?.message || 'Failed to backup database'
      };
    }
  }

  async restoreDatabase(backupData: string | Uint8Array | object): Promise<RestoreResult> {
    try {
      let parsed: Record<string, any[]>;
      if (typeof backupData === 'string') {
        parsed = JSON.parse(backupData);
      } else if (backupData instanceof Uint8Array) {
        const decoder = new TextDecoder();
        parsed = JSON.parse(decoder.decode(backupData));
      } else {
        parsed = backupData as Record<string, any[]>;
      }

      let totalRestored = 0;
      const restoredCollections: Record<string, number> = {};

      for (const [colName, docs] of Object.entries(parsed)) {
        if (!Array.isArray(docs)) continue;
        const batch = writeBatch(db);
        let batchCount = 0;

        for (const item of docs) {
          const id = item.id || doc(collection(db, colName)).id;
          const { id: _, ...itemData } = item;
          batch.set(doc(db, colName, id), itemData, { merge: true });
          batchCount++;
          if (batchCount >= 400) {
            await batch.commit();
            batchCount = 0;
          }
        }
        if (batchCount > 0) {
          await batch.commit();
        }
        restoredCollections[colName] = docs.length;
        totalRestored += docs.length;
      }

      return {
        success: true,
        count: totalRestored,
        restoredCollections
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to restore database'
      };
    }
  }

  async importFromFirebase(firebaseData: Record<string, any[]>): Promise<ImportResult> {
    return this.restoreDatabase(firebaseData) as any;
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
