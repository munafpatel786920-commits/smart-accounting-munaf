import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../contexts/CompanyContext';
import { 
  Search, 
  FileText, 
  BookOpen, 
  Package, 
  BarChart3, 
  Settings, 
  LayoutDashboard,
  ArrowRight,
  Plus
} from 'lucide-react';

interface GoToOption {
  id: string;
  label: string;
  path: string;
  icon: any;
  category: string;
  shortcut?: string;
}

interface GoToModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoToModal({ isOpen, onClose }: GoToModalProps) {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const options: GoToOption[] = [
    { id: 'gateway', label: 'Gateway of Tally', path: '/', icon: LayoutDashboard, category: 'General' },
    { id: 'create_master', label: 'Create Master (Ledger/Stock)', path: '/masters?mode=create', icon: Plus, category: 'Masters' },
    { id: 'alter_master', label: 'Alter Master', path: '/masters?mode=alter', icon: Settings, category: 'Masters' },
    { id: 'vouchers', label: 'Create / View Vouchers', path: '/vouchers', icon: Plus, category: 'Transactions' },
    { id: 'daybook', label: 'Day Book', path: '/reports?type=DAYBOOK', icon: FileText, category: 'Reports' },
    { id: 'ledgers', label: 'Chart of Accounts', path: '/ledgers', icon: BookOpen, category: 'Masters' },
    ...(activeCompany?.enableCostCenters !== false ? [{ id: 'cost_centers', label: 'Cost Centres', path: '/cost-centers', icon: Package, category: 'Masters' }] : []),
    ...(activeCompany?.enablePayroll ? [{ id: 'payroll', label: 'Payroll Management', path: '/payroll', icon: FileText, category: 'Masters' }] : []),
    { id: 'inventory', label: 'Stock Summary', path: '/reports?type=STOCK', icon: Package, category: 'Reports' },
    { id: 'pl', label: 'Profit & Loss A/c', path: '/reports?type=PL', icon: BarChart3, category: 'Reports' },
    { id: 'bs', label: 'Balance Sheet', path: '/reports?type=BS', icon: BarChart3, category: 'Reports' },
    { id: 'trial_balance', label: 'Trial Balance', path: '/reports?type=TRIAL_BALANCE', icon: BarChart3, category: 'Reports' },
    { id: 'cash_flow', label: 'Cash Flow', path: '/reports?type=CASH_FLOW', icon: BarChart3, category: 'Reports' },
    { id: 'gst', label: 'GST Report', path: '/reports?type=GST', icon: FileText, category: 'Reports' },
    { id: 'outstanding', label: 'Outstanding Report', path: '/reports?type=OUTSTANDING', icon: FileText, category: 'Reports' },
    { id: 'dash', label: 'Analytics Dashboard', path: '/dashboard', icon: BarChart3, category: 'General' },
    { id: 'settings', label: 'Settings', path: '/settings', icon: Settings, category: 'General' },
  ];

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    opt.category.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredOptions[selectedIndex]) {
          navigate(filteredOptions[selectedIndex].path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredOptions, selectedIndex, navigate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[60vh]">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <Search className="text-gray-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Go to report, voucher, or setting..."
            className="flex-1 bg-transparent border-none outline-none text-lg text-gray-800 placeholder:text-gray-400"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-200 rounded text-[10px] font-bold text-gray-500 uppercase">
            ESC to close
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredOptions.length > 0 ? (
            <div className="space-y-1">
              {filteredOptions.map((opt, index) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    navigate(opt.path);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    index === selectedIndex 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${index === selectedIndex ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                      <opt.icon size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-sm">{opt.label}</p>
                      <p className={`text-[10px] uppercase font-bold tracking-wider ${index === selectedIndex ? 'text-white/70' : 'text-gray-400'}`}>
                        {opt.category}
                      </p>
                    </div>
                  </div>
                  {index === selectedIndex && (
                    <ArrowRight size={18} className="animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400 italic">
              No matching options found...
            </div>
          )}
        </div>

        <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Use arrows to navigate</span>
          <span>Press Enter to select</span>
        </div>
      </div>
    </div>
  );
}
