import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft, Search, Edit2, Trash2, Scale, X, Check } from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';
import { UnitMaster } from '../types';
import { toast } from 'sonner';

const STANDARD_UQCS = [
  { code: 'PCS-PIECES', label: 'PCS - PIECES' },
  { code: 'NOS-NUMBERS', label: 'NOS - NUMBERS' },
  { code: 'KGS-KILOGRAMS', label: 'KGS - KILOGRAMS' },
  { code: 'GMS-GRAMMES', label: 'GMS - GRAMMES' },
  { code: 'BOX-BOX', label: 'BOX - BOX' },
  { code: 'MTR-METRES', label: 'MTR - METRES' },
  { code: 'LTR-LITRES', label: 'LTR - LITRES' },
  { code: 'BAG-BAGS', label: 'BAG - BAGS' },
  { code: 'BTL-BOTTLES', label: 'BTL - BOTTLES' },
  { code: 'CAN-CANS', label: 'CAN - CANS' },
  { code: 'CTN-CARTONS', label: 'CTN - CARTONS' },
  { code: 'DOZ-DOZENS', label: 'DOZ - DOZENS' },
  { code: 'PAC-PACKETS', label: 'PAC - PACKETS' },
  { code: 'ROL-ROLLS', label: 'ROL - ROLLS' },
  { code: 'SET-SETS', label: 'SET - SETS' },
  { code: 'SQF-SQUARE FEET', label: 'SQF - SQUARE FEET' },
  { code: 'SQM-SQUARE METRES', label: 'SQM - SQUARE METRES' },
  { code: 'TON-TONNES', label: 'TON - TONNES' },
  { code: 'UNT-UNITS', label: 'UNT - UNITS' },
  { code: 'OTH-OTHERS', label: 'OTH - OTHERS' }
];

export default function Units() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const initialMode = searchParams.get('mode');

  const [units, setUnits] = useState<UnitMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(initialMode === 'create');
  const [editingUnit, setEditingUnit] = useState<UnitMaster | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<UnitMaster>>({
    symbol: '',
    formalName: '',
    uqc: 'PCS-PIECES',
    decimalPlaces: 0
  });

  const symbolInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeCompany?.id) return;
    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];
    const unsubscribe = dataService.onSnapshotCollection<UnitMaster>('units', conditions, (fetched) => {
      setUnits(fetched || []);
    });
    return () => unsubscribe();
  }, [activeCompany?.id]);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => symbolInputRef.current?.focus(), 100);
    }
  }, [isModalOpen]);

  const handleOpenCreate = () => {
    setEditingUnit(null);
    setFormData({
      symbol: '',
      formalName: '',
      uqc: 'PCS-PIECES',
      decimalPlaces: 0
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: UnitMaster) => {
    setEditingUnit(u);
    setFormData({ ...u });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) {
      toast.error('No active company selected');
      return;
    }
    if (!formData.symbol?.trim()) {
      toast.error('Symbol is required (e.g. pcs, nos, kgs)');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<UnitMaster, 'id'> = {
        symbol: formData.symbol.trim(),
        formalName: formData.formalName?.trim() || formData.symbol.trim(),
        uqc: formData.uqc || 'OTH-OTHERS',
        decimalPlaces: Number(formData.decimalPlaces) || 0,
        companyId: activeCompany.id,
        createdBy: 'system',
        createdAt: editingUnit?.createdAt || new Date().toISOString()
      };

      if (editingUnit?.id) {
        await dataService.updateDocument('units', editingUnit.id, payload);
        toast.success(`Unit "${payload.symbol}" updated successfully`);
      } else {
        await dataService.addDocument('units', payload);
        toast.success(`Unit "${payload.symbol}" created successfully`);
      }

      setIsModalOpen(false);
      setEditingUnit(null);
    } catch (err: any) {
      console.error('Error saving unit:', err);
      toast.error('Failed to save unit: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (u: UnitMaster) => {
    if (!u.id) return;
    if (!confirm(`Are you sure you want to delete unit "${u.symbol}"?`)) return;
    try {
      await dataService.deleteDocument('units', u.id);
      toast.success(`Unit "${u.symbol}" deleted`);
    } catch (err: any) {
      toast.error('Failed to delete unit: ' + err.message);
    }
  };

  const filteredUnits = units.filter(u => 
    !searchTerm || 
    u.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.formalName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="text-teal-600" size={26} />
            <span>Unit of Measurement (UQC)</span>
          </h1>
          <p className="text-sm text-slate-500">
            Manage unit symbols, GST UQC codes, and decimal precision for items
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus size={16} />
          <span>Add New Unit</span>
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by unit symbol or formal name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Units Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Formal Name</th>
                <th className="py-3 px-4">UQC (GST Code)</th>
                <th className="py-3 px-4 text-center">Decimal Places</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No units found. Click "Add New Unit" to create one.
                  </td>
                </tr>
              ) : (
                filteredUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-teal-800">{u.symbol}</td>
                    <td className="py-3 px-4 text-slate-700 font-medium">{u.formalName}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {u.uqc || 'OTH-OTHERS'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600 font-mono">{u.decimalPlaces}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-slate-100 rounded-md transition-colors"
                          title="Edit Unit"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="Delete Unit"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">
                {editingUnit ? 'Edit Unit' : 'Create New Unit'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Symbol <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={symbolInputRef}
                  type="text"
                  required
                  placeholder="e.g. PCS, NOS, KGS, MTR"
                  value={formData.symbol || ''}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 uppercase font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Formal Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pieces, Kilograms"
                  value={formData.formalName || ''}
                  onChange={(e) => setFormData({ ...formData, formalName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Unit Quantity Code (UQC)
                </label>
                <select
                  value={formData.uqc || 'PCS-PIECES'}
                  onChange={(e) => setFormData({ ...formData, uqc: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium bg-white"
                >
                  {STANDARD_UQCS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Number of Decimal Places (0 - 4)
                </label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  value={formData.decimalPlaces ?? 0}
                  onChange={(e) => setFormData({ ...formData, decimalPlaces: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingUnit ? 'Update Unit' : 'Create Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
