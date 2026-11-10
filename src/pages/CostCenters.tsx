import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { CostCenter, CostCategory } from '../types';
import { Plus, Edit2, Trash2, X, Search, FileDown, PieChart } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';

export default function CostCenters() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', categoryId: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ name: '' });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribe = dataService.onSnapshotCollection<CostCenter>(
      'costCenters',
      conditions,
      (fetchedData) => {
        setCostCenters(fetchedData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    const unsubscribeCategories = dataService.onSnapshotCollection<CostCategory>(
      'costCategories',
      conditions,
      (fetchedData) => {
        setCostCategories(fetchedData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    return () => {
      unsubscribe();
      unsubscribeCategories();
    };
  }, [activeCompany?.id]);

  useEffect(() => {
    if (isModalOpen && firstInputRef.current) {
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    }
  }, [isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'costCenters', editingId), { 
          name: formData.name,
          categoryId: formData.categoryId 
        });
      } else {
        await addDoc(collection(db, 'costCenters'), {
          ...formData,
          companyId: activeCompany.id,
          createdBy: uid,
          createdAt: new Date().toISOString()
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', categoryId: '' });
      toast.success(editingId ? 'Cost Centre updated' : 'Cost Centre created');
    } catch (error: any) {
      console.error('Error saving cost centre:', error);
      toast.error('Failed to save cost centre: ' + error.message);
    }
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany) return;

    try {
      const docRef = await addDoc(collection(db, 'costCategories'), {
        ...categoryFormData,
        companyId: activeCompany.id,
        createdBy: uid,
        createdAt: new Date().toISOString()
      });
      setFormData(prev => ({ ...prev, categoryId: docRef.id }));
      setIsCategoryModalOpen(false);
      setCategoryFormData({ name: '' });
      toast.success('Cost Category created');
    } catch (error: any) {
      console.error('Error creating cost category:', error);
      toast.error('Failed to create cost category: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'costCenters', itemToDelete));
      toast.success('Cost Centre deleted');
      setIsDeleteOpen(false);
      setItemToDelete(null);
    } catch (error) {
      toast.error('Failed to delete cost centre');
    }
  };

  const exportToExcel = () => {
    const data = costCenters.map(cc => ({ 'Cost Centre Name': cc.name }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost Centres");
    XLSX.writeFile(wb, "Cost_Centres.xlsx");
  };

  const filteredCostCenters = costCenters.filter(cc =>
    cc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 border border-[#003c46]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 text-[#002f3c]">
          <div className="p-2 bg-[#ffcb2b]/20">
            <PieChart size={24} className="text-[#004d5a]" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-[#002f3c]">Cost Centres</h1>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('manage')} Cost Centres</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder={t('search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-300 text-sm font-medium outline-none focus:border-teal-500 focus:bg-white transition-colors min-w-[200px]"
            />
          </div>
          <button 
            onClick={exportToExcel}
            className="p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300 transition-colors"
            title={t('export_excel')}
          >
            <FileDown size={18} />
          </button>
          <button 
            onClick={() => {
              setCategoryFormData({ name: '' });
              setIsCategoryModalOpen(true);
            }}
            className="bg-[#294e5b] hover:bg-[#325f6e] text-white px-4 py-1.5 border border-[#002f3c]/20 text-xs font-bold font-mono tracking-wider transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus size={14} /> Category
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              setFormData({ name: '', categoryId: '' });
              setIsModalOpen(true);
            }}
            className="bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] px-4 py-1.5 border border-[#002f3c]/20 text-xs font-bold font-mono tracking-wider transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus size={14} /> Center
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#003c46]/20 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#004d5a] text-[#ffcb2b] text-[10px] uppercase tracking-wider font-mono border-b-2 border-[#003c46]">
              <th className="p-3 border-r border-[#003c46]/45 w-16 text-center">#</th>
              <th className="p-3 border-r border-[#003c46]/45">{t('name')}</th>
              <th className="p-3 border-r border-[#003c46]/45">Category</th>
              <th className="p-3 w-32 text-center">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#003c46]/10">
            {filteredCostCenters.map((cc, index) => (
              <tr key={cc.id} className="hover:bg-[#ffffcc]/40 transition-colors group">
                <td className="p-3 text-xs font-medium text-gray-500 border-r border-[#003c46]/10 text-center">
                  {index + 1}
                </td>
                <td className="p-3 text-sm font-bold text-[#002f3c] border-r border-[#003c46]/10">
                  {cc.name}
                </td>
                <td className="p-3 text-sm font-bold text-gray-600 border-r border-[#003c46]/10">
                  {costCategories.find(c => c.id === cc.categoryId)?.name || 'Primary Cost Category'}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(cc.id || null);
                        setFormData({ name: cc.name, categoryId: cc.categoryId || '' });
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setItemToDelete(cc.id || null);
                        setIsDeleteOpen(true);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCostCenters.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-gray-500 text-sm font-medium">
                  {searchTerm ? 'No cost centres found matching your search.' : 'No cost centres created yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#eef3ee] border-2 border-[#002f3c] w-full max-w-md shadow-2xl relative">
            <div className="bg-[#002f3c] text-white px-4 py-2 flex justify-between items-center border-b-[3px] border-[#ffcb2b]">
              <h2 className="text-sm font-black uppercase tracking-widest font-mono">
                {editingId ? 'Edit Cost Centre' : 'Create Cost Centre'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[#eef3ee] hover:text-[#ffcb2b] transition-colors"><X size={18} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#002f3c]">Category</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-sm font-bold outline-none focus:border-[#ffcb2b] focus:ring-1 focus:ring-[#ffcb2b]"
                  >
                    <option value="">Primary Cost Category</option>
                    {costCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#002f3c]">{t('name')} <span className="text-red-500">*</span></label>
                  <input
                    ref={firstInputRef}
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-sm font-bold outline-none focus:border-[#ffcb2b] focus:ring-1 focus:ring-[#ffcb2b]"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 text-xs font-bold uppercase border border-[#003c46]/30 hover:bg-gray-200 transition-colors">
                  {t('cancel')}
                </button>
                <button type="submit" className="px-4 py-1.5 bg-[#004d5a] hover:bg-[#003c46] text-[#ffcb2b] text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#eef3ee] border-2 border-[#002f3c] w-full max-w-md shadow-2xl relative">
            <div className="bg-[#002f3c] text-white px-4 py-2 flex justify-between items-center border-b-[3px] border-[#ffcb2b]">
              <h2 className="text-sm font-black uppercase tracking-widest font-mono">
                Create Cost Category
              </h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-[#eef3ee] hover:text-[#ffcb2b] transition-colors"><X size={18} /></button>
            </div>
            
            <form onSubmit={handleCategorySubmit} className="p-5">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#002f3c]">{t('name')} <span className="text-red-500">*</span></label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={categoryFormData.name}
                    onChange={(e) => setCategoryFormData({ name: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-sm font-bold outline-none focus:border-[#ffcb2b] focus:ring-1 focus:ring-[#ffcb2b]"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="px-4 py-1.5 text-xs font-bold uppercase border border-[#003c46]/30 hover:bg-gray-200 transition-colors">
                  {t('cancel')}
                </button>
                <button type="submit" className="px-4 py-1.5 bg-[#004d5a] hover:bg-[#003c46] text-[#ffcb2b] text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDeleteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-t-4 border-red-600 w-full max-w-sm shadow-2xl">
            <div className="p-5">
              <h3 className="text-lg font-black text-gray-900 mb-2">Delete Cost Centre?</h3>
              <p className="text-sm text-gray-600 font-medium">Are you sure you want to delete this cost centre? This action cannot be undone.</p>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setIsDeleteOpen(false)} className="px-4 py-1.5 text-xs font-bold uppercase border border-gray-300 hover:bg-gray-100 transition-colors">
                  {t('cancel')}
                </button>
                <button onClick={handleDelete} className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase transition-colors shadow-sm">
                  {t('delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
