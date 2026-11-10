import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Alt + G', description: 'Go To (Search anything)' },
    { key: 'Alt + C', description: 'Calculator' },
    { key: 'Alt + H', description: 'Keyboard Shortcuts Help' },
    { key: 'Ctrl + A', description: 'Quick Save (Voucher/Ledger)' },
    { key: 'Alt + P', description: 'Print Voucher (from list)' },
    { key: 'F2', description: 'Change Date' },
    { key: 'F4', description: 'Contra Voucher' },
    { key: 'F5', description: 'Payment Voucher' },
    { key: 'F6', description: 'Receipt Voucher' },
    { key: 'F7', description: 'Journal Voucher' },
    { key: 'F8', description: 'Sales Voucher' },
    { key: 'F9', description: 'Purchase Voucher' },
    { key: 'Alt + C (in Voucher)', description: 'Quick Create Ledger/Product' },
    { key: 'Esc', description: 'Close Modal / Cancel' },
    { key: 'Enter', description: 'Next Field / Save' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-indigo-50">
          <div className="flex items-center gap-3 text-indigo-700">
            <Keyboard size={24} />
            <h2 className="text-xl font-bold">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors text-indigo-500">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 gap-3">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:shadow-sm transition-all group">
                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{s.description}</span>
                <kbd className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-indigo-600 shadow-sm">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-200"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
