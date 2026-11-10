import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dataService, authService } from '../services/dataService';
import { Company } from '../types';
import { 
  Plus, Edit2, Trash2, Download, Upload, AlertCircle, 
  Building2, Phone, Mail, MapPin, Globe, Calendar, Image as ImageIcon, 
  CheckCircle2, FolderSync, ArrowLeftRight, Check, HeartCrack, Lock, Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRIES, INDIAN_STATES, getCountryCurrency, getCountryStates, getCountryDefaultState, getCountryTaxInfo } from '../constants';
import { useCompany } from '../contexts/CompanyContext';

export default function CompanyManagement() {
  const { t } = useTranslation();
  const { companies, activeCompany, setActiveCompany, refreshCompanies } = useCompany();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [securityCheckCompany, setSecurityCheckCompany] = useState<Company | null>(null);
  const [securityInput, setSecurityInput] = useState({ username: '', password: '' });
  const [restoringToCompanyId, setRestoringToCompanyId] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<{ file: File, targetId?: string | null } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const initialCompanyState: Omit<Company, 'id' | 'createdBy' | 'createdAt'> = {
    name: '',
    address: '',
    phone: '',
    email: '',
    gstNumber: '',
    taxType: 'GST',
    taxName: 'Goods and Services Tax (GST)',
    taxLabel: 'GSTIN / UIN',
    defaultTaxRate: 18,
    country: 'India',
    state: 'Gujarat',
    currencySymbol: '₹',
    currencyCode: 'INR',
    financialYear: '2025-26',
    logoUrl: '',
    useSeparateQtyColumns: false,
    enableGst: true,
    enableDiscount: true,
    enableGodowns: true,
    enableBatches: true,
    enableCostCenters: true,
    enablePayroll: false,
    enablePosInvoice: false,
    enableBOM: false,
    useSecurity: false,
    securityUsername: '',
    securityPassword: '',
    voucherSettings: {
      Sales: { prefix: 'SAL/', suffix: '', padding: 3, startingNumber: 1 },
      Purchase: { prefix: 'PUR/', suffix: '', padding: 3, startingNumber: 1 },
      Payment: { prefix: 'PAY/', suffix: '', padding: 3, startingNumber: 1 },
      Receipt: { prefix: 'REC/', suffix: '', padding: 3, startingNumber: 1 },
      Journal: { prefix: 'JRN/', suffix: '', padding: 3, startingNumber: 1 },
      Contra: { prefix: 'CON/', suffix: '', padding: 3, startingNumber: 1 },
      'Credit Note': { prefix: 'SR/', suffix: '', padding: 3, startingNumber: 1 },
      'Debit Note': { prefix: 'PR/', suffix: '', padding: 3, startingNumber: 1 }
    }
  };

  const [formData, setFormData] = useState<any>(initialCompanyState);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        toast.error('Logo file size should be less than 500KB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    const curr = getCountryCurrency(company.country);
    const taxInfo = getCountryTaxInfo(company.country);
    setFormData({
      ...company,
      currencySymbol: company.currencySymbol || curr.symbol,
      currencyCode: company.currencyCode || curr.code,
      taxType: company.taxType || taxInfo.taxType,
      taxName: company.taxName || taxInfo.taxName,
      taxLabel: company.taxLabel || taxInfo.taxLabel,
      defaultTaxRate: company.defaultTaxRate !== undefined ? company.defaultTaxRate : taxInfo.defaultTaxRate
    });
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingCompany(null);
    const taxInfo = getCountryTaxInfo('India');
    setFormData({
      ...initialCompanyState,
      taxType: taxInfo.taxType,
      taxName: taxInfo.taxName,
      taxLabel: taxInfo.taxLabel,
      defaultTaxRate: taxInfo.defaultTaxRate
    });
    setShowForm(true);
  };

  const handleDelete = async (company: Company) => {
    if (!company.id) return;
    const uid = authService.getUser()?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      // Delete associated data (ledgers, products, vouchers, godowns, costCenters, costCategories)
      const collections = ['ledgers', 'products', 'vouchers', 'godowns', 'costCenters', 'costCategories'];
      const batchOps: any[] = [
        { type: 'delete', collection: 'companies', id: company.id }
      ];

      for (const colName of collections) {
        const docs = await dataService.getDocuments(colName, [
          { field: 'companyId', operator: '==', value: company.id }
        ]);
        docs.forEach((d) => {
          if (d.id) {
            batchOps.push({ type: 'delete', collection: colName, id: d.id });
          }
        });
      }

      await dataService.batchWrite(batchOps);
      setDeletingCompany(null);
      toast.success('Company deleted successfully');
      
      // If the deleted company was the active one, select another or clear
      if (activeCompany?.id === company.id) {
        const remaining = companies.filter(c => c.id !== company.id);
        if (remaining.length > 0) {
          setActiveCompany(remaining[0]);
        } else {
          setActiveCompany(null);
        }
      }
      
      refreshCompanies();
    } catch (error: any) {
      console.error('Error deleting company:', error);
      toast.error('Failed to delete company: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = authService.getUser()?.uid;
    if (!uid) return;

    const trimmedName = formData.name?.trim().toLowerCase();
    if (!trimmedName) {
      toast.error('Company name cannot be empty');
      return;
    }

    const duplicateExists = companies.some(
      c => c.name.trim().toLowerCase() === trimmedName && c.id !== editingCompany?.id
    );

    if (duplicateExists) {
      toast.error(`A company with the name '${formData.name}' already exists!`);
      return;
    }

    const baseData = { ...formData };
    if (!baseData.useSecurity) {
      baseData.securityUsername = '';
      baseData.securityPassword = '';
    }

    setSaving(true);
    try {
      if (editingCompany?.id) {
        await dataService.updateDocument('companies', editingCompany.id, {
          ...baseData,
          updatedAt: new Date().toISOString()
        });
        
        // Update active state if current edited company is active
        if (activeCompany?.id === editingCompany.id) {
          setActiveCompany({
            ...editingCompany,
            ...baseData,
          });
        }
      } else {
        const res = await dataService.addDocument('companies', {
          ...baseData,
          createdBy: uid,
          createdAt: new Date().toISOString()
        });
        const newCompanyId = res.id;

        // Initialize default cash, pl, purchase, sales, cgst, sgst, igst ledgers
        const cashId = `default_cash_${newCompanyId}`;
        const plId = `default_pl_${newCompanyId}`;
        const purchaseId = `default_purchase_${newCompanyId}`;
        const salesId = `default_sales_${newCompanyId}`;
        const cgstId = `default_cgst_${newCompanyId}`;
        const sgstId = `default_sgst_${newCompanyId}`;
        const igstId = `default_igst_${newCompanyId}`;

        const effectiveTaxType = formData.taxType || getCountryTaxInfo(formData.country).taxType;
        const initialLedgers: any[] = [
          {
            type: 'set',
            collection: 'ledgers',
            id: cashId,
            data: {
              name: 'Cash',
              group: 'Cash-in-Hand',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: plId,
            data: {
              name: 'Profit & Loss A/c',
              group: 'Reserves & Surplus',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: purchaseId,
            data: {
              name: 'Purchase A/c',
              group: 'Purchase Accounts',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: salesId,
            data: {
              name: 'Sales A/c',
              group: 'Sales Accounts',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: cgstId,
            data: {
              name: 'CGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: sgstId,
            data: {
              name: 'SGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          },
          {
            type: 'set',
            collection: 'ledgers',
            id: igstId,
            data: {
              name: 'IGST',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          }
        ];

        if (effectiveTaxType === 'VAT') {
          initialLedgers.push(
            {
              type: 'set',
              collection: 'ledgers',
              id: `default_vat_${newCompanyId}`,
              data: {
                name: 'VAT / Tax Payable',
                group: 'Duties & Taxes',
                openingBalance: 0,
                currentBalance: 0,
                companyId: newCompanyId,
                createdBy: uid,
                createdAt: new Date().toISOString()
              }
            },
            {
              type: 'set',
              collection: 'ledgers',
              id: `default_vat_input_${newCompanyId}`,
              data: {
                name: 'VAT Input A/c',
                group: 'Duties & Taxes',
                openingBalance: 0,
                currentBalance: 0,
                companyId: newCompanyId,
                createdBy: uid,
                createdAt: new Date().toISOString()
              }
            }
          );
        } else if (effectiveTaxType === 'Sales Tax') {
          initialLedgers.push({
            type: 'set',
            collection: 'ledgers',
            id: `default_salestax_${newCompanyId}`,
            data: {
              name: 'Sales Tax Payable',
              group: 'Duties & Taxes',
              openingBalance: 0,
              currentBalance: 0,
              companyId: newCompanyId,
              createdBy: uid,
              createdAt: new Date().toISOString()
            }
          });
        }

        await dataService.batchWrite(initialLedgers);
        
        // Auto-select newly created company
        const newComp: Company = {
          id: newCompanyId,
          ...formData,
          createdBy: uid,
          createdAt: new Date().toISOString()
        };
        setActiveCompany(newComp);
      }
      
      toast.success(editingCompany ? 'Company updated successfully!' : 'Company created successfully!');
      setShowForm(false);
      refreshCompanies();
    } catch (error: any) {
      console.error('Error saving company:', error);
      toast.error('Failed to save company details: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async (companyId: string, companyName: string) => {
    const uid = authService.getUser()?.uid;
    if (!uid) return;

    try {
      // Collections to backup
      const collections = ['ledgers', 'products', 'vouchers', 'godowns', 'costCenters', 'costCategories'];
      const targetCompany = companies.find(c => c.id === companyId);
      const backupData: any = { company: targetCompany };

      for (const colName of collections) {
        const docs = await dataService.getDocuments(colName, [
          { field: 'companyId', operator: '==', value: companyId }
        ]);
        backupData[colName] = docs;
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${companyName.replace(/\s+/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded for ' + companyName);
    } catch (error: any) {
      console.error('Backup error:', error);
      toast.error('Failed to create backup: ' + error.message);
    }
  };

  const handleRestore = async (file: File, targetCompanyId?: string | null) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target?.result as string);
        const uid = authService.getUser()?.uid;
        if (!uid) return;

        setSaving(true);

        let companyId = targetCompanyId || backupData.company?.id;
        
        if (!targetCompanyId && backupData.company) {
          const { id, ...cData } = backupData.company;
          if (id) {
            await dataService.setDocument('companies', id, { ...cData, createdBy: uid, updatedAt: new Date().toISOString() });
            companyId = id;
          } else {
            const newDoc = await dataService.addDocument('companies', { ...cData, createdBy: uid, createdAt: new Date().toISOString() });
            companyId = newDoc.id;
          }
        }

        if (!companyId) throw new Error('No company context found in backup file');

        // Restore list of collections
        const collections = ['ledgers', 'products', 'vouchers', 'godowns', 'costCenters', 'costCategories'];
        const batchOps: any[] = [];
        for (const colName of collections) {
          if (backupData[colName] && Array.isArray(backupData[colName])) {
            for (const item of backupData[colName]) {
              const { id, ...data } = item;
              if (id) {
                batchOps.push({
                  type: 'set',
                  collection: colName,
                  id,
                  data: { ...data, createdBy: uid, companyId }
                });
              }
            }
          }
        }

        if (batchOps.length > 0) {
          await dataService.batchWrite(batchOps);
        }

        toast.success('Data restored successfully!');
        refreshCompanies();
        
        // Auto-select the restored company
        const restoredCompany = await dataService.getDocument<Company>('companies', companyId);
        if (restoredCompany) {
          setActiveCompany(restoredCompany);
        }

        setTimeout(() => window.location.reload(), 1200);
      } catch (error: any) {
        console.error('Restore error:', error);
        toast.error('Failed to restore backup: ' + error.message);
      } finally {
        setSaving(false);
        setShowRestoreConfirm(null);
      }
    };
    reader.readAsText(file);
  };

  const triggerRestore = (companyId?: string) => {
    setRestoringToCompanyId(companyId || null);
    fileInputRef.current?.click();
  };

  const handleCompanySelect = (company: Company) => {
    if (company.useSecurity) {
      setSecurityCheckCompany(company);
      setSecurityInput({ username: '', password: '' });
    } else {
      setActiveCompany(company);
    }
  };

  const verifySecurity = () => {
    if (!securityCheckCompany) return;
    
    if (securityInput.username === securityCheckCompany.securityUsername && 
        securityInput.password === securityCheckCompany.securityPassword) {
      setActiveCompany(securityCheckCompany);
      setSecurityCheckCompany(null);
      toast.success(`Access granted to ${securityCheckCompany.name}`);
    } else {
      toast.error('Invalid username or password');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 font-mono text-[#002f3c] bg-[#fafcfd] p-4">
      {/* Security Check Modal */}
      {securityCheckCompany && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#fdfcf0] border-2 border-[#146e85] max-w-md w-full p-6 shadow-xl rounded-none font-mono">
            <div className="flex items-center space-x-3 text-[#146e85] mb-4 uppercase text-sm font-black">
              <Lock size={18} className="text-[#146e85]" />
              <h3>Company Vault Access</h3>
            </div>
            
            <p className="text-xs text-gray-700 mb-4 font-bold">
              Company: {securityCheckCompany.name}
            </p>

            <div className="space-y-4 mb-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">User Name</label>
                <input
                  type="text"
                  autoFocus
                  value={securityInput.username}
                  onChange={(e) => setSecurityInput({ ...securityInput, username: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Password</label>
                <input
                  type="password"
                  value={securityInput.password}
                  onChange={(e) => setSecurityInput({ ...securityInput, password: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && verifySecurity()}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setSecurityCheckCompany(null)}
                className="flex-1 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-none uppercase transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={verifySecurity}
                className="flex-1 px-4 py-2 bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] border border-[#002f3c]/20 font-bold text-xs rounded-none uppercase transition-colors"
              >
                Access Company
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setShowRestoreConfirm({ file, targetId: restoringToCompanyId });
          }
          e.target.value = '';
        }}
      />

      {/* Restore Confirmation */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#fdfcf0] border-2 border-[#004d5a] max-w-md w-full p-6 shadow-xl rounded-none font-mono">
            <div className="flex items-center space-x-3 text-amber-700 mb-4 uppercase">
              <AlertCircle size={18} />
              <h3 className="text-sm font-black">Restore Backup Data?</h3>
            </div>
            
            <p className="text-xs text-gray-700 mb-6 leading-relaxed">
              {showRestoreConfirm.targetId 
                ? 'Warning: This will overwrite ledgers, inventory, and voucher details of the selected company from the backup file.' 
                : 'Warning: This will create a new company or update the existing company containing all stored records included in the backup.'}
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowRestoreConfirm(null)}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-[#003c46]/30 bg-[#003c46] hover:bg-[#002f3c] text-[#ffcb2b] font-bold text-xs rounded-none uppercase transition-colors"
              >
                No, Cancel
              </button>
              <button
                onClick={() => handleRestore(showRestoreConfirm.file, showRestoreConfirm.targetId)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#ffcb2b] hover:bg-[#ffd54f] text-[#002f3c] border border-[#002f3c]/20 font-bold text-xs rounded-none uppercase transition-colors"
              >
                {saving ? 'Restoring...' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingCompany && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#fdfcf0] border-2 border-red-800 max-w-md w-full p-6 shadow-xl font-mono">
            <div className="flex items-center space-x-3 text-red-700 mb-4 uppercase">
              <HeartCrack size={22} />
              <h3 className="text-sm font-black">Delete Company Permanently?</h3>
            </div>
            
            <div className="space-y-3 text-xs leading-relaxed">
              <p>
                Are you absolutely sure you want to delete <span className="font-bold underline text-red-800">"{deletingCompany.name}"</span>?
                This action is irreversible and will delete:
              </p>
              <ul className="list-disc list-inside space-y-1 text-red-700 font-semibold pl-1">
                <li>Company Profile &amp; Preferences</li>
                <li>All Ledgers, Cost Centers &amp; Categories</li>
                <li>All Products &amp; Godowns data</li>
                <li>All Vouchers &amp; Transaction ledger lines</li>
              </ul>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setDeletingCompany(null)}
                disabled={saving}
                className="flex-1 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingCompany)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase flex items-center justify-center space-x-2"
              >
                {saving ? 'Deleting...' : 'Delete Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b-2 border-[#004d5a] pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black uppercase tracking-widest text-[#004d5a] flex items-center gap-2">
            <Building2 className="text-[#ffcb2b]" size={20} />
            Company Hub
          </h1>
          <p className="text-[11px] text-gray-500 font-sans mt-0.5">
            Select, Create, Alter, Backup &amp; Restore companies. Use the side menu's "Company Settings" for active features.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="bg-[#146e85] hover:bg-[#0f5466] text-white px-4 py-2 border border-blue-900 rounded-sm text-xs font-bold tracking-wider transition-all flex items-center gap-1.5 shadow-sm uppercase shrink-0"
          >
            <Plus size={14} />
            <span>Create New Company</span>
          </button>
        )}
      </div>

      {!showForm ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => {
              const isActive = activeCompany?.id === c.id;
              return (
                <div 
                  key={c.id} 
                  className={`border transition-all flex flex-col justify-between ${
                    isActive 
                      ? 'border-[#ffcb2b] bg-[#ffffea] shadow-md ring-1 ring-[#ffcb2b]' 
                      : 'border-slate-200 bg-white hover:border-[#146e85] shadow-sm'
                  }`}
                >
                  <div className="p-4 space-y-3 flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <Building2 size={24} className="text-slate-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{c.name}</h3>
                          <div className="text-[10px] text-slate-500 font-sans flex items-center gap-1.5 mt-0.5">
                            <span>{c.state}, {c.country}</span>
                            <span className="bg-slate-200 text-slate-700 text-[9px] px-1 py-0.2 rounded-xs font-mono font-semibold">
                              {c.taxType || getCountryTaxInfo(c.country).taxType} ({c.defaultTaxRate !== undefined ? c.defaultTaxRate : getCountryTaxInfo(c.country).defaultTaxRate}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {isActive && (
                        <span className="px-2 py-0.5 bg-[#4caf50] text-white text-[9px] font-bold uppercase rounded-sm flex items-center gap-1">
                          <Check size={10} /> Active
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50 p-2 border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-sans block text-[9px]">FY Period</span>
                        <span className="font-bold text-slate-700">{c.financialYear}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-sans block text-[9px]">Currency</span>
                        <span className="font-bold text-teal-800 flex items-center gap-1">
                          <span className="bg-teal-100 px-1 rounded text-[10px]">{c.currencySymbol || getCountryCurrency(c.country).symbol}</span>
                          <span className="text-[10px] text-slate-500">{c.currencyCode || getCountryCurrency(c.country).code}</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-sans block text-[9px] truncate" title={c.taxLabel || getCountryTaxInfo(c.country).taxLabel}>
                          {c.taxLabel || getCountryTaxInfo(c.country).taxLabel}
                        </span>
                        <span className="font-bold text-slate-700 truncate block font-mono" title={c.gstNumber}>
                          {c.gstNumber ? c.gstNumber : (
                            <span className="text-slate-400 font-sans font-normal">Not Set</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#f8fafc] px-3 py-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEdit(c)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit / Alter company"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setDeletingCompany(c)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete / Delete company"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBackup(c.id!, c.name)}
                        className="text-[11px] text-slate-600 hover:text-[#146e85] font-black flex items-center gap-1 border border-slate-200 px-2 py-1 bg-white hover:bg-slate-50"
                        title="Download Backup"
                      >
                        <Download size={11} /> Backup
                      </button>
                      <button
                        onClick={() => triggerRestore(c.id!)}
                        className="text-[11px] text-amber-700 hover:text-amber-800 font-black flex items-center gap-1 border border-amber-200 px-2 py-1 bg-amber-50 hover:bg-amber-100/50"
                        title="Restore Backup to this company"
                      >
                        <Upload size={11} /> Restore
                      </button>
                    </div>
                  </div>

                  {/* Quick Select button if not active */}
                  {!isActive && (
                    <button
                      onClick={() => handleCompanySelect(c)}
                      className="w-full text-center bg-[#d9e8ee] hover:bg-[#c2dce6] text-[#146e85] font-bold text-xs py-1.5 border-t border-slate-200 uppercase transition-colors"
                    >
                      Select Company
                    </button>
                  )}
                </div>
              );
            })}

            {companies.length === 0 && (
              <div className="col-span-full border-2 border-dashed border-slate-200 p-12 text-center bg-white space-y-4">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                  <Building2 size={24} className="text-slate-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">No companies registered</h3>
                  <p className="text-xs text-slate-500 font-sans mt-1">Please create a company to record ledgers, inventory, and vouchers.</p>
                </div>
                <button
                  onClick={handleAddNew}
                  className="bg-[#ffeb3b] text-slate-900 px-4 py-2 text-xs font-bold border border-[#fdd835] hover:bg-[#ffd54f]"
                >
                  Create Company
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm max-w-4xl mx-auto">
          <div className="px-6 py-4 bg-[#f8fafc] border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                {editingCompany ? 'Alter Company Details' : 'Create Company'}
              </h2>
              <p className="text-[11px] text-slate-500 font-sans">Enter the base parameters. Feature switches can be tuned in "Company Settings" from the sidebar.</p>
            </div>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors"
            >
              Back
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 text-xs">
            {/* Logo uploads */}
            <div className="space-y-2">
              <label className="font-bold text-slate-700 uppercase block">Company Logo</label>
              <div className="flex items-center space-x-6 bg-slate-50 p-3 border border-slate-100">
                <div className="relative shrink-0">
                  <div className="w-24 h-24 bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <ImageIcon size={24} className="text-slate-300" />
                    )}
                  </div>
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoUrl: '' })}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-1 rounded-full shadow-md hover:bg-red-700 transition-colors"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Upload size={12} />
                      <span>Upload Logo</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">Max file size: 500KB. Base64 format saved securely.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Building2 size={13} className="text-slate-400" />
                  <span>Company Name *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Munaf Traders Pvt Ltd"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] focus:ring-1 focus:ring-[#146e85] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Globe size={13} className="text-slate-400" />
                  <span>Country *</span>
                </label>
                <select
                  value={formData.country || 'India'}
                  onChange={(e) => {
                    const selectedCountry = e.target.value;
                    const defaultState = getCountryDefaultState(selectedCountry);
                    const curr = getCountryCurrency(selectedCountry);
                    const taxInfo = getCountryTaxInfo(selectedCountry);
                    setFormData({
                      ...formData,
                      country: selectedCountry,
                      state: defaultState,
                      currencySymbol: curr.symbol,
                      currencyCode: curr.code,
                      taxType: taxInfo.taxType,
                      taxName: taxInfo.taxName,
                      taxLabel: taxInfo.taxLabel,
                      defaultTaxRate: taxInfo.defaultTaxRate
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none font-medium"
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" />
                  <span>State / Province *</span>
                  <span className="text-[10px] text-teal-700 font-normal lowercase">({getCountryStates(formData.country).length} states available)</span>
                </label>
                {getCountryStates(formData.country).length > 0 ? (
                  <select
                    value={formData.state || getCountryDefaultState(formData.country)}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none font-medium"
                  >
                    {getCountryStates(formData.country).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Enter state or province..."
                    value={formData.state || ''}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none font-medium"
                  />
                )}
              </div>

              {/* Currency Symbol & Code - Automatically selected based on country */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <span className="text-teal-700 font-bold text-xs">¤</span>
                  <span>Currency Symbol *</span>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">Auto-Detected</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. ₹, $, AED, £"
                    value={formData.currencySymbol || '₹'}
                    onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                    className="w-24 px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none text-center font-bold text-sm bg-slate-50"
                  />
                  <div className="flex-1 flex items-center px-3 py-2 bg-slate-50 border border-slate-200 text-xs text-slate-600 font-mono">
                    <span className="font-semibold text-slate-800 mr-1.5">{formData.currencyCode || getCountryCurrency(formData.country).code}</span>
                    <span className="text-slate-400 text-[11px]">({getCountryCurrency(formData.country).name})</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span>Financial Year (e.g. 2025-26) *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2025-26"
                  value={formData.financialYear || ''}
                  onChange={(e) => setFormData({ ...formData, financialYear: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none"
                />
              </div>

              {/* Automatic Tax System & Registration Details Card */}
              <div className="md:col-span-2 bg-[#f0f8fa] p-3.5 border border-[#146e85]/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#146e85]/15 pb-2">
                  <div className="flex items-center gap-2">
                    <Receipt size={15} className="text-[#146e85]" />
                    <span className="font-bold text-xs uppercase text-slate-800 tracking-wide">
                      Tax System &amp; Registration Details
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 border border-emerald-300">
                      Auto-Detected for {formData.country || 'India'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-[#146e85]">
                    {formData.taxName || getCountryTaxInfo(formData.country).taxName}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Tax System / Type */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                      <span>Tax System</span>
                      <span className="text-[10px] text-teal-700 font-semibold lowercase">type</span>
                    </label>
                    <select
                      value={formData.taxType || getCountryTaxInfo(formData.country).taxType}
                      onChange={(e) => {
                        const newTaxType = e.target.value as any;
                        setFormData({ ...formData, taxType: newTaxType });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 focus:border-[#146e85] outline-none font-bold text-slate-800"
                    >
                      <option value="GST">GST (Goods &amp; Services Tax)</option>
                      <option value="VAT">VAT (Value Added Tax)</option>
                      <option value="Sales Tax">Sales Tax (State / Local)</option>
                      <option value="Tax">Standard Business Tax</option>
                    </select>
                  </div>

                  {/* Tax Registration Number (GSTIN / TRN / VAT / EIN / ABN) */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                      <span className="truncate">{formData.taxLabel || getCountryTaxInfo(formData.country).taxLabel}</span>
                      <span className="text-[10px] text-teal-700 font-semibold lowercase">registration</span>
                    </label>
                    <input
                      type="text"
                      placeholder={getCountryTaxInfo(formData.country).taxPlaceholder}
                      value={formData.gstNumber || ''}
                      onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 focus:border-[#146e85] outline-none font-mono uppercase font-bold text-slate-800 placeholder:normal-case placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  {/* Default Tax Rate (%) & Quick Badges */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                      <span>Default Tax Rate (%)</span>
                      <span className="text-[10px] text-teal-700 font-semibold lowercase">standard</span>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative w-20">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="Rate %"
                          value={formData.defaultTaxRate !== undefined ? formData.defaultTaxRate : getCountryTaxInfo(formData.country).defaultTaxRate}
                          onChange={(e) => setFormData({ ...formData, defaultTaxRate: Number(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 focus:border-[#146e85] outline-none font-bold text-center font-mono"
                        />
                      </div>
                      <div className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5">
                        {getCountryTaxInfo(formData.country).taxRates.map(r => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setFormData({ ...formData, defaultTaxRate: r })}
                            className={`px-2 py-1 text-[10px] font-bold font-mono transition-colors border whitespace-nowrap ${
                              (formData.defaultTaxRate ?? getCountryTaxInfo(formData.country).defaultTaxRate) === r
                                ? 'bg-[#146e85] text-white border-[#146e85] shadow-xs'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {r}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" />
                  <span>Phone Number</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Mail size={13} className="text-slate-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. support@company.com"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" />
                  <span>Company Address</span>
                </label>
                <textarea
                  placeholder="Enter full billing address..."
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none h-16 resize-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-200 mt-4">
              <h4 className="font-black text-xs uppercase tracking-wider mb-2 text-slate-800">
                🔒 Security / Vault
              </h4>
              <p className="text-[11px] text-slate-500 font-sans mb-3">Enable security with username and password to prevent unauthorized access.</p>
              
              <div className="space-y-4">
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={!!formData.useSecurity}
                    onChange={(e) => setFormData({ ...formData, useSecurity: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span className="font-bold">Use Security Control</span>
                </label>

                {formData.useSecurity && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 uppercase block">Name of Administrator</label>
                      <input
                        type="text"
                        required={formData.useSecurity}
                        value={formData.securityUsername || ''}
                        onChange={(e) => setFormData({ ...formData, securityUsername: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-700 uppercase block">Password</label>
                      <input
                        type="password"
                        required={formData.useSecurity}
                        value={formData.securityPassword || ''}
                        onChange={(e) => setFormData({ ...formData, securityPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 focus:border-[#146e85] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-200 mt-4">
              <h4 className="font-black text-xs uppercase tracking-wider mb-2 text-slate-800">
                ⭐ Default Enablement Features
              </h4>
              <p className="text-[11px] text-slate-500 font-sans mb-3">These options initialize the standard configuration toggles, which can be custom turned on/off any time from the "Company Settings" page later.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.enableGst !== false}
                    onChange={(e) => setFormData({ ...formData, enableGst: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Enable {formData.taxType || getCountryTaxInfo(formData.country).taxType || 'GST'} / Tax</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.enableDiscount !== false}
                    onChange={(e) => setFormData({ ...formData, enableDiscount: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Discount Column</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.enableGodowns !== false}
                    onChange={(e) => setFormData({ ...formData, enableGodowns: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Multi Godowns</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.enableBatches !== false}
                    onChange={(e) => setFormData({ ...formData, enableBatches: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Batch detail details</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.enableCostCenters !== false}
                    onChange={(e) => setFormData({ ...formData, enableCostCenters: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Cost Centres</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.useSeparateQtyColumns}
                    onChange={(e) => setFormData({ ...formData, useSeparateQtyColumns: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Actual/Billed Qty</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none" id="company-pos-invoice-toggle">
                  <input
                    type="checkbox"
                    checked={!!formData.enablePosInvoice}
                    onChange={(e) => setFormData({ ...formData, enablePosInvoice: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Enable POS Invoicing</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.enablePayroll}
                    onChange={(e) => setFormData({ ...formData, enablePayroll: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Enable Payroll</span>
                </label>
                <label className="flex items-center space-x-2 bg-white px-3 py-2 border border-slate-100 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!formData.enableBOM}
                    onChange={(e) => setFormData({ ...formData, enableBOM: e.target.checked })}
                    className="h-4 w-4 text-[#146e85]"
                  />
                  <span>Enable Bill of Materials (BOM)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-[#146e85] hover:bg-[#0f5466] text-white px-6 py-2 text-xs font-bold uppercase flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                ) : (
                  <span>{editingCompany ? 'Alter Company' : 'Create Company'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
