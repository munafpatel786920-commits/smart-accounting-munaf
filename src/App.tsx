import React, { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { User, Ledger } from './types';
import { getGroupCategory } from './constants';
import Layout from './components/Layout';
import Gateway from './pages/Gateway';
import MasterSelection from './pages/MasterSelection';
import Dashboard from './pages/Dashboard';
import Ledgers from './pages/Ledgers';
import Groups from './pages/Groups';
import Units from './pages/Units';
import Godowns from './pages/Godowns';
import Vouchers from './pages/Vouchers';
import Inventory from './pages/Inventory';
import CostCenters from './pages/CostCenters';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import CompanyManagement from './pages/CompanyManagement';
import Payroll from './pages/Payroll';
import Login from './pages/Login';
import { CompanyProvider, useCompany } from './contexts/CompanyContext';
import { dataService, authService, isElectronEnvironment } from './services/dataService';
import { toast, Toaster } from 'sonner';
import './i18n';

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { activeCompany } = useCompany();
  const isOffline = isElectronEnvironment();

  // Auth Listener with Real-Time User Profile Sync
  useEffect(() => {
    console.log("Setting up auth listener (offline/online dual support)");
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = authService.onAuthStateChanged(async (authUser) => {
      console.log("Auth state changed:", authUser?.uid);
      
      // Clean up previous user doc subscription first
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      try {
        if (authUser) {
          const uid = authUser.uid;

          // If running in offline desktop workstation
          if (isOffline || authUser.isLocalUser) {
            const localUser: User = {
              uid: uid,
              email: authUser.email || 'offline@smartaccounting.local',
              displayName: authUser.displayName || 'Offline Administrator',
              role: 'admin',
              suspended: false,
              createdAt: new Date().toISOString()
            };
            setUser(localUser);
            setLoading(false);
            return;
          }
          
          // Online Firebase check
          const userDoc = await dataService.getDocument<User>('users', uid);

          if (userDoc && userDoc.suspended && authUser.email !== 'patelmunaf90@gmail.com') {
            console.log("User doc is marked suspended! Signing out immediately.");
            toast.error('Your account is suspended. Please contact patelmunaf90@gmail.com for support.');
            setUser(null);
            await authService.signOut();
            setLoading(false);
            return;
          }

          if (!userDoc) {
            console.log("User doc does not exist yet. Auto-creating user profile for:", uid);
            const newUser: User = {
              uid: uid,
              email: authUser.email || 'user@smartaccounting.com',
              displayName: authUser.displayName || (authUser.email === 'patelmunaf90@gmail.com' ? 'Super Admin' : (authUser.email?.split('@')[0] || 'Administrator')),
              role: 'admin',
              suspended: false,
              createdAt: new Date().toISOString()
            };
            try {
              await dataService.setDocument('users', uid, newUser);
            } catch (createErr) {
              console.warn("Could not write user profile to server:", createErr);
            }
            setUser(newUser);
          } else {
            setUser(userDoc);
          }

          console.log("Subscribing to user doc in real-time: ", uid);

          unsubscribeUserDoc = dataService.onSnapshotDoc<User>('users', uid, async (docData) => {
            try {
              if (docData) {
                if (docData.suspended && docData.email !== 'patelmunaf90@gmail.com') {
                  toast.error('Your account is suspended. Please contact patelmunaf90@gmail.com for support.');
                  await authService.signOut();
                  setUser(null);
                } else {
                  setUser(docData);
                }
              }
            } catch (err) {
              console.error("Error in user doc real-time snapshot listener:", err);
            } finally {
              setLoading(false);
            }
          }, (snapError) => {
            console.error("User doc snapshot subscription failed:", snapError);
            setLoading(false);
          });
        } else {
          console.log("No authenticated user, setting user to null");
          setUser(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        setLoading(false);
      }
    });

    return () => {
      console.log("Cleaning up auth listener");
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, [isOffline]);

  // Ledger & Defaults Logic
  useEffect(() => {
    if (!user || !activeCompany?.id) return;

    let unsubscribeLedgers: (() => void) | null = null;
    const uid = user.uid;
    const companyId = activeCompany.id;

    const initializeCompanyData = async () => {
      try {
        const cashId = `default_cash_${companyId}`;
        const plId = `default_pl_${companyId}`;
        const purchaseId = `default_purchase_${companyId}`;
        const salesId = `default_sales_${companyId}`;
        const cgstId = `default_cgst_${companyId}`;
        const sgstId = `default_sgst_${companyId}`;
        const igstId = `default_igst_${companyId}`;

        const [cashDoc, plDoc, purchaseDoc, salesDoc, cgstDoc, sgstDoc, igstDoc] = await Promise.all([
          dataService.getDocument<Ledger>('ledgers', cashId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', plId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', purchaseId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', salesId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', cgstId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', sgstId).catch(() => null),
          dataService.getDocument<Ledger>('ledgers', igstId).catch(() => null)
        ]);

        if (!cashDoc) {
          try {
            await dataService.setDocument('ledgers', cashId, {
              name: 'Cash',
              group: 'Cash-in-Hand',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize cash ledger:', e);
          }
        }

        if (!plDoc) {
          try {
            await dataService.setDocument('ledgers', plId, {
              name: 'Profit & Loss A/c',
              group: 'Reserves & Surplus',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize pl ledger:', e);
          }
        }

        if (!purchaseDoc) {
          try {
            await dataService.setDocument('ledgers', purchaseId, {
              name: 'Purchase A/c',
              group: 'Purchase Accounts',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize purchase ledger:', e);
          }
        }

        if (!salesDoc) {
          try {
            await dataService.setDocument('ledgers', salesId, {
              name: 'Sales A/c',
              group: 'Sales Accounts',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize sales ledger:', e);
          }
        }

        if (!cgstDoc) {
          try {
            await dataService.setDocument('ledgers', cgstId, {
              name: 'CGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize cgst ledger:', e);
          }
        }

        if (!sgstDoc) {
          try {
            await dataService.setDocument('ledgers', sgstId, {
              name: 'SGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize sgst ledger:', e);
          }
        }

        if (!igstDoc) {
          try {
            await dataService.setDocument('ledgers', igstId, {
              name: 'IGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: companyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Could not initialize igst ledger:', e);
          }
        }

        const conditions = [
          { field: 'companyId', operator: '==' as const, value: companyId }
        ];

        unsubscribeLedgers = dataService.onSnapshotCollection<Ledger>('ledgers', conditions, async (ledgers) => {
          const plId = `default_pl_${companyId}`;
          
          let totalIncome = 0;
          let totalExpenses = 0;

          ledgers.forEach(l => {
            if (l.id === plId) return;
            const category = getGroupCategory(l.group);
            if (category === 'Income') {
              totalIncome += -l.currentBalance;
            } else if (category === 'Expenses') {
              totalExpenses += l.currentBalance;
            }
          });

          const netProfit = totalIncome - totalExpenses;
          const currentPl = ledgers.find(d => d.id === plId);
          if (currentPl && currentPl.currentBalance !== -netProfit) {
            try {
              await dataService.updateDocument('ledgers', plId, { currentBalance: -netProfit });
            } catch (err) {
              // Ignore background balance update permissions error
            }
          }
        }, (err) => {
          console.warn("Company ledgers snapshot notice:", err?.message || err);
        });
      } catch (error: any) {
        const msg = error?.message || String(error);
        if (msg.includes('permission') || msg.includes('insufficient permissions')) {
          console.warn("Company data initialization notice:", msg);
        } else {
          console.error("Error initializing company data:", error);
        }
      }
    };

    initializeCompanyData();

    return () => {
      if (unsubscribeLedgers) unsubscribeLedgers();
    };
  }, [user?.uid, activeCompany?.id]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 font-mono">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#146e85]"></div>
          <span className="text-xs uppercase font-bold text-[#146e85] tracking-wider">Loading Smart Accounting...</span>
        </div>
      </div>
    );
  }

  const isElectronOrFile = isOffline || (typeof window !== 'undefined' && window.location.protocol === 'file:');
  const AppRouter = isElectronOrFile ? HashRouter : BrowserRouter;

  return (
    <AppRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route
          path="/"
          element={
            user ? (
              <Layout user={user} />
            ) : (
              <Navigate to="/login" />
            )
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="gateway" element={<Gateway />} />
          <Route path="masters" element={<MasterSelection />} />
          <Route path="ledgers" element={<Ledgers />} />
          <Route path="groups" element={<Groups />} />
          <Route path="units" element={<Units />} />
          <Route path="godowns" element={<Godowns />} />
          <Route path="cost-centers" element={<CostCenters />} />
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="company" element={<CompanyManagement />} />
          <Route path="payroll" element={<Payroll />} />
        </Route>
      </Routes>
    </AppRouter>
  );
}

export default function App() {
  return (
    <CompanyProvider>
      <Toaster position="top-right" richColors />
      <AppContent />
    </CompanyProvider>
  );
}
