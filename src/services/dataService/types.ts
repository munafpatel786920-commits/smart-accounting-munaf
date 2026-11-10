export type QueryOperator = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value: any;
}

export interface QueryOrder {
  field: string;
  direction: 'asc' | 'desc';
}

export interface BatchOperation {
  type: 'set' | 'insert' | 'update' | 'delete' | 'deleteWhere';
  collection: string;
  id?: string;
  data?: any;
  conditions?: QueryCondition[];
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role?: 'admin' | 'staff';
  isLocalUser?: boolean;
}

export interface BackupResult {
  success: boolean;
  filename: string;
  dataUrl?: string;
  binaryData?: Uint8Array;
  error?: string;
  recordCounts?: Record<string, number>;
}

export interface RestoreResult {
  success: boolean;
  count?: number;
  error?: string;
  restoredCollections?: Record<string, number>;
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  details?: Record<string, number>;
  error?: string;
}

export interface IDataService {
  getEnvironment(): 'web' | 'electron';
  isElectron(): boolean;

  // Querying and Realtime Listeners
  getDocuments<T = any>(collectionName: string, conditions?: QueryCondition[], order?: QueryOrder, limitCount?: number): Promise<T[]>;
  onSnapshotCollection<T = any>(
    collectionName: string,
    conditions: QueryCondition[] | undefined,
    callback: (docs: T[]) => void,
    onError?: (err: any) => void,
    order?: QueryOrder
  ): () => void;
  getDocument<T = any>(collectionName: string, id: string): Promise<T | null>;
  onSnapshotDoc<T = any>(
    collectionName: string,
    id: string,
    callback: (doc: T | null) => void,
    onError?: (err: any) => void
  ): () => void;

  // Mutations
  addDocument<T = any>(collectionName: string, data: T): Promise<{ id: string }>;
  setDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void>;
  updateDocument<T = any>(collectionName: string, id: string, data: Partial<T>): Promise<void>;
  deleteDocument(collectionName: string, id: string): Promise<void>;
  deleteDocuments(collectionName: string, conditions: QueryCondition[]): Promise<number>;
  batchWrite(operations: BatchOperation[]): Promise<void>;

  // Authentication
  getAuthUser(): AuthUser | null;
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<AuthUser>;
  signInLocal(email?: string, password?: string): Promise<AuthUser>;
  signOut(): Promise<void>;

  // Offline Backup, Restore & Firebase Sync
  backupDatabase(): Promise<BackupResult>;
  restoreDatabase(backupData: string | Uint8Array | object): Promise<RestoreResult>;
  importFromFirebase(firebaseData: Record<string, any[]>): Promise<ImportResult>;
  exportDatabase(): Promise<{ success: boolean; data?: any; filename?: string; error?: string }>;
}
