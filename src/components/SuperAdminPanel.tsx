import React, { useState, useEffect } from 'react';
import { 
  Users, Receipt, CreditCard, LogOut, Search, 
  Trash2, ShieldCheck, ShieldAlert, Sparkles, RefreshCw, KeyRound, 
  UserPlus, Check, X, Edit3, Save, Eye, EyeOff, Key, UserCheck, ShieldClose
} from 'lucide-react';
import { 
  collection, onSnapshot, doc, deleteDoc, updateDoc, setDoc,
  getDocs, query, orderBy, where
} from 'firebase/firestore';
import { db, auth, firebaseConfig } from '../firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface SuperAdminPanelProps {
  user: {
    uid: string;
    email: string;
    displayName: string;
  };
  onSwitchToAccounting?: () => void;
}

export default function SuperAdminPanel({ user, onSwitchToAccounting }: SuperAdminPanelProps) {
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // New User Form State
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  // Edit User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');

  // Delete User Confirmation ID State
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);

  // Identity Toolkit API Enablement helper
  const [apiEnablementError, setApiEnablementError] = useState<string | null>(null);
  const [emailInUseDetails, setEmailInUseDetails] = useState<{ email: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // Subscribe to users collection sorted by registration date
    const unsubscribeUsers = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')), 
      (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsersList(users);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching users collection:', err);
        toast.error('Error loading users catalog list');
        setLoading(false);
      }
    );

    return () => {
      unsubscribeUsers();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Mimic refresh feel cleanly
    setTimeout(() => {
      setRefreshing(false);
      toast.success('System stats refreshed successfully');
    }, 400);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('Super admin signed out successfully');
    } catch (err: any) {
      toast.error('Logout failed: ' + err.message);
    }
  };

  // Generate a random strong password for easy entry
  const handleAutoGeneratePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
    let generated = '';
    for (let i = 0; i < 10; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(generated);
    setShowPassword(true);
    toast.success('Suggested random password generated');
  };

  // Create User using secondary Auth App instance to avoid logging out super admin
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newDisplayName) {
      toast.error('Please fill in all registration fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must contain at least 6 characters');
      return;
    }

    setCreatingUser(true);
    setEmailInUseDetails(null);
    const tempAppName = 'temp-user-gen-' + Date.now();
    let tempApp: any = null;

    try {
      // 1. Initialize secondary Firebase app
      tempApp = initializeApp(firebaseConfig, tempAppName);
      const tempAuth = getAuth(tempApp);

      // 2. Register real user credentials
      const userCredential = await createUserWithEmailAndPassword(tempAuth, newEmail, newPassword);
      const registeredUid = userCredential.user.uid;

      // 3. Write User document to users Collection in main Firestore instance
      await setDoc(doc(db, 'users', registeredUid), {
        uid: registeredUid,
        email: newEmail.toLowerCase().trim(),
        displayName: newDisplayName.trim(),
        role: newRole,
        suspended: true,
        createdAt: new Date().toISOString()
      });

      toast.success(`Registered account [${newEmail}] with No Access (Suspended). Click Activate to grant access.`);
      
      // Reset registration form
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('staff');
      setShowPassword(false);
      setEmailInUseDetails(null);
    } catch (err: any) {
      console.error("Register Error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setEmailInUseDetails({ email: newEmail });
        toast.error('This email ID is already registered in Firebase Authentication. Since you requested re-registration, you can use the Force Re-register option.');
      } else if (err.code === 'auth/weak-password') {
        toast.error('The selected password is too weak. Must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        toast.error('The email address format is invalid.');
      } else {
        toast.error('Failed to create account: ' + err.message);
      }
    } finally {
      // 4. Safe cleanup of secondary App
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch (cleanupErr) {
          console.error("Error cleaning up temp app state:", cleanupErr);
        }
      }
      setCreatingUser(false);
    }
  };

  // Force clean login record and re-register
  const handleForceCleanAndRegister = async () => {
    if (!newEmail || !newPassword || !newDisplayName) {
      toast.error('Please fill in all registration fields first');
      return;
    }
    const targetEmail = newEmail.trim();
    const targetDisplayName = newDisplayName.trim();
    const targetPassword = newPassword;
    const targetRole = newRole;

    const toastId = toast.loading(`Cleaning up and re-registering ${targetEmail}...`);
    try {
      // Step 1: Call backend to purge any existing Auth account with this email
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: targetEmail })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errMsg = errorData.error || '';
        if (errMsg.includes('identitytoolkit.googleapis.com') || errMsg.includes('Identity Toolkit') || errMsg.includes('developers.google.com')) {
          setApiEnablementError(errMsg);
          throw new Error('Identity Toolkit API must be enabled for cleanup of auth registry.');
        } else {
          throw new Error(errMsg || 'Failed to remove user from database authenticator registry.');
        }
      }

      toast.loading(`OAuth login cleaned. Retrying fresh registration for ${targetEmail}...`, { id: toastId });

      // Step 2: Perform fresh registration
      const tempAppName = 'temp-user-gen-' + Date.now();
      const tempApp = initializeApp(firebaseConfig, tempAppName);
      try {
        const tempAuth = getAuth(tempApp);
        const userCredential = await createUserWithEmailAndPassword(tempAuth, targetEmail, targetPassword);
        const registeredUid = userCredential.user.uid;

        // Write User document to users Collection in main Firestore instance
        await setDoc(doc(db, 'users', registeredUid), {
          uid: registeredUid,
          email: targetEmail.toLowerCase(),
          displayName: targetDisplayName,
          role: targetRole,
          suspended: true,
          createdAt: new Date().toISOString()
        });

        toast.success(`Forced re-registration completed for [${targetEmail}] with No Access (Suspended).`, { id: toastId });
        
        // Reset state
        setNewEmail('');
        setNewPassword('');
        setNewDisplayName('');
        setNewRole('staff');
        setShowPassword(false);
        setEmailInUseDetails(null);
      } finally {
        await deleteApp(tempApp);
      }
    } catch (err: any) {
      console.error("Force clean & register failed:", err);
      toast.error('Failed to clear and re-register: ' + err.message, { id: toastId });
    }
  };

  // Suspend or Reactivate Account
  const handleToggleSuspension = async (userRecord: any) => {
    if (userRecord.email === 'patelmunaf90@gmail.com') {
      toast.error('Cannot suspend the root Super Admin account!');
      return;
    }

    const nextSuspendedState = !userRecord.suspended;
    try {
      await updateDoc(doc(db, 'users', userRecord.id), {
        suspended: nextSuspendedState
      });
      toast.success(
        nextSuspendedState 
          ? `Suspended account access for ${userRecord.email}` 
          : `Re-activated account access for ${userRecord.email}`
      );
    } catch (err: any) {
      toast.error('Failed to update suspension status: ' + err.message);
    }
  };

  // Delete User Profile
  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (userEmail === 'patelmunaf90@gmail.com') {
      toast.error('Cannot delete the root Super Admin account!');
      return;
    }

    setApiEnablementError(null);
    const toastId = toast.loading(`Deleting ${userEmail} and all associated company data...`);

    try {
      // 1. Find all companies created by this user
      const companiesQuery = query(collection(db, 'companies'), where('createdBy', '==', userId));
      const companiesSnap = await getDocs(companiesQuery);
      
      const assocCollections = [
        'ledgers', 'products', 'vouchers', 'godowns', 
        'costCenters', 'costCategories', 'employees', 'payruns', 'payheads',
        'voucher_templates'
      ];

      // For each company, delete its associated data
      for (const compDoc of companiesSnap.docs) {
        const companyId = compDoc.id;
        
        // Delete all associated files or references in parallel
        for (const colName of assocCollections) {
          const q = query(collection(db, colName), where('companyId', '==', companyId));
          const snap = await getDocs(q);
          
          const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
        }
        
        // Finally, delete the company itself
        await deleteDoc(compDoc.ref);
      }

      // 2. Delete user's profile document from Firestore 'users' collection
      await deleteDoc(doc(db, 'users', userId));

      // 3. Delete the user from Firebase Authentication gracefully (could be restricted by Cloud API permissions)
      let authRegistryCleared = true;
      try {
        const response = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uid: userId, email: userEmail })
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errMsg = errorData.error || '';
          if (errMsg.includes('identitytoolkit.googleapis.com') || errMsg.includes('Identity Toolkit') || errMsg.includes('developers.google.com')) {
            setApiEnablementError(errMsg);
            authRegistryCleared = false;
          } else {
            throw new Error(errMsg || 'Failed to remove user from database authenticator registry.');
          }
        }
      } catch (authError: any) {
        console.warn('Authentication registry delete failed but ignored:', authError);
        authRegistryCleared = false;
      }

      if (authRegistryCleared) {
        toast.success(`Customer ${userEmail} and all associated data deleted successfully.`, { id: toastId });
      } else {
        toast.success(`Customer database profile and all company items deleted! Access is permanently blocked.`, { id: toastId, duration: 6000 });
      }
      setDeleteConfirmUserId(null); // Reset confirmation state
    } catch (err: any) {
      console.error('Failed to complete cascade deletion:', err);
      toast.error('Failed to complete cascade deletion: ' + err.message, { id: toastId });
    }
  };

  // Inline Editing Trigger
  const handleStartEdit = (userRecord: any) => {
    setEditingUserId(userRecord.id);
    setEditDisplayName(userRecord.displayName || '');
    setEditRole(userRecord.role || 'staff');
  };

  // Save Inline Edit Changes
  const handleSaveEdit = async (userId: string) => {
    if (!editDisplayName.trim()) {
      toast.error('Display Name cannot be empty');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        displayName: editDisplayName.trim(),
        role: editRole
      });
      toast.success('User credentials updated successfully');
      setEditingUserId(null);
    } catch (err: any) {
      toast.error('Failed to update credentials: ' + err.message);
    }
  };

  const filteredUsers = usersList
    .filter(u => u.email !== 'patelmunaf90@gmail.com')
    .filter(u => 
      (u.displayName || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
    );

  const activeCount = usersList
    .filter(u => u.email !== 'patelmunaf90@gmail.com')
    .filter(u => !u.suspended).length;

  const suspendedCount = usersList
    .filter(u => u.email !== 'patelmunaf90@gmail.com')
    .filter(u => u.suspended).length;

  return (
    <div className="min-h-screen bg-[#f4f7f8] font-mono p-4 md:p-8 text-slate-800 selection:bg-[#ffeb3b]">
      
      {/* Ultimate Super Admin Top Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-[#004d5a] text-white p-6 border-2 border-[#ffcb2b] shadow-md">
        <div className="flex items-center space-x-4">
          <div className="bg-[#ffcb2b] text-[#004d5a] p-3 font-black text-lg border-2 border-white/20">
            GS
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
              Global Software Super Admin
              <Sparkles size={16} className="text-[#ffcb2b] animate-pulse" />
            </h1>
            <p className="text-xs text-slate-300 font-sans mt-0.5">
              Logged in: <strong className="text-white underline">{user.email}</strong> | Ultimate System Control Center
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onSwitchToAccounting && (
            <button 
              onClick={onSwitchToAccounting}
              className="px-3.5 py-2 bg-[#ffcb2b] hover:bg-[#ffe082] text-[#002f3c] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow border-b-2 border-amber-500 cursor-pointer"
            >
              <Receipt size={14} />
              Open Accounting Workspace
            </button>
          )}
          <button 
            onClick={handleRefresh}
            className={`p-2 bg-[#003c46] hover:bg-[#002f3c] text-white border border-[#ffcb2b]/30 flex items-center justify-center transition-all ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh statistics counters"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow border-b-2 border-rose-800"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>

      {apiEnablementError && (
        <div id="gcp-api-alert" className="max-w-7xl mx-auto mb-6 p-4 bg-amber-50 border border-amber-300 rounded-none shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex-1">
            <h3 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="text-amber-600 cursor-default" size={18} />
              Identity Toolkit API Configuration Required
            </h3>
            <p className="text-[11px] text-amber-800 mt-1 font-sans">
              To allow user accounts to be permanently dropped from Firebase Authentication (so they can be re-registered immediately), please open the link below and click <strong>"Enable"</strong> in your Google Cloud Project account:
            </p>
            <span className="text-[10px] block font-mono bg-amber-100/50 p-1 text-amber-700 mt-2 truncate">
              {apiEnablementError}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto mt-2 md:mt-0 justify-end">
            <a 
              href="https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=471849216968"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-1"
            >
              Enable API ↗
            </a>
            <button 
              onClick={() => setApiEnablementError(null)}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] uppercase tracking-wider transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Overview Stats Bento Widgets */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 border border-slate-200 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Total Registered Users</span>
            <h2 className="text-2xl font-black text-[#004d5a] mt-1">{loading ? '...' : usersList.filter(u => u.email !== 'patelmunaf90@gmail.com').length}</h2>
            <p className="text-[9px] text-slate-500 font-sans mt-0.5">All customer profile registries</p>
          </div>
          <Users size={32} className="text-slate-300" />
        </div>

        <div className="bg-white p-5 border border-slate-200 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-emerald-600 uppercase font-black tracking-wider">Active Accounts</span>
            <h2 className="text-2xl font-black text-emerald-700 mt-1">{loading ? '...' : activeCount}</h2>
            <p className="text-[9px] text-slate-500 font-sans mt-0.5">Able to login & operate</p>
          </div>
          <UserCheck size={32} className="text-emerald-100" />
        </div>

        <div className="bg-white p-5 border border-slate-200 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] text-rose-500 uppercase font-black tracking-wider">Suspended Access</span>
            <h2 className="text-2xl font-black text-rose-600 mt-1">{loading ? '...' : suspendedCount}</h2>
            <p className="text-[9px] text-slate-500 font-sans mt-0.5 font-bold animate-pulse text-amber-600">Access strictly restricted</p>
          </div>
          <ShieldAlert size={32} className="text-rose-100" />
        </div>
      </div>

      {/* Main Structural Layout: Form (Left) vs Listing Catalog (Right) */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Customer Registration Room */}
        <div className="lg:col-span-4 bg-white p-6 border border-slate-200 shadow-sm flex flex-col justify-between h-fit">
          <div>
            <div className="flex items-center space-x-2 text-[#004d5a] mb-5 pb-3 border-b border-slate-100">
              <UserPlus size={20} className="text-[#004d5a]" />
              <h2 className="text-sm font-black uppercase tracking-wider">Register New Customer</h2>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Name Field */}
              <div>
                <label className="block text-[10px] text-slate-500 font-black uppercase mb-1">Company / Customer Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Acme Corp Ltd"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 text-xs font-mono bg-white text-slate-800 outline-none focus:border-[#004d5a] focus:ring-1 focus:ring-[#004d5a] transition-all"
                />
              </div>

              {/* Email / ID Field */}
              <div>
                <label className="block text-[10px] text-slate-500 font-black uppercase mb-1">Email (Login User ID)</label>
                <input 
                  type="email"
                  required
                  placeholder="customer@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 text-xs font-mono bg-white text-slate-800 outline-none focus:border-[#004d5a] focus:ring-1 focus:ring-[#004d5a] transition-all"
                />
              </div>

              {/* Password Field */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] text-slate-500 font-black uppercase">Password</label>
                  <button 
                    type="button"
                    onClick={handleAutoGeneratePassword}
                    className="text-[9px] text-[#004d5a] hover:underline font-black flex items-center gap-1 uppercase"
                  >
                    <Key size={10} /> Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter min. 6 chars"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-slate-200 pl-3 pr-10 py-2 text-xs font-mono bg-white text-slate-800 outline-none focus:border-[#004d5a] focus:ring-1 focus:ring-[#004d5a] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Account Role Field */}
              <div>
                <label className="block text-[10px] text-slate-500 font-black uppercase mb-1">Assigned Role</label>
                <select 
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'staff')}
                  className="w-full border border-slate-200 px-2 py-2 text-xs font-mono bg-white text-slate-800 outline-none focus:border-[#004d5a]"
                >
                  <option value="staff">Staff Assistant (Standard)</option>
                  <option value="admin">Administrator (Complete Org Control)</option>
                </select>
              </div>

              {/* Submit Registration */}
              <button
                type="submit"
                disabled={creatingUser}
                className="w-full mt-2 bg-[#004d5a] hover:bg-[#003943] text-[#ffcb2b] py-2.5 px-4 font-black uppercase tracking-wider text-xs border-b-4 border-[#002f3c] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingUser ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Registering Account...
                  </>
                ) : (
                  <>
                    <UserPlus size={14} />
                    Register Customer
                  </>
                )}
              </button>

              {emailInUseDetails && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 animate-in fade-in duration-200">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-800 block">⚠️ Email Already In Auth Registry</span>
                  <p className="text-[10px] text-rose-700 mt-1 font-sans">
                    The email <strong>{emailInUseDetails.email}</strong> is locked in Firebase Auth. To force clean the login record and register as a fresh ID, click the button below:
                  </p>
                  <button
                    type="button"
                    onClick={handleForceCleanAndRegister}
                    className="w-full mt-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-3 text-[10px] uppercase tracking-wider transition-all"
                  >
                    Force Re-register
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="mt-8 bg-slate-50 border border-slate-100 p-4 font-sans text-[10px] text-slate-500 space-y-1.5">
            <span className="font-bold text-[#004d5a] uppercase font-mono block">📌 Super Admin Quick Guideline:</span>
            <p>New customers are instantly initialized on Firebase Authentication. After registration, they can login immediately using their email ID and designated password.</p>
          </div>
        </div>

        {/* RIGHT COLUMN: Customers Catalog Listing with Action controls */}
        <div className="lg:col-span-8 bg-white border border-slate-200 shadow-sm">
          
          <div className="border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 p-4 gap-2">
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-[#004d5a]">Authorized Customer Registries</h2>
              <p className="text-[9px] text-slate-400 mt-0.5 font-sans">Active controls for customer access permission, block, suspend & edits</p>
            </div>

            {/* Custom Search Filter */}
            <div className="relative font-sans w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Search Customers..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 text-xs text-slate-700 font-mono outline-none focus:border-[#004d5a]"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-16 text-center text-slate-400 font-sans">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#004d5a] mx-auto mb-3"></div>
              Synchronizing global database user directories...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 uppercase text-[9px] text-slate-500 font-black">
                    <th className="p-4">Customer Details</th>
                    <th className="p-4">Assigned Role</th>
                    <th className="p-4">Registry Date</th>
                    <th className="p-4">Account Status</th>
                    <th className="p-4 text-center">Actions Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400 font-sans">
                        No registered customer accounts matching search filters.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isEditing = editingUserId === u.id;
                      return (
                        <tr key={u.id} className={`hover:bg-slate-50/50 transition-colors ${u.suspended ? 'bg-rose-50/30' : ''}`}>
                          {/* Name + Email Column */}
                          <td className="p-4">
                            {isEditing ? (
                              <div className="space-y-1">
                                <span className="text-[9px] text-slate-400 uppercase font-black block">Edit Customer Name:</span>
                                <input 
                                  type="text"
                                  value={editDisplayName}
                                  onChange={(e) => setEditDisplayName(e.target.value)}
                                  className="w-full p-1 border border-slate-300 bg-white font-mono text-xs text-slate-800 focus:border-[#004d5a] outline-none"
                                />
                              </div>
                            ) : (
                              <div>
                                <div className="font-bold text-[#004d5a] flex items-center gap-1.5">
                                  {u.displayName || 'Unnamed Customer'}
                                  {u.email === 'patelmunaf90@gmail.com' && (
                                    <span className="px-1.5 py-0.5 bg-[#ffcb2b] text-[#004d5a] font-black uppercase text-[8px] tracking-tighter border border-[#004d5a]/20">Root Support</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{u.email}</div>
                              </div>
                            )}
                          </td>

                          {/* Role Column */}
                          <td className="p-4">
                            {isEditing ? (
                              <div className="space-y-1">
                                <span className="text-[9px] text-slate-400 uppercase font-black block">Role:</span>
                                <select 
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'staff')}
                                  className="p-1 border border-slate-300 bg-white font-mono text-xs text-slate-800 outline-none"
                                >
                                  <option value="staff">Staff</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </div>
                            ) : (
                              <span className={`px-2 py-0.5 font-bold uppercase text-[9px] border ${
                                u.role === 'admin' 
                                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {u.role || 'staff'}
                              </span>
                            )}
                          </td>

                          {/* Registry Date Column */}
                          <td className="p-4 text-slate-500 font-mono text-[10px]">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            }) : 'N/A'}
                          </td>

                          {/* Status Field Column */}
                          <td className="p-4">
                            {u.suspended ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 font-black uppercase text-[8px] tracking-wider rounded-none inline-flex items-center gap-1">
                                <ShieldClose size={10} /> Suspended
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 font-black uppercase text-[8px] tracking-wider rounded-none inline-flex items-center gap-1">
                                <ShieldCheck size={10} /> Active
                              </span>
                            )}
                          </td>

                          {/* Actions Panel Buttons */}
                          <td className="p-4 text-center">
                            {u.email === 'patelmunaf90@gmail.com' ? (
                              <span className="text-[9px] text-slate-400 font-sans italic">Immutable System Account</span>
                            ) : (
                              <div className="flex items-center justify-center space-x-2">
                                
                                {/* Edit Mode Controls */}
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEdit(u.id)}
                                      className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition-all flex items-center gap-0.5 text-[9px] font-bold uppercase"
                                      title="Save Changes"
                                    >
                                      <Check size={11} /> Save
                                    </button>
                                    <button
                                      onClick={() => setEditingUserId(null)}
                                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 transition-all flex items-center gap-0.5 text-[9px] font-bold uppercase"
                                      title="Cancel"
                                    >
                                      <X size={11} /> Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                  deleteConfirmUserId === u.id ? (
                                    <div className="flex items-center space-x-1 bg-rose-50 border border-rose-200 p-1 animate-in fade-in duration-200">
                                      <span className="text-[9px] text-rose-700 font-black uppercase px-1">Delete?</span>
                                      <button
                                        onClick={() => handleDeleteUser(u.id, u.email)}
                                        className="p-1 px-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] uppercase transition-all"
                                      >
                                        Yes
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirmUserId(null)}
                                        className="p-1 px-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[9px] uppercase transition-all"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleStartEdit(u)}
                                        className="p-1 px-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold transition-all text-[9.5px] flex items-center gap-1 uppercase"
                                        title="Edit Customer Profile"
                                      >
                                        <Edit3 size={11} />
                                        Edit
                                      </button>
                                      
                                      {/* Suspend / Resume Access Toggle */}
                                      <button
                                        onClick={() => handleToggleSuspension(u)}
                                        className={`p-1 px-1.5 font-bold text-[9.5px] border transition-all flex items-center gap-1 uppercase ${
                                          u.suspended 
                                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                        }`}
                                        title={u.suspended ? 'Reactivate access' : 'Temporarily suspend login'}
                                      >
                                        {u.suspended ? 'Activate' : 'Suspend'}
                                      </button>

                                      {/* Delete Registration Profile */}
                                      <button
                                        onClick={() => setDeleteConfirmUserId(u.id)}
                                        className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-all"
                                        title="Delete user permanently"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </>
                                  )
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto text-center mt-12 no-print">
        <p className="text-[10px] text-slate-400 font-sans tracking-tight">
          Global Software ERP Corporate System Platform • Designed and Managed by Global Software Solutions Team • Contact Support: <a href="mailto:patelmunaf90@gmail.com" className="text-blue-600 font-bold hover:underline">patelmunaf90@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
