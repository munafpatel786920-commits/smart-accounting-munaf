import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Layers, X } from 'lucide-react';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';
import { GroupMaster } from '../types';
import { TALLY_GROUPS, getGroupCategory } from '../constants';
import { toast } from 'sonner';

export default function Groups() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeCompany } = useCompany();
  const initialMode = searchParams.get('mode');

  const [groups, setGroups] = useState<GroupMaster[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(initialMode === 'create');
  const [editingGroup, setEditingGroup] = useState<GroupMaster | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<GroupMaster>>({
    name: '',
    alias: '',
    parentGroup: 'Primary',
    natureOfGroup: 'Assets',
    isSubLedger: false,
    netDebitCreditBalReporting: false,
    usedForCalculation: false,
    allocationMethod: 'Not Applicable'
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeCompany?.id) return;
    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];
    const unsubscribe = dataService.onSnapshotCollection<GroupMaster>('groups', conditions, (fetched) => {
      setGroups(fetched || []);
    });
    return () => unsubscribe();
  }, [activeCompany?.id]);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isModalOpen]);

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      alias: '',
      parentGroup: 'Primary',
      natureOfGroup: 'Assets',
      isSubLedger: false,
      netDebitCreditBalReporting: false,
      usedForCalculation: false,
      allocationMethod: 'Not Applicable'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: GroupMaster) => {
    setEditingGroup(g);
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
      toast.error('Group name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<GroupMaster, 'id'> = {
        name: formData.name.trim(),
        alias: formData.alias?.trim() || '',
        parentGroup: formData.parentGroup || 'Primary',
        natureOfGroup: formData.natureOfGroup || 'Assets',
        isSubLedger: !!formData.isSubLedger,
        netDebitCreditBalReporting: !!formData.netDebitCreditBalReporting,
        usedForCalculation: !!formData.usedForCalculation,
        allocationMethod: formData.allocationMethod || 'Not Applicable',
        companyId: activeCompany.id,
        createdBy: 'system',
        createdAt: editingGroup?.createdAt || new Date().toISOString()
      };

      if (editingGroup?.id) {
        await dataService.updateDocument('groups', editingGroup.id, payload);
        toast.success(`Group "${payload.name}" updated successfully`);
      } else {
        await dataService.addDocument('groups', payload);
        toast.success(`Group "${payload.name}" created successfully`);
      }

      setIsModalOpen(false);
      setEditingGroup(null);
    } catch (err: any) {
      console.error('Error saving group:', err);
      toast.error('Failed to save group: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (g: GroupMaster) => {
    if (!g.id) return;
    if (TALLY_GROUPS.includes(g.name as any)) {
      toast.error('Cannot delete predefined system group');
      return;
    }
    if (!confirm(`Are you sure you want to delete group "${g.name}"?`)) return;
    try {
      await dataService.deleteDocument('groups', g.id);
      toast.success(`Group "${g.name}" deleted`);
    } catch (err: any) {
      toast.error('Failed to delete group: ' + err.message);
    }
  };

  // Predefined default standard groups + custom user groups
  const allDisplayGroups = [
    ...groups,
    ...TALLY_GROUPS.filter(tg => !groups.some(g => g.name === tg)).map(tg => ({
      id: `default_${tg}`,
      name: tg,
      alias: '',
      parentGroup: 'Primary',
      natureOfGroup: getGroupCategory(tg) as any,
      companyId: activeCompany?.id || '',
      createdBy: 'system',
      createdAt: '',
      isSystem: true
    }))
  ];

  const filteredGroups = allDisplayGroups.filter(g => 
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
            <Layers className="text-teal-600" size={26} />
            <span>Account Groups</span>
          </h1>
          <p className="text-sm text-slate-500">
            Manage hierarchical chart of accounts and parent balance sheet groupings
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Custom Group</span>
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
              placeholder="Search groups by name or alias..."
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
                <th className="py-3 px-4">Group Name</th>
                <th className="py-3 px-4">Alias</th>
                <th className="py-3 px-4">Parent Group</th>
                <th className="py-3 px-4">Nature / Category</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No groups found.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((g: any) => (
                  <tr key={g.id || g.name} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-teal-800">{g.name}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">{g.alias || '-'}</td>
                    <td className="py-3 px-4 text-slate-700">{g.parentGroup || 'Primary'}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {g.natureOfGroup || getGroupCategory(g.name)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        g.isSystem 
                          ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {g.isSystem ? 'Standard' : 'Custom'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {!g.isSystem ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(g)}
                            className="p-1.5 text-slate-500 hover:text-teal-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Group"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(g)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete Group"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Locked</span>
                      )}
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
                {editingGroup ? 'Edit Group' : 'Create Custom Group'}
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
                  Group Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Administrative Expenses, North Zone Debtors"
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
                  Under (Parent Group)
                </label>
                <select
                  value={formData.parentGroup || 'Primary'}
                  onChange={(e) => {
                    const parent = e.target.value;
                    const cat = getGroupCategory(parent);
                    setFormData({ 
                      ...formData, 
                      parentGroup: parent,
                      natureOfGroup: (cat === 'Assets' || cat === 'Liabilities' || cat === 'Income' || cat === 'Expenses') ? cat : 'Assets'
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium bg-white"
                >
                  <option value="Primary">Primary</option>
                  {TALLY_GROUPS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nature of Group
                </label>
                <select
                  value={formData.natureOfGroup || 'Assets'}
                  onChange={(e) => setFormData({ ...formData, natureOfGroup: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium bg-white"
                >
                  <option value="Assets">Assets</option>
                  <option value="Liabilities">Liabilities</option>
                  <option value="Income">Income</option>
                  <option value="Expenses">Expenses</option>
                </select>
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
                  {isSubmitting ? 'Saving...' : editingGroup ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
