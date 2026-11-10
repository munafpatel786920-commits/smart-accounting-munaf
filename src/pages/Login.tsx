import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { authService, isElectronEnvironment } from '../services/dataService';
import { useTranslation } from 'react-i18next';
import { LogIn, Mail, Lock, Shield, BarChart3, FileSpreadsheet, Sparkles, CheckCircle2, HardDrive, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import logoUrl from '../assets/images/global_software_logo_1781701883016.jpg';

export default function Login() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isOffline = isElectronEnvironment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanEmail = email.toLowerCase().trim();

    try {
      if (isOffline) {
        // Offline Desktop login
        await authService.signInLocal(cleanEmail, password);
        toast.success('Logged in to Offline Desktop Workspace');
        setLoading(false);
        return;
      }

      // Online Web login via Firebase
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const firebaseUser = userCredential.user;

      // Force check on server to bypass client-side cache for deleted/suspended users
      let userDoc;
      try {
        userDoc = await getDocFromServer(doc(db, 'users', firebaseUser.uid));
      } catch (serverErr) {
        console.warn('Fallback to local document get:', serverErr);
        userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      }
      
      if (!userDoc.exists()) {
        const newUserProfile = {
          uid: firebaseUser.uid,
          email: cleanEmail,
          displayName: firebaseUser.displayName || (cleanEmail === 'patelmunaf90@gmail.com' ? 'Super Admin' : cleanEmail.split('@')[0]),
          role: 'admin',
          suspended: false,
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, 'users', firebaseUser.uid), newUserProfile, { merge: true });
        } catch (e) {
          console.warn('Could not save user profile doc:', e);
        }
      } else {
        const docData = userDoc.data();
        if (docData && docData.suspended && cleanEmail !== 'patelmunaf90@gmail.com') {
          await auth.signOut();
          setError('Your account is suspended. Please contact patelmunaf90@gmail.com for support.');
          toast.error('Your account is suspended. Please contact patelmunaf90@gmail.com for support.');
          setLoading(false);
          return;
        }
      }

      toast.success(cleanEmail === 'patelmunaf90@gmail.com' ? 'Welcome Super Admin! Opening Smart Accounting...' : 'Logged in successfully');
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password login is not enabled in Firebase Console.');
        toast.error('Email/Password login is not enabled');
      } else {
        setError(err.message);
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuperAdminQuickLogin = async () => {
    setEmail('patelmunaf90@gmail.com');
    setPassword('munaf786');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, 'patelmunaf90@gmail.com', 'munaf786');
      toast.success('Signed in as Super Admin successfully!');
    } catch (err: any) {
      toast.error('Sign in failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSuperAdminFill = () => {
    setEmail('patelmunaf90@gmail.com');
    setPassword('munaf786');
    toast.info('Super Admin credentials filled. Click Login to access Super Admin Panel.');
  };

  const handleOfflineQuickLogin = async () => {
    setLoading(true);
    try {
      await authService.signInLocal('admin@smartaccounting.local', 'admin');
      toast.success('Signed in with Offline Administrator Account');
    } catch (err: any) {
      toast.error('Failed to sign in: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#002f3c] p-4 font-mono select-none relative">
      {/* Language Selector & Environment Badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-[#004d5a] text-white px-2.5 py-1 text-[10px] border border-white/20">
          {isOffline ? (
            <>
              <HardDrive size={12} className="text-emerald-400" />
              <span className="font-bold text-emerald-300">Offline SQLite Desktop</span>
            </>
          ) : (
            <>
              <Cloud size={12} className="text-[#ffcb2b]" />
              <span className="font-bold text-[#ffcb2b]">Online Firebase Web</span>
            </>
          )}
        </div>

        <select
          value={i18n.language}
          onChange={(e) => i18n.changeLanguage(e.target.value)}
          className="text-xs bg-[#004d5a] text-[#ffcb2b] border border-[#ffcb2b]/30 py-1 px-3 outline-none rounded-none font-bold font-mono"
        >
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
          <option value="gu">ગુજરાતી</option>
        </select>
      </div>

      {/* Main Container */}
      <div className="max-w-4xl w-full flex flex-col md:flex-row bg-[#fdfcf0] border-2 border-[#004d5a] shadow-2xl overflow-hidden rounded-none">
        
        {/* Left Column: Product Advertising / Features Section */}
        <div className="md:w-1/2 bg-[#004d5a] text-white p-8 flex flex-col justify-between border-b-2 md:border-b-0 md:border-r border-[#003c46]">
          <div>
            <div className="flex items-center space-x-3 mb-6 bg-white/5 p-2.5 border border-white/10">
              <img 
                src={logoUrl} 
                alt="Global Software Logo" 
                className="h-10 w-10 object-contain rounded-full bg-white border border-white/35"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="text-[10px] font-black tracking-widest text-[#ffcb2b] uppercase leading-none">Global Software</span>
                <span className="text-[8px] tracking-tight text-slate-300 leading-none mt-1">Empowering Your Digital World</span>
              </div>
            </div>
            
            <h1 className="text-2xl font-black uppercase text-white leading-tight tracking-tight mb-2">
              Smart <br/>
              <span className="text-[#ffcb2b]">Accounting</span>
            </h1>
            <p className="text-xs text-slate-300 font-sans leading-relaxed mb-6">
              The ultimate high-performance enterprise accounting system with seamless Online Cloud &amp; Offline Windows Desktop dual architecture.
            </p>

            <div className="space-y-4 font-sans">
              <div className="flex items-start space-x-3 bg-black/10 p-3 border-l-2 border-[#ffcb2b]">
                <Shield size={16} className="text-[#ffcb2b] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Dual Storage Architecture</h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">Operate online with Google Firebase or 100% offline with zero-internet local SQLite.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 bg-black/10 p-3 border-l-2 border-[#ffcb2b]">
                <BarChart3 size={16} className="text-[#ffcb2b] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Real-time Advanced Insights</h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">Instantly track low stock alerts, top pending debtors, outstanding payments, and financial ratios.</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 bg-black/10 p-3 border-l-2 border-[#ffcb2b]">
                <FileSpreadsheet size={16} className="text-[#ffcb2b] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Instant Export (PDF/Excel)</h4>
                  <p className="text-[10px] text-slate-300 mt-0.5">Generate daily daybooks, ledgers, trial balances, and tax vouchers. Export and print completely offline.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-[#003c46]/50">
            <div className="flex items-center space-x-2 text-[10px] text-slate-300 tracking-tight font-mono">
              <CheckCircle2 size={12} className="text-[#ffcb2b]" />
              <span>Multi-currency &amp; GST Tax Calculation Ready</span>
            </div>
          </div>
        </div>

        {/* Right Column: Login Form Panel */}
        <div className="md:w-1/2 p-8 flex flex-col justify-center">
          <div className="text-center mb-6 flex flex-col items-center">
            <img 
              src={logoUrl} 
              alt="Global Software Logo" 
              className="h-16 w-16 object-contain rounded-full border-2 border-[#ffcb2b] bg-white shadow-md mb-3 animate-in zoom-in-75 duration-300"
              referrerPolicy="no-referrer"
            />
            <h2 className="text-sm font-black text-[#004d5a] uppercase tracking-widest">{t('login')} to Account</h2>
            <div className="text-[10px] text-slate-500 mt-1.5 font-sans">
              © Global Software | <a href="mailto:patelmunaf90@gmail.com" className="text-blue-600 hover:underline">patelmunaf90@gmail.com</a>
            </div>
            <p className="text-[#002f3c]/70 text-xs mt-3 bg-[#e9f2f5] py-1 border border-slate-200 uppercase font-bold text-[10px]">{t('welcome')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#002f3c] uppercase tracking-wider">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#004d5a]/60" size={14} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                  placeholder="administrator@company.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#002f3c] uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#004d5a]/60" size={14} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 text-red-700 text-[11px] rounded-none border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] border border-[#002f3c]/20 font-bold py-2 rounded-none transition-colors flex items-center justify-center space-x-2 text-xs uppercase shadow-sm cursor-pointer"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#004d5a]"></div>
              ) : (
                <>
                  <LogIn size={14} />
                  <span>{t('login')}</span>
                </>
              )}
            </button>
          </form>

          {/* Super Admin & Quick Login options */}
          <div className="mt-4 pt-3 border-t border-slate-200 space-y-2 text-center">
            <button
              type="button"
              onClick={handleSuperAdminQuickLogin}
              className="w-full text-xs font-bold text-[#002f3c] bg-[#ffcb2b] hover:bg-[#ffd54f] border border-[#002f3c]/30 py-2 px-3 flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Shield size={14} className="text-[#004d5a]" />
              <span>⚡ 1-Click Super Admin Login (patelmunaf90@gmail.com)</span>
            </button>

            <button
              type="button"
              onClick={handleOfflineQuickLogin}
              className="text-[11px] font-bold text-[#146e85] hover:underline flex items-center justify-center gap-1.5 mx-auto"
            >
              <HardDrive size={12} />
              <span>Continue with Offline Local Administrator</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
