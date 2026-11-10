import { IDataService, AuthUser, QueryCondition, QueryOrder, BatchOperation } from './types';
import { FirebaseDataService } from './firebaseService';
import { LocalSqliteService } from './localSqliteService';

// Determine environment
function detectIsElectron(): boolean {
  if (typeof window !== 'undefined') {
    if (window.electronAPI?.isElectron) return true;
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) return true;
  }
  return false;
}

// Singleton instances
const firebaseInstance = new FirebaseDataService();
const sqliteInstance = new LocalSqliteService();

export function isElectronEnvironment(): boolean {
  return detectIsElectron();
}

export function getDataService(): IDataService {
  if (isElectronEnvironment()) {
    return sqliteInstance;
  }
  return firebaseInstance;
}

// Primary exported DataService
export const dataService: IDataService = new Proxy({} as IDataService, {
  get(_target, prop) {
    const activeService = getDataService() as any;
    const value = activeService[prop];
    if (typeof value === 'function') {
      return value.bind(activeService);
    }
    return value;
  }
});

// Primary exported AuthService
export const authService = {
  getUser(): AuthUser | null {
    return getDataService().getAuthUser();
  },
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    return getDataService().onAuthStateChanged(callback);
  },
  signInWithGoogle(): Promise<AuthUser> {
    return getDataService().signInWithGoogle();
  },
  signInLocal(email?: string, password?: string): Promise<AuthUser> {
    return getDataService().signInLocal(email, password);
  },
  signOut(): Promise<void> {
    return getDataService().signOut();
  }
};

export * from './types';
export { FirebaseDataService } from './firebaseService';
export { LocalSqliteService } from './localSqliteService';
