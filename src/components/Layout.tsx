import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutGrid,
  BookOpen, 
  FileText, 
  Package, 
  BarChart3, 
  Settings,
  LogOut,
  Search,
  Calculator as CalcIcon,
  Keyboard,
  Building2,
  Users,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Layers,
  Scale,
  Menu,
  X,
  Wifi,
  WifiOff,
  Globe
} from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { User } from '../types';
import { authService } from '../services/dataService';
import { getCountryTaxInfo } from '../constants';
import GoToModal from './GoToModal';
import Calculator from './Calculator';
import ShortcutsHelp from './ShortcutsHelp';

interface LayoutProps {
  user: User;
}

export default function Layout({ user }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const { activeCompany, companies, setActiveCompany, isOfflineMode } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isGoToOpen, setIsGoToOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setIsGoToOpen(true);
      }
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setIsCalculatorOpen(prev => !prev);
      }
      if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsShortcutsHelpOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { 
      path: '/', 
      icon: LayoutGrid, 
      label: t('dashboard', 'Dashboard'),
      badge: null
    },
    { 
      path: '/vouchers', 
      icon: FileText, 
      label: t('vouchers', 'Vouchers'),
      badge: 'V'
    },
    { 
      path: '/ledgers', 
      icon: BookOpen, 
      label: t('ledgers', 'Ledgers'),
      badge: null
    },
    { 
      path: '/groups', 
      icon: Layers, 
      label: t('groups', 'Groups'),
      badge: null
    },
    { 
      path: '/inventory', 
      icon: Package, 
      label: t('inventory', 'Inventory'),
      badge: null
    },
    { 
      path: '/godowns', 
      icon: HardDrive, 
      label: t('godowns', 'Godowns'),
      badge: null
    },
    { 
      path: '/units', 
      icon: Scale, 
      label: t('units', 'Units'),
      badge: null
    },
    ...(activeCompany?.enableCostCenters !== false ? [{ 
      path: '/cost-centers', 
      icon: Users, 
      label: t('cost_centers', 'Cost Centres'),
      badge: null
    }] : []),
    ...(activeCompany?.enablePayroll ? [{ 
      path: '/payroll', 
      icon: Users, 
      label: t('payroll', 'Payroll'),
      badge: null
    }] : []),
    { 
      path: '/reports', 
      icon: BarChart3, 
      label: t('reports', 'Reports'),
      badge: null
    },
    { 
      path: '/company', 
      icon: Building2, 
      label: t('company', 'Company'),
      badge: null
    },
    { 
      path: '/settings', 
      icon: Settings, 
      label: t('settings', 'Settings'),
      badge: null
    },
  ];

  const handleLogout = async () => {
    await authService.signOut();
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const isActiveRoute = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="h-screen flex bg-slate-50 font-sans text-slate-800 antialiased overflow-hidden select-none">
      <GoToModal isOpen={isGoToOpen} onClose={() => setIsGoToOpen(false)} />
      <Calculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
      <ShortcutsHelp isOpen={isShortcutsHelpOpen} onClose={() => setIsShortcutsHelpOpen(false)} />

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar - Clean Light Theme */}
      <aside 
        className={`fixed lg:static top-0 bottom-0 left-0 z-50 flex flex-col bg-white text-slate-700 transition-all duration-300 ease-in-out border-r border-slate-200/90 shadow-lg lg:shadow-none ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header / Brand */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            {activeCompany?.logoUrl ? (
              <img 
                src={activeCompany.logoUrl} 
                alt="Logo" 
                className="w-9 h-9 rounded-xl object-contain bg-slate-50 border border-slate-200 p-1 shrink-0 shadow-2xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shadow-teal-700/20 shrink-0">
                SA
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-bold text-slate-800 tracking-tight truncate leading-tight">
                  {activeCompany?.name || 'Smart Accounting'}
                </span>
                <span className="text-[10px] text-teal-600 font-semibold tracking-wide">
                  {activeCompany?.financialYear ? `FY: ${activeCompany.financialYear}` : 'Professional Edition'}
                </span>
              </div>
            )}
          </Link>

          {/* Toggle Collapse Button (Desktop) */}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>

          {/* Close Button (Mobile) */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={19} />
          </button>
        </div>

        {/* Sidebar Navigation Links - Clean Light Styling */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1 custom-scrollbar bg-white">
          {navItems.map((item) => {
            const active = isActiveRoute(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMobileMenuOpen(false);
                }}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group cursor-pointer ${
                  active 
                    ? 'bg-teal-50 text-teal-800 font-bold border border-teal-200/90 shadow-2xs' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon 
                  size={19} 
                  className={`shrink-0 transition-colors ${
                    active ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                  }`} 
                />
                {!sidebarCollapsed && (
                  <span className="truncate flex-1 text-left">
                    {item.label}
                  </span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                    active ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer: User profile & quick status - Light & Crisp */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 border border-teal-200 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                  {user?.displayName ? user.displayName.charAt(0) : user?.email?.charAt(0) || 'U'}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
                    {user?.displayName || user?.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate capitalize font-medium">
                    {user?.role || 'Staff'}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                title={t('logout', 'Logout')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button 
                onClick={handleLogout}
                title={t('logout', 'Logout')}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Body Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs z-30">
          {/* Left: Mobile trigger & Company Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <Menu size={20} />
            </button>

            {/* Company Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setCompanyDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors text-left cursor-pointer group"
                title="Click to switch company"
              >
                <div className="w-7 h-7 rounded-md bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  <Building2 size={15} />
                </div>
                <div className="flex flex-col truncate max-w-[200px] sm:max-w-[280px]">
                  <span className="font-bold text-slate-900 text-sm leading-tight truncate flex items-center gap-1.5">
                    {activeCompany?.name || 'Select Company'}
                    <ChevronDown size={13} className={`text-slate-400 group-hover:text-slate-700 transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`} />
                  </span>
                  <span className="text-[10px] text-teal-600 font-semibold tracking-wide truncate">
                    {activeCompany?.financialYear ? `FY: ${activeCompany.financialYear}` : 'Switch Company'}
                    {activeCompany?.gstNumber ? ` • ${activeCompany.taxLabel || (activeCompany.country ? getCountryTaxInfo(activeCompany.country).taxLabel : 'Tax')}: ${activeCompany.gstNumber}` : ''}
                  </span>
                </div>
              </button>

              {/* Dropdown Menu */}
              {companyDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setCompanyDropdownOpen(false)} 
                  />
                  <div className="absolute left-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Available Companies ({companies.length})</span>
                      <span className="text-teal-600">Click to switch</span>
                    </div>

                    <div className="max-h-64 overflow-y-auto py-1 custom-scrollbar">
                      {companies.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-500 text-center">
                          No companies found.
                        </div>
                      ) : (
                        companies.map((comp) => {
                          const isSelected = activeCompany?.id === comp.id;
                          return (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => {
                                setActiveCompany(comp);
                                if (comp.id) {
                                  localStorage.setItem('activeCompanyId', comp.id);
                                }
                                setCompanyDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-teal-50 text-teal-900 font-bold border-l-4 border-teal-600' 
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                  isSelected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {(comp.name || 'C').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col truncate">
                                  <span className="font-semibold truncate flex items-center gap-1.5">
                                    {comp.name}
                                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1 rounded border border-teal-200">
                                      {comp.currencySymbol || (comp.country === 'India' ? '₹' : (comp.country === 'United States' ? '$' : '¤'))}
                                    </span>
                                  </span>
                                  <span className="text-[10px] text-slate-400 truncate">
                                    {comp.financialYear || 'Active FY'} • {comp.state || comp.country || 'India'}
                                  </span>
                                </div>
                              </div>
                              {isSelected && (
                                <Check size={14} className="text-teal-600 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="pt-1.5 mt-1 border-t border-slate-100 px-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyDropdownOpen(false);
                          navigate('/company');
                        }}
                        className="w-full py-1.5 text-center text-xs font-bold text-teal-700 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                      >
                        + Manage &amp; Create Companies
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Quick Tools, Search, Language, Shortcuts, Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Search / Go To (Alt+G) */}
            <button
              onClick={() => setIsGoToOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-medium border border-slate-200 transition-colors cursor-pointer"
              title="Go To (Alt+G)"
            >
              <Search size={14} className="text-slate-500" />
              <span className="hidden sm:inline">Go To</span>
              <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] bg-white text-slate-600 rounded border border-slate-300 font-mono">
                Alt+G
              </kbd>
            </button>

            {/* Calculator (Alt+C) */}
            <button
              onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-teal-700 transition-colors cursor-pointer border border-slate-200"
              title="Calculator (Alt+C)"
            >
              <CalcIcon size={16} />
            </button>

            {/* Shortcuts Guide (Alt+H) */}
            <button
              onClick={() => setIsShortcutsHelpOpen(!isShortcutsHelpOpen)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-700 hover:text-teal-700 transition-colors cursor-pointer border border-slate-200"
              title="Shortcuts Help (Alt+H)"
            >
              <Keyboard size={16} />
            </button>

            {/* Language Selector */}
            <div className="relative flex items-center">
              <Globe size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
              <select
                value={i18n.language || 'en'}
                onChange={(e) => changeLanguage(e.target.value)}
                className="pl-7 pr-2 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-slate-700 outline-none cursor-pointer"
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
                <option value="gu">ગુજરાતી</option>
              </select>
            </div>

            {/* Network / Offline Status Badge */}
            <div 
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                isOfflineMode 
                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
              title={isOfflineMode ? 'Running in Offline Mode' : 'Connected to Cloud'}
            >
              {isOfflineMode ? <WifiOff size={12} /> : <Wifi size={12} />}
              <span className="hidden md:inline">{isOfflineMode ? 'Offline' : 'Online'}</span>
            </div>
          </div>
        </header>

        {/* Workspace Main Outlet */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-slate-50 p-4 sm:p-6 print:p-0 print:overflow-visible print:bg-white">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
