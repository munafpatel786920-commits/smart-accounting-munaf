import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';
import { format } from 'date-fns';
import { getCountryTaxInfo } from '../constants';

interface MenuItem {
  id: string;
  label: string;
  shortcut: string;
  path?: string;
  type?: 'header' | 'item';
  action?: () => void;
}

type MenuMode = 'main' | 'create' | 'alter' | 'display';

export default function Gateway() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [menuMode, setMenuMode] = useState<MenuMode>('main');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lastEntryDate, setLastEntryDate] = useState<string>('No Vouchers');
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [quitSelectedIndex, setQuitSelectedIndex] = useState<0 | 1>(0); // 0 = Yes, 1 = No
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, [menuMode, showQuitModal]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (!isInput) {
        containerRef.current?.focus();
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Fetch date of last entry
  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribe = dataService.onSnapshotCollection<any>(
      'vouchers',
      conditions,
      (fetchedVouchers) => {
        if (fetchedVouchers && fetchedVouchers.length > 0) {
          const sorted = [...fetchedVouchers].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          const date = sorted[0]?.date;
          if (date) {
            setLastEntryDate(format(new Date(date), 'd-MMM-yyyy'));
          } else {
            setLastEntryDate('No Vouchers');
          }
        } else {
          setLastEntryDate('No Vouchers');
        }
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        setLastEntryDate('No Vouchers');
      }
    );

    return () => unsubscribe();
  }, [activeCompany?.id]);

  // Define Menu Configurations based on mode
  const getMenuItems = (): { title: string; items: MenuItem[] } => {
    switch (menuMode) {
      case 'create':
        return {
          title: 'Master Creation',
          items: [
            { id: 'h_acc', label: 'ACCOUNTING MASTERS', shortcut: '', type: 'header' },
            { id: 'group', label: 'Group', shortcut: 'G', path: '/groups?mode=create' },
            { id: 'ledger', label: 'Ledger', shortcut: 'L', path: '/ledgers?action=create' },
            ...(activeCompany?.enableCostCenters !== false ? [{ id: 'cost', label: 'Cost Centre', shortcut: 'C', path: '/cost-centers' }] : []),
            { id: 'h_inv', label: 'INVENTORY MASTERS', shortcut: '', type: 'header' },
            { id: 'stock_item', label: 'Stock Item', shortcut: 'I', path: '/inventory?action=create' },
            { id: 'unit', label: 'Unit', shortcut: 'U', path: '/units?mode=create' },
            { id: 'godown', label: 'Godown', shortcut: 'O', path: '/godowns?mode=create' },
            { id: 'h_back', label: 'NAVIGATION', shortcut: '', type: 'header' },
            { id: 'back', label: 'Quit / Back', shortcut: 'Q', action: () => setMenuMode('main') },
          ]
        };

      case 'alter':
        return {
          title: 'Master Alteration',
          items: [
            { id: 'h_acc', label: 'ACCOUNTING MASTERS', shortcut: '', type: 'header' },
            { id: 'group_alter', label: 'Group', shortcut: 'G', path: '/groups' },
            { id: 'ledger_alter', label: 'Ledger', shortcut: 'L', path: '/ledgers' },
            ...(activeCompany?.enableCostCenters !== false ? [{ id: 'cost_alter', label: 'Cost Centre', shortcut: 'C', path: '/cost-centers' }] : []),
            { id: 'h_inv', label: 'INVENTORY MASTERS', shortcut: '', type: 'header' },
            { id: 'item_alter', label: 'Stock Item', shortcut: 'I', path: '/inventory' },
            { id: 'unit_alter', label: 'Unit', shortcut: 'U', path: '/units' },
            { id: 'godown_alter', label: 'Godown', shortcut: 'O', path: '/godowns' },
            { id: 'h_back', label: 'NAVIGATION', shortcut: '', type: 'header' },
            { id: 'back', label: 'Quit / Back', shortcut: 'Q', action: () => setMenuMode('main') },
          ]
        };

      case 'display':
        return {
          title: 'Display More Reports',
          items: [
            { id: 'h_accounting', label: 'ACCOUNTING', shortcut: '', type: 'header' },
            { id: 'tb', label: 'Trial Balance', shortcut: 'T', path: '/reports?type=TRIAL_BALANCE' },
            { id: 'db', label: 'Day Book', shortcut: 'D', path: '/reports?type=DAYBOOK' },
            { id: 'cash_bank', label: 'Account Books (Ledger)', shortcut: 'A', path: '/reports?type=LEDGER' },
            { id: 'statement', label: 'Statement of Accounts', shortcut: 'S', path: '/reports?type=OUTSTANDING' },
            { id: 'h_inventory', label: 'INVENTORY & STATUTORY', shortcut: '', type: 'header' },
            { id: 'inv_books', label: 'Inventory Books', shortcut: 'I', path: '/reports?type=STOCK' },
            { id: 'gst_rep', label: 'Statutory Reports (GST)', shortcut: 'G', path: '/reports?type=GST' },
            { id: 'cash_flow', label: 'Cash Flow', shortcut: 'C', path: '/reports?type=CASH_FLOW' },
            { id: 'h_nav', label: 'NAVIGATION', shortcut: '', type: 'header' },
            { id: 'back', label: 'Quit / Back', shortcut: 'Q', action: () => setMenuMode('main') },
          ]
        };

      case 'main':
      default:
        return {
          title: 'Gateway of Tally',
          items: [
            { id: 'masters', label: 'MASTERS', shortcut: '', type: 'header' },
            { id: 'create', label: 'Create', shortcut: 'C', action: () => { setMenuMode('create'); setSelectedIndex(0); } },
            { id: 'alter', label: 'Alter', shortcut: 'A', action: () => { setMenuMode('alter'); setSelectedIndex(0); } },
            { id: 'chart', label: 'Chart of Accounts', shortcut: 'H', path: '/ledgers' },
            
            { id: 'transactions', label: 'TRANSACTIONS', shortcut: '', type: 'header' },
            { id: 'vouchers', label: 'Vouchers', shortcut: 'V', path: '/vouchers' },
            { id: 'daybook', label: 'Day Book', shortcut: 'K', path: '/reports?type=DAYBOOK' },
            
            { id: 'utilities', label: 'UTILITIES', shortcut: '', type: 'header' },
            { id: 'banking', label: 'Banking', shortcut: 'N', path: '/reports?type=BRS' },
            
            { id: 'reports', label: 'REPORTS', shortcut: '', type: 'header' },
            { id: 'balance', label: 'Balance Sheet', shortcut: 'B', path: '/reports?type=BS' },
            { id: 'pl', label: 'Profit & Loss A/c', shortcut: 'P', path: '/reports?type=PL' },
            { id: 'stock', label: 'Stock Summary', shortcut: 'S', path: '/reports?type=STOCK' },
            { id: 'display', label: 'Display More Reports', shortcut: 'D', action: () => { setMenuMode('display'); setSelectedIndex(0); } },
            
            { id: 'exit', label: 'QUIT', shortcut: '', type: 'header' },
            { id: 'quit', label: 'Quit', shortcut: 'Q', action: () => setShowQuitModal(true) },
          ]
        };
    }
  };

  const { title: menuTitle, items: menuItems } = getMenuItems();
  const selectableItems = menuItems.filter(item => item.type !== 'header');

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If Quit Modal is open
      if (showQuitModal) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setQuitSelectedIndex(prev => (prev === 0 ? 1 : 0));
        } else if (e.key.toLowerCase() === 'y' || (e.key === 'Enter' && quitSelectedIndex === 0)) {
          e.preventDefault();
          auth.signOut();
        } else if (e.key.toLowerCase() === 'n' || e.key === 'Escape' || (e.key === 'Enter' && quitSelectedIndex === 1)) {
          e.preventDefault();
          setShowQuitModal(false);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % selectableItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + selectableItems.length) % selectableItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = selectableItems[selectedIndex];
        if (item?.action) item.action();
        else if (item?.path) navigate(item.path);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (menuMode !== 'main') {
          setMenuMode('main');
          setSelectedIndex(0);
        } else {
          setShowQuitModal(true);
        }
      } else {
        const key = e.key.toUpperCase();
        const item = selectableItems.find(i => i.shortcut === key);
        if (item) {
          e.preventDefault();
          if (item.action) item.action();
          else if (item.path) navigate(item.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, selectableItems, menuMode, showQuitModal, quitSelectedIndex, navigate]);

  // Determine financial year label
  const finYear = activeCompany?.financialYear || '2025-26';
  const finYearRange = `1-Apr-${finYear.split('-')[0] || '2025'} to 31-Mar-${parseInt(finYear.split('-')[0] || '2025') + 1}`;

  return (
    <div 
      ref={containerRef}
      tabIndex={0}
      className="h-full flex flex-col bg-[#f5f5dc] overflow-hidden outline-none font-sans text-[#1b2b34] select-none"
    >
      {/* Workspace Area */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* Left Side: Current Period, Date & Company Details */}
        <div className="w-1/2 border-r-2 border-[#004b36]/20 pr-6 flex flex-col justify-between">
          <div>
            {/* Period and Date Header */}
            <div className="flex justify-between text-[11px] font-mono font-bold border-b-2 border-[#004b36]/30 pb-1 mb-2 text-[#004b36]">
              <span>CURRENT PERIOD</span>
              <span>CURRENT DATE</span>
            </div>
            <div className="flex justify-between text-[13px] font-mono font-bold mb-8 text-[#1b2b34]">
              <span>{finYearRange}</span>
              <span>{format(new Date(), 'EEEE, d-MMM-yyyy')}</span>
            </div>

            {/* List of Selected Companies */}
            <div className="text-[12px] font-bold text-[#004b36] mb-2 uppercase tracking-wide">
              List of Selected Companies
            </div>
            <div className="flex justify-between text-[11px] font-mono font-bold border-b-2 border-[#004b36]/30 pb-1 mb-3 text-[#004b36]">
              <span>NAME OF COMPANY</span>
              <span>DATE OF LAST ENTRY</span>
            </div>
            
            <div className="flex justify-between items-center py-2 px-2 rounded bg-white/70 border border-emerald-900/10 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                <span className="text-[15px] font-bold text-[#004b36] tracking-tight">
                  {activeCompany?.name || 'Smart Accounting System'}
                </span>
              </div>
              <span className="text-[13px] font-mono font-semibold text-slate-700">
                {lastEntryDate}
              </span>
            </div>

            {/* Statutory / Tax Details Summary */}
            {activeCompany?.gstNumber && (
              <div className="mt-4 text-[11px] font-mono text-slate-600 space-y-1 bg-[#fcfaef] p-3 border border-emerald-900/10 rounded">
                <div className="flex justify-between">
                  <span className="text-slate-500">{activeCompany.taxLabel || (activeCompany.country ? getCountryTaxInfo(activeCompany.country).taxLabel : 'GSTIN / UIN')}:</span>
                  <span className="font-bold text-[#004b36]">{activeCompany.gstNumber}</span>
                </div>
                {activeCompany?.state && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">State / Region:</span>
                    <span className="font-bold text-slate-800">{activeCompany.state}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Keyboard Guide */}
          <div className="text-[11px] text-[#004b36] font-mono bg-emerald-50/70 p-2.5 rounded border border-[#004b36]/20 flex items-center justify-between">
            <span>Use <kbd className="bg-white px-1 border border-emerald-800/30 rounded font-bold">↑</kbd> <kbd className="bg-white px-1 border border-emerald-800/30 rounded font-bold">↓</kbd> or Hotkeys</span>
            <span><kbd className="bg-white px-1 border border-emerald-800/30 rounded font-bold">Enter</kbd> to Select • <kbd className="bg-white px-1 border border-emerald-800/30 rounded font-bold">Esc</kbd> to Back</span>
          </div>
        </div>

        {/* Right Side: Authentic Tally Prime Gateway Menu Box */}
        <div className="w-1/2 flex justify-center items-start pt-1">
          <div className="w-[380px] border-2 border-[#004b36] rounded shadow-xl bg-white overflow-hidden flex flex-col">
            
            {/* Tally Prime Dark Green Box Header */}
            <div className="bg-[#004b36] text-amber-300 px-4 py-2 text-center text-[13px] font-bold uppercase tracking-wider shadow-inner flex items-center justify-between">
              <span className="w-4"></span>
              <span>{menuTitle}</span>
              {menuMode !== 'main' ? (
                <button 
                  onClick={() => setMenuMode('main')}
                  className="text-[10px] bg-[#005c43] hover:bg-[#007052] text-white px-1.5 py-0.5 rounded cursor-pointer border border-[#007052]"
                  title="Back to Gateway (Esc)"
                >
                  Esc
                </button>
              ) : (
                <span className="w-4"></span>
              )}
            </div>

            {/* Menu List */}
            <div className="py-2 bg-[#fcfaef] min-h-[340px] flex flex-col">
              {menuItems.map((item) => {
                if (item.type === 'header') {
                  return (
                    <div 
                      key={item.id} 
                      className="px-6 py-1 text-[11px] font-black text-[#004b36] mt-2 first:mt-0 border-b border-emerald-900/10 mb-1 uppercase tracking-widest bg-emerald-100/40"
                    >
                      {item.label}
                    </div>
                  );
                }

                const currentSelectableIndex = selectableItems.findIndex(si => si.id === item.id);
                const isSelected = selectedIndex === currentSelectableIndex;
                const labelParts = item.label.split('');
                const shortcutIndex = item.label.toUpperCase().indexOf(item.shortcut);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedIndex(currentSelectableIndex);
                      if (item.action) item.action();
                      else if (item.path) navigate(item.path);
                    }}
                    className={`px-8 py-1.5 text-[14px] cursor-pointer transition-colors flex justify-between items-center ${
                      isSelected 
                        ? 'bg-[#ffc107] text-[#002b20] font-black shadow-inner border-y border-amber-500' 
                        : 'hover:bg-emerald-100/50 text-[#1b2b34] font-medium'
                    }`}
                  >
                    <div>
                      {labelParts.map((char, idx) => (
                        <span 
                          key={idx} 
                          className={idx === shortcutIndex ? 'text-red-700 font-black underline underline-offset-2' : ''}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                    {item.shortcut && (
                      <span className={`text-[10px] font-mono px-1 rounded ${isSelected ? 'bg-black/15 text-black font-bold' : 'text-slate-400'}`}>
                        [{item.shortcut}]
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Status Bar inside menu box */}
            <div className="bg-[#003828] text-white/80 px-4 py-1 text-center text-[10px] font-mono border-t border-[#004b36]">
              {menuMode === 'main' ? 'TallyPrime 4.5 • Gateway' : `TallyPrime 4.5 • ${menuTitle}`}
            </div>
          </div>
        </div>
      </div>

      {/* Classic Tally Quit Modal */}
      {showQuitModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-2xs flex items-center justify-center z-50">
          <div className="w-[320px] bg-[#fcfaef] border-2 border-[#004b36] rounded shadow-2xl overflow-hidden font-sans">
            <div className="bg-[#004b36] text-amber-300 font-bold px-4 py-1.5 text-center text-[13px] uppercase tracking-wide">
              Quit ?
            </div>
            <div className="p-6 text-center">
              <div className="text-[14px] font-bold text-[#1b2b34] mb-6">
                Do you want to exit TallyPrime?
              </div>
              <div className="flex justify-center gap-4 font-mono text-[13px]">
                <button
                  onClick={() => auth.signOut()}
                  className={`px-5 py-1.5 rounded font-bold cursor-pointer border ${
                    quitSelectedIndex === 0 
                      ? 'bg-[#ffc107] text-[#002b20] border-amber-600 shadow-xs' 
                      : 'bg-white text-[#004b36] border-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span className="text-red-700 underline font-black">Y</span>es
                </button>
                <button
                  onClick={() => setShowQuitModal(false)}
                  className={`px-5 py-1.5 rounded font-bold cursor-pointer border ${
                    quitSelectedIndex === 1 
                      ? 'bg-[#ffc107] text-[#002b20] border-amber-600 shadow-xs' 
                      : 'bg-white text-[#004b36] border-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span className="text-red-700 underline font-black">N</span>o
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tally Prime Quick Function Key Bar */}
      <div className="bg-[#003828] text-white py-1 px-4 flex items-center justify-between text-[11px] font-mono no-print border-t border-[#004b36]">
        <div className="flex items-center gap-3">
          <span className="bg-[#005c43] px-2 py-0.5 rounded cursor-pointer hover:bg-[#007052]" onClick={() => navigate('/company')}>F1: Company</span>
          <span className="bg-[#005c43] px-2 py-0.5 rounded cursor-pointer hover:bg-[#007052]" onClick={() => navigate('/vouchers')}>F2: Vouchers</span>
          <span className="bg-[#005c43] px-2 py-0.5 rounded cursor-pointer hover:bg-[#007052]" onClick={() => navigate('/ledgers')}>F3: Masters</span>
          <span className="bg-[#005c43] px-2 py-0.5 rounded cursor-pointer hover:bg-[#007052]" onClick={() => navigate('/reports')}>F4: Reports</span>
          <span className="bg-[#005c43] px-2 py-0.5 rounded cursor-pointer hover:bg-[#007052]" onClick={() => navigate('/inventory')}>F5: Stock</span>
        </div>
        <div className="text-amber-300 font-bold">
          Smart Tally Prime v4.5 • Licensed
        </div>
      </div>
    </div>
  );
}
