import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, HardDrive, X } from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';
import { Godown } from '../types';
import { toast } from 'sonner';

export default function Godowns() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const initialMode = searchParams.get('mode');

  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(initialMode === 'create');
  const [editingGodown, setEditingGodown] = useState<Godown | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<Godown>>({
    name: '',
    alias: '',
    parentGodown: 'Primary',
    address: '',
    allowStorage: true,
    ourStockWithThirdParty: false,
    thirdPartyStockWithUs: false
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeCompany?.id) return;
    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];
    const unsubscribe = dataService.onSnapshotCollection<Godown>('godowns', conditions, (fetched) => {
      setGodowns(fetched || []);
    });
    return () => unsubscribe();
  }, [activeCompany?.id]);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isModalOpen]);

  const handleOpenCreate = () => {
    setEditingGodown(null);
    setFormData({
      name: '',
      alias: '',
      parentGodown: 'Primary',
      address: '',
      allowStorage: true,
      ourStockWithThirdParty: false,
      thirdPartyStockWithUs: false
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: Godown) => {
    setEditingGodown(g);
    setFormData({ ...g });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) {
      toast.error('No active company selected');
      return;
    }
    if (!formData.name?.trim()) {
      toast.error('Godown name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<Godown, 'id'> = {
        name: formData.name.trim(),
        alias: formData.alias?.trim() || '',
        parentGodown: formData.parentGodown || 'Primary',
        address: formData.address?.trim() || '',
        allowStorage: formData.allowStorage !== false,
        ourStockWithThirdParty: !!formData.ourStockWithThirdParty,
        thirdPartyStockWithUs: !!formData.thirdPartyStockWithUs,
        companyId: activeCompany.id,
        createdBy: 'system',
        createdAt: editingGodown?.createdAt || new Date().toISOString()
      };

      if (editingGodown?.id) {
        await dataService.updateDocument('godowns', editingGodown.id, payload);
        toast.success(`Godown "${payload.name}" updated successfully`);
      } else {
        await dataService.addDocument('godowns', payload);
        toast.success(`Godown "${payload.name}" created successfully`);
      }

      setIsModalOpen(false);
      setEditingGodown(null);
    } catch (err: any) {
      console.error('Error saving godown:', err);
      toast.error('Failed to save godown: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (g: Godown) => {
    if (!g.id) return;
    if (g.name === 'Main Location' || g.name === 'Primary') {
      toast.error('Cannot delete default primary location');
      return;
    }
    if (!confirm(`Are you sure you want to delete godown "${g.name}"?`)) return;
    try {
      await dataService.deleteDocument('godowns', g.id);
      toast.success(`Godown "${g.name}" deleted`);
    } catch (err: any) {
      toast.error('Failed to delete godown: ' + err.message);
    }
  };

  const filteredGodowns = godowns.filter(g => 
    !searchTerm || 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (g.alias && g.alias.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <HardDrive className="text-teal-600" size={26} />
            <span>Godowns / Locations</span>
          </h1>
          <p className="text-sm text-slate-500">
            Manage multi-location warehouses, godowns, and storage facilities
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus size={16} />
          <span>Add New Godown</span>
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
              placeholder="Search godowns by name or alias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Alias</th>
                <th className="py-3 px-4">Parent Godown</th>
                <th className="py-3 px-4">Address</th>
                <th className="py-3 px-4 text-center">Allows Storage</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGodowns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No godowns found. Click "Add New Godown" to create one.
                  </td>
                </tr>
              ) : (
                filteredGodowns.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-teal-800">{g.name}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">{g.alias || '-'}</td>
                    <td className="py-3 px-4 text-slate-700">{g.parentGodown}</td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-xs">{g.address || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        g.allowStorage !== false 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {g.allowStorage !== false ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(g)}
                          className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-slate-100 rounded-md transition-colors"
                          title="Edit Godown"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="Delete Godown"
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

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">
                {editingGodown ? 'Edit Godown' : 'Create New Godown'}
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
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Warehouse 1, Floor 2"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Alias
                </label>
                <input
                  type="text"
                  placeholder="Short code / alternate name"
                  value={formData.alias || ''}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Under (Parent Godown)
                </label>
                <select
                  value={formData.parentGodown || 'Primary'}
                  onChange={(e) => setFormData({ ...formData, parentGodown: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium bg-white"
                >
                  <option value="Primary">Primary</option>
                  {godowns
                    .filter(g => g.id !== editingGodown?.id)
                    .map(g => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Street address or location details"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-between py-2 border-t border-slate-100">
                <span className="text-sm font-medium text-slate-700">Allow storage of materials?</span>
                <input
                  type="checkbox"
                  checked={formData.allowStorage !== false}
                  onChange={(e) => setFormData({ ...formData, allowStorage: e.target.checked })}
                  className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
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
                  {isSubmitting ? 'Saving...' : editingGodown ? 'Update Godown' : 'Create Godown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
