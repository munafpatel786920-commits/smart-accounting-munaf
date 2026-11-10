import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { format } from 'date-fns';

interface MasterItem {
  id: string;
  label: string;
  shortcut: string;
  path: string;
  type?: 'header' | 'item';
}

export default function MasterSelection() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const mode = searchParams.get('mode') || 'create'; // 'create' or 'alter'
  const [selectedIndex, setSelectedIndex] = useState(0);

  const masterItems: MasterItem[] = [
    { id: 'accounting', label: 'Accounting Masters', shortcut: '', type: 'header', path: '' },
    { id: 'group', label: 'Group', shortcut: 'G', path: mode === 'create' ? '/groups?mode=create' : '/groups' },
    { id: 'ledger', label: 'Ledger', shortcut: 'L', path: mode === 'create' ? '/ledgers?action=create' : '/ledgers' },
    ...(activeCompany?.enableCostCenters !== false ? [{ id: 'cost_center', label: 'Cost Centre', shortcut: 'C', path: '/cost-centers' }] : []),
    { id: 'inventory', label: 'Inventory Masters', shortcut: '', type: 'header', path: '' },
    { id: 'stock_item', label: 'Stock Item', shortcut: 'I', path: mode === 'create' ? '/inventory?action=create' : '/inventory' },
    { id: 'unit', label: 'Unit', shortcut: 'U', path: mode === 'create' ? '/units?mode=create' : '/units' },
    { id: 'godown', label: 'Godown', shortcut: 'O', path: mode === 'create' ? '/godowns?mode=create' : '/godowns' },
  ];

  const selectableItems = masterItems.filter(item => item.type !== 'header');

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % selectableItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + selectableItems.length) % selectableItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = selectableItems[selectedIndex];
        if (item?.path) navigate(item.path);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/');
      } else {
        const key = e.key.toUpperCase();
        const item = selectableItems.find(i => i.shortcut === key);
        if (item && item.path) {
          e.preventDefault();
          navigate(item.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, navigate, selectableItems]);

  return (
    <div 
      ref={containerRef}
      tabIndex={0}
      className="h-full flex flex-col bg-[#f5f5dc] overflow-hidden outline-none font-sans text-[#1b2b34] select-none"
    >
      {/* Top Header */}
      <div className="bg-[#004b36] text-white h-9 flex items-center px-4 text-xs font-medium shrink-0 justify-between border-b border-[#003828]">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-amber-300 uppercase tracking-wider">
            Master {mode === 'create' ? 'Creation' : 'Alteration'}
          </span>
        </div>
        <div className="flex-1 text-center font-bold font-mono text-sm text-emerald-100">
          {activeCompany?.name || 'Smart Accounting'}
        </div>
        <div className="flex items-center space-x-4 font-mono text-xs">
          <span>{format(new Date(), 'd-MMM-yyyy')}</span>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-[420px] flex flex-col border-2 border-[#004b36] rounded shadow-2xl bg-white overflow-hidden">
          <div className="bg-[#004b36] text-amber-300 px-4 py-2 flex items-center justify-between text-[13px] font-bold uppercase tracking-wider shadow-inner">
            <span>List of Masters</span>
            <button 
              onClick={() => navigate('/')} 
              className="hover:bg-white/10 px-2 py-0.5 rounded text-white text-xs flex items-center gap-1 border border-white/20 cursor-pointer"
              title="Back to Gateway (Esc)"
            >
              <ArrowLeft size={13} />
              <span>Esc</span>
            </button>
          </div>
          <div className="py-2 bg-[#fcfaef] min-h-[280px]">
            {masterItems.map((item) => {
              if (item.type === 'header') {
                return (
                  <div key={item.id} className="px-6 py-1 text-[11px] font-black text-[#004b36] mt-2 first:mt-0 border-b border-emerald-900/10 mb-1 uppercase tracking-widest bg-emerald-100/40">
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
                  onClick={() => navigate(item.path)}
                  className={`px-8 py-1.5 text-[14px] cursor-pointer transition-colors flex justify-between items-center ${
                    isSelected 
                      ? 'bg-[#ffc107] text-[#002b20] font-black shadow-inner border-y border-amber-500' 
                      : 'hover:bg-emerald-100/50 text-[#1b2b34] font-medium'
                  }`}
                >
                  <div>
                    {labelParts.map((char, idx) => (
                      <span key={idx} className={idx === shortcutIndex ? 'text-red-700 font-black underline underline-offset-2' : ''}>
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

          <div className="bg-[#003828] text-white/80 px-4 py-1 text-center text-[10px] font-mono border-t border-[#004b36]">
            Press Esc to return to Gateway of Tally
          </div>
        </div>
      </div>
    </div>
  );
}
