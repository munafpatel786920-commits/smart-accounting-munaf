import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Product } from '../types';
import { formatCurrency } from '../lib/utils';
import { Plus, Search, Edit2, Trash2, X, Package, Upload, AlertTriangle, FileText, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useCompany } from '../contexts/CompanyContext';
import { dataService } from '../services/dataService';
import ProductSummaryModal from '../components/ProductSummaryModal';

export default function Inventory() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSummaryProduct, setSelectedSummaryProduct] = useState<Product | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firstInputRef = useRef<HTMLInputElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mainContainerRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const isInsideModal = target.closest('.modal-content');
      
      if (!isInput && !isInsideModal && !isModalOpen) {
        mainContainerRef.current?.focus();
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isModalOpen]);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [isModalOpen]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.hsnCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) {
        if (e.key === 'Escape') {
          setIsModalOpen(false);
          return;
        }

        // Form field navigation: Enter and Arrow Up/Down
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const activeElement = document.activeElement;
          if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'BUTTON')) {
            const form = activeElement.closest('form');
            if (form) {
              const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]')) as HTMLElement[];
              const currentIndex = inputs.indexOf(activeElement as HTMLElement);

              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                // Don't prevent default for Enter on submit button
                if (e.key === 'Enter' && activeElement.tagName === 'BUTTON' && (activeElement as HTMLButtonElement).type === 'submit') {
                  return;
                }
                
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % inputs.length;
                inputs[nextIndex]?.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + inputs.length) % inputs.length;
                inputs[prevIndex]?.focus();
              }
            }
          }
        }
        return;
      }

      if (deletingProduct) {
        if (e.key === 'Escape') setDeletingProduct(null);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredProducts.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (filteredProducts[selectedIndex]) {
          handleEdit(filteredProducts[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        navigate('/masters');
      } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.altKey) {
        setEditingId(null);
        setFormData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18 });
        setIsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, deletingProduct, selectedIndex, filteredProducts, navigate]);
  
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setEditingId(null);
      setFormData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18 });
      setIsModalOpen(true);
      // Clear the param after opening
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams]);

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    hsnCode: '',
    unit: 'Pcs',
    openingStock: 0,
    stockQuantity: 0,
    purchasePrice: 0,
    salesPrice: 0,
    gstRate: 18,
    decimalPlaces: 0
  });

  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribe = dataService.onSnapshotCollection<Product>(
      'products',
      conditions,
      (fetchedProducts) => {
        setProducts(fetchedProducts);
        setError(null);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Inventory: Error fetching products:', error);
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
          const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
          if (match) {
            setError(`A database index is missing. [Click here to create it](${match[0]})`);
          } else {
            setError('A database index is missing. Please check the browser console for the setup link.');
          }
        } else {
          setError(error.message);
        }
      }
    );
    return () => unsubscribe();
  }, [activeCompany?.id]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCompany?.id) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setImporting(true);
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const uid = auth.currentUser?.uid;
        if (!uid) return;

        let successCount = 0;
        let errorCount = 0;

        const existingNames = new Set(products.map(p => p.name.trim().toLowerCase()));

        for (const row of data) {
          try {
            const product: Omit<Product, 'id'> = {
              name: String(row['Product Name'] || row['name'] || '').trim(),
              hsnCode: String(row['HSN Code'] || row['hsnCode'] || ''),
              unit: row['Unit'] || row['unit'] || 'Pcs',
              openingStock: Number(row['Opening Stock'] || row['openingStock'] || 0),
              stockQuantity: Number(row['Current Stock'] || row['stockQuantity'] || row['openingStock'] || 0),
              purchasePrice: Number(row['Purchase Price'] || row['purchasePrice'] || 0),
              salesPrice: Number(row['Sales Price'] || row['salesPrice'] || 0),
              gstRate: Number(row['GST Rate'] || row['gstRate'] || 18),
              decimalPlaces: Number(row['Decimal Places'] || row['decimalPlaces'] || 0),
              companyId: activeCompany.id,
              createdBy: uid,
              createdAt: new Date().toISOString()
            };

            const trimmedName = product.name.toLowerCase();
            if (!product.name || !trimmedName) {
              errorCount++;
              continue;
            }

            if (existingNames.has(trimmedName)) {
              errorCount++;
              continue;
            }

            existingNames.add(trimmedName);

            const docRef = await addDoc(collection(db, 'products'), product);
            successCount++;
          } catch (err) {
            console.error('Error importing row:', err);
            errorCount++;
          }
        }

        toast.success(`Imported ${successCount} products successfully! ${errorCount > 0 ? `${errorCount} rows failed.` : ''}`);
        setIsImportModalOpen(false);
      } catch (err: any) {
        console.error('Import error:', err);
        toast.error('Failed to import products: ' + err.message);
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'Product Name': 'Sample Product',
        'HSN Code': '123456',
        'Unit': 'Pcs',
        'Opening Stock': 100,
        'Current Stock': 100,
        'Purchase Price': 500,
        'Sales Price': 750,
        'GST Rate': 18,
        'Decimal Places': 0
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'inventory_import_template.xlsx');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || !activeCompany?.id) return;

      const trimmedName = formData.name?.trim().toLowerCase();
      if (!trimmedName) {
        toast.error('Product name cannot be empty');
        return;
      }

      const duplicateExists = products.some(
        p => p.name.trim().toLowerCase() === trimmedName && p.id !== editingId
      );

      if (duplicateExists) {
        toast.error(`A stock item with the name '${formData.name}' already exists!`);
        return;
      }

      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), {
          ...formData,
          openingStock: Number(formData.openingStock) || 0,
          stockQuantity: Number(formData.stockQuantity) || 0,
          purchasePrice: Number(formData.purchasePrice) || 0,
          salesPrice: Number(formData.salesPrice) || 0,
          gstRate: Number(formData.gstRate) || 0,
          decimalPlaces: Number(formData.decimalPlaces) || 0,
          enableBom: !!formData.enableBom,
          bom: formData.enableBom ? (formData.bom || []).filter(b => b.productId && b.quantity > 0) : null
        });
      } else {
        await addDoc(collection(db, 'products'), {
          ...formData,
          stockQuantity: formData.openingStock || 0,
          openingStock: Number(formData.openingStock) || 0,
          purchasePrice: Number(formData.purchasePrice) || 0,
          salesPrice: Number(formData.salesPrice) || 0,
          gstRate: Number(formData.gstRate) || 0,
          decimalPlaces: Number(formData.decimalPlaces) || 0,
          createdBy: uid,
          companyId: activeCompany.id,
          createdAt: new Date().toISOString(),
          enableBom: !!formData.enableBom,
          bom: formData.enableBom ? (formData.bom || []).filter(b => b.productId && b.quantity > 0) : null
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18, decimalPlaces: 0 });
      toast.success(editingId ? 'Product updated successfully' : 'Product created successfully');
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product');
    }
  };

  const handleDelete = async (product: Product) => {
    if (!product.id) return;
    
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'products', product.id));
      toast.success('Product deleted successfully');
      setDeletingProduct(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({
      ...product,
      openingStock: product.openingStock ?? 0,
      stockQuantity: product.stockQuantity ?? 0,
      decimalPlaces: product.decimalPlaces ?? 0,
      enableBom: product.enableBom ?? false,
      bom: product.bom ?? []
    });
    setEditingId(product.id!);
    setIsModalOpen(true);
  };

  return (
    <div 
      ref={mainContainerRef}
      tabIndex={0}
      className="h-full flex flex-col bg-[#fdfcf0] overflow-hidden outline-none font-mono text-[#002f3c]"
    >
      {error && (
        <div className="m-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-sm flex items-start gap-3 no-print">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold mb-1">Database Error</p>
            {error.includes('https://console.firebase.google.com') ? (
              <p className="text-sm">
                This page requires a composite index to display data. 
                <a 
                  href={error.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block mt-2 font-bold underline hover:text-red-800"
                >
                  Click here to create the required index in Firebase Console
                </a>
              </p>
            ) : (
              <p className="text-sm">{error}</p>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-[#004d5a] border-b border-[#003c46] px-6 py-3 flex items-center justify-between shrink-0 text-white">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#ffcb2b] font-mono border-l-2 border-[#ffcb2b] pl-2">{t('list_of_stock_items')}</h2>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#ffcb2b]/70" size={12} />
              <input
                type="text"
                placeholder={t('search_items')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1 bg-[#003c46] text-[#ffcb2b] placeholder-[#ffcb2b]/60 border border-[#ffcb2b]/30 rounded-none text-xs font-bold outline-none w-48 focus:border-[#ffcb2b]"
              />
            </div>
            
            <button 
              onClick={downloadTemplate}
              className="bg-[#003c46] hover:bg-[#002f3c] text-[#ffcb2b] px-3 py-1 border border-[#ffcb2b]/30 rounded-none text-[11px] font-bold font-mono tracking-wider transition-all flex items-center gap-1.5"
              title={t('download_excel_template')}
            >
              <FileText size={12} />
              <span>{t('template')}</span>
            </button>
            
            <div className="relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImport}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="bg-[#003c46] hover:bg-[#002f3c] text-[#ffcb2b] px-3 py-1 border border-[#ffcb2b]/30 rounded-none text-[11px] font-bold font-mono tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {importing ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                ) : (
                  <Upload size={12} />
                )}
                <span>{t('import')}</span>
              </button>
            </div>
            
            <button 
              onClick={() => {
                setEditingId(null);
                setFormData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18 });
                setIsModalOpen(true);
              }}
              className="bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] px-3 py-1 border border-[#002f3c]/20 rounded-none text-[11px] font-bold font-mono tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={12} />
              {t('add_product')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#fdfcf0] p-4">
          <div className="bg-[#fcfcf0] border border-[#003c46]/45 rounded-none shadow-sm overflow-hidden">
            <table className="w-full text-xs text-left font-mono">
              <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold border-b border-[#003c46] uppercase">
                <tr>
                  <th className="py-2.5 px-4 font-mono">{t('product')}</th>
                  <th className="py-2.5 px-4 font-mono">{t('opening')}</th>
                  <th className="py-2.5 px-4 font-mono">{t('current_stock')}</th>
                  <th className="py-2.5 px-4 text-right font-mono">{t('sales_price')}</th>
                  <th className="py-2.5 px-4 text-right w-24 font-mono">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#003c46]/20 bg-white">
                {filteredProducts.map((product, index) => (
                  <tr 
                    key={product.id} 
                    className={`transition-all cursor-pointer border-b border-[#003c46]/10 ${
                      selectedIndex === index 
                        ? 'bg-[#ffffcc] text-[#002f3c] font-bold border-l-4 border-[#004d5a]' 
                        : 'hover:bg-[#ffffcc]/40 text-[#002f3c]'
                    }`}
                    onClick={() => {
                      setSelectedIndex(index);
                      setSelectedSummaryProduct(product);
                    }}
                    onDoubleClick={() => handleEdit(product)}
                  >
                    <td className="py-2 px-4">
                      <div className="flex flex-col font-mono">
                        <span className="font-bold">{product.name}</span>
                        <span className="text-[10px] text-gray-500 mt-0.5 font-sans">{product.hsnCode || t('no_hsn')}</span>
                      </div>
                    </td>
                    <td className="py-2 px-4 uppercase">
                      {(product.openingStock || 0).toFixed(product.decimalPlaces || 0)} {product.unit}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`font-bold ${product.stockQuantity < 10 ? 'text-red-700' : ''}`}>
                        {(product.stockQuantity || 0).toFixed(product.decimalPlaces || 0)} {product.unit}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-gray-900">
                      {formatCurrency(product.salesPrice)}
                    </td>
                    <td className="py-2 px-4 text-right space-x-1.5 text-xs whitespace-nowrap">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedSummaryProduct(product); }} className="p-1 px-1.5 text-teal-850 hover:bg-teal-50 border border-teal-350 rounded-none font-bold inline-flex items-center gap-0.5">
                        <Eye size={12} className="text-teal-750 font-bold" /> Summary
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(product); }} className="p-1 px-1.5 text-blue-800 hover:bg-blue-10 border border-blue-350 rounded-none font-bold">
                        Edit
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeletingProduct(product); }} className="p-1 px-1.5 text-red-800 hover:bg-red-10 font-bold border border-red-350 rounded-none">
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#002f3c]/60 italic">
                      {t('no_products_found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center space-x-3 text-red-600 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold">{t('delete_product')}</h3>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-600">
                {t('confirm_delete_product', { name: deletingProduct.name })}
              </p>
            </div>

            <div className="flex space-x-3 mt-8">
              <button
                onClick={() => setDeletingProduct(null)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleDelete(deletingProduct)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Trash2 size={18} />
                    <span>{t('delete_product')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-[#fdfcf0] border-2 border-[#004d5a] w-full max-w-2xl overflow-hidden shadow-2xl rounded-none font-mono">
            <div className="p-4 bg-[#004d5a] text-[#ffcb2b] border-b border-[#003c46] flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider">{editingId ? t('edit') : t('add_product')}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 uppercase font-bold text-xs hover:bg-[#003c46] text-[#ffcb2b]">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-[#002f3c]">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('product_name')}</label>
                <input
                  type="text"
                  required
                  ref={firstInputRef}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('hsn_code')}</label>
                <input
                  type="text"
                  value={formData.hsnCode}
                  onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('unit')}</label>
                <select
                  value={formData.unit}
                  onChange={(e) => {
                    const newUnit = e.target.value;
                    setFormData({ 
                      ...formData, 
                      unit: newUnit,
                      decimalPlaces: (newUnit === 'Kg' || newUnit === 'Ltr') ? (formData.decimalPlaces || 2) : 0
                    });
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                >
                  <option value="Pcs">Pcs</option>
                  <option value="Kg">Kg</option>
                  <option value="Ltr">Ltr</option>
                  <option value="Mtr">Mtr</option>
                  <option value="Box">Box</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('opening_stock')}</label>
                <input
                  type="number"
                  required
                  value={formData.openingStock}
                  onChange={(e) => setFormData({ ...formData, openingStock: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('current_stock_quantity')}</label>
                <input
                  type="number"
                  required
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('purchase_price')}</label>
                <input
                  type="number"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('sales_price')}</label>
                <input
                  type="number"
                  value={formData.salesPrice}
                  onChange={(e) => setFormData({ ...formData, salesPrice: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">{t('gst_rate')} (%)</label>
                <input
                  type="number"
                  value={formData.gstRate}
                  onChange={(e) => setFormData({ ...formData, gstRate: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                />
              </div>
              {(formData.unit === 'Kg' || formData.unit === 'Ltr') && (
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider">{t('number_of_decimal_places')}</label>
                  <select
                    value={formData.decimalPlaces}
                    onChange={(e) => setFormData({ ...formData, decimalPlaces: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 bg-white border border-[#003c46]/30 rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                  >
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              )}

              {activeCompany?.enableBOM && (
                <div className="md:col-span-2 border-t border-[#003c46]/25 pt-4 mt-2 space-y-4">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="enableBomCheckbox"
                      checked={!!formData.enableBom}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData({
                          ...formData,
                          enableBom: checked,
                          bom: checked ? (formData.bom?.length ? formData.bom : [{ productId: '', quantity: 1 }]) : []
                        });
                      }}
                      className="h-4 w-4 text-[#004d5a] border-[#003c46]/30 focus:ring-[#003c46]"
                    />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Define Bill of Materials (BOM) Recipe?
                    </span>
                  </label>

                  {formData.enableBom && (
                    <div className="bg-[#004d5a]/5 p-4 border border-[#003c46]/10 space-y-3">
                      <p className="text-[10px] text-[#004d5a] uppercase font-black tracking-wider leading-relaxed">
                        🛠️ Components needed to manufacture standard 1 unit of "{formData.name || 'Finished Product'}"
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {(formData.bom || []).map((bItem, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={bItem.productId}
                              onChange={(e) => {
                                const newBom = [...(formData.bom || [])];
                                newBom[idx].productId = e.target.value;
                                setFormData({ ...formData, bom: newBom });
                              }}
                              className="flex-1 px-3 py-1 bg-white border border-[#003c46]/30 text-xs font-bold outline-none focus:border-[#004d5a]"
                              required
                            >
                              <option value="">-- Select Material / Component --</option>
                              {products
                                .filter(p => !editingId || p.id !== editingId)
                                .map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                                ))}
                            </select>
                            <div className="w-28 flex items-center bg-white border border-[#003c46]/30 px-2 py-0.5">
                              <input
                                type="number"
                                placeholder="Qty"
                                value={bItem.quantity || ''}
                                min="0.000001"
                                step="any"
                                onChange={(e) => {
                                  const newBom = [...(formData.bom || [])];
                                  newBom[idx].quantity = Number(e.target.value) || 0;
                                  setFormData({ ...formData, bom: newBom });
                                }}
                                className="w-full text-xs font-bold font-mono outline-none text-right"
                                required
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newBom = (formData.bom || []).filter((_, i) => i !== idx);
                                setFormData({ ...formData, bom: newBom });
                              }}
                              className="text-red-600 hover:bg-red-50 p-1 border border-red-200 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            bom: [...(formData.bom || []), { productId: '', quantity: 1 }]
                          });
                        }}
                        className="px-3 py-1 bg-[#004d5a] hover:bg-[#003c46] text-[#ffcb2b] text-[10px] uppercase font-bold font-mono transition-all"
                      >
                        + Add Component Item
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="md:col-span-2 flex justify-end space-x-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-1.5 border border-[#003c46]/40 bg-[#003c46] hover:bg-[#002f3c] text-[#ffcb2b] font-bold rounded-none text-xs uppercase"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] border border-[#002f3c]/20 font-bold rounded-none text-xs uppercase"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selectedSummaryProduct && activeCompany?.id && (
        <ProductSummaryModal
          product={selectedSummaryProduct}
          companyId={activeCompany.id}
          onClose={() => setSelectedSummaryProduct(null)}
        />
      )}
    </div>
  );
}
