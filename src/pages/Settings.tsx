import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dataService, authService } from '../services/dataService';
import { Company } from '../types';
import { 
  Save, Landmark, Tag, Package, Box, Milestone, RefreshCw,
  Sliders, Settings2, SlidersHorizontal, Keyboard, CheckCircle, ShieldAlert,
  Database, HardDrive, Cloud, Download, Upload, ArrowDownToLine, FileSpreadsheet,
  CheckCircle2, AlertTriangle, ShieldCheck, Server
} from 'lucide-react';
import { toast } from 'sonner';
import { useCompany } from '../contexts/CompanyContext';
import { getCountryTaxInfo } from '../constants';

export default function Settings() {
  const { t } = useTranslation();
  const { activeCompany, setActiveCompany, refreshCompanies, isOfflineMode, environment } = useCompany();
  const [saving, setSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [importFirebaseLoading, setImportFirebaseLoading] = useState(false);
  const [lastBackupInfo, setLastBackupInfo] = useState<string | null>(null);
  
  // State for toggles
  const [enableGst, setEnableGst] = useState(true);
  const [gstNumber, setGstNumber] = useState('');
  const [enableDiscount, setEnableDiscount] = useState(true);
  const [enableGodowns, setEnableGodowns] = useState(true);
  const [enableBatches, setEnableBatches] = useState(true);
  const [enableCostCenters, setEnableCostCenters] = useState(true);
  const [enablePayroll, setEnablePayroll] = useState(false);
  const [enablePosInvoice, setEnablePosInvoice] = useState(false);
  const [enableBOM, setEnableBOM] = useState(false);
  const [useSeparateQtyColumns, setUseSeparateQtyColumns] = useState(false);
  const [voucherSettings, setVoucherSettings] = useState<any>({});

  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const firebaseImportFileInputRef = useRef<HTMLInputElement>(null);

  // Sync state with activeCompany
  useEffect(() => {
    if (activeCompany) {
      setEnableGst(activeCompany.enableGst !== false);
      setGstNumber(activeCompany.gstNumber || '');
      setEnableDiscount(activeCompany.enableDiscount !== false);
      setEnableGodowns(activeCompany.enableGodowns !== false);
      setEnableBatches(activeCompany.enableBatches !== false);
      setEnableCostCenters(activeCompany.enableCostCenters !== false);
      setEnablePayroll(!!activeCompany.enablePayroll);
      setEnablePosInvoice(!!activeCompany.enablePosInvoice);
      setEnableBOM(!!activeCompany.enableBOM);
      setUseSeparateQtyColumns(!!activeCompany.useSeparateQtyColumns);
      setVoucherSettings(activeCompany.voucherSettings || {});
    }
  }, [activeCompany]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) {
      toast.error('No active company selected. Please select or create one in the Company Hub.');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        enableGst,
        gstNumber,
        enableDiscount,
        enableGodowns,
        enableBatches,
        enableCostCenters,
        enablePayroll,
        enablePosInvoice,
        enableBOM,
        useSeparateQtyColumns,
        voucherSettings,
        updatedAt: new Date().toISOString()
      };

      await dataService.updateDocument('companies', activeCompany.id, updates);
      
      // Update global context state
      setActiveCompany({
        ...activeCompany,
        ...updates
      });

      toast.success('Company settings updated successfully! Features applied.');
      refreshCompanies();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update company settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Backup SQLite / Cloud Database
  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await dataService.backupDatabase();
      if (res.success && res.dataUrl) {
        const a = document.createElement('a');
        a.href = res.dataUrl;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setLastBackupInfo(`Created: ${res.filename}`);
        toast.success(`Backup created successfully: ${res.filename}`);
      } else {
        throw new Error(res.error || 'Failed to generate backup');
      }
    } catch (err: any) {
      console.error('Backup error:', err);
      toast.error('Backup failed: ' + err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  // Restore SQLite / Cloud Database
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Are you sure you want to restore data from '${file.name}'? Existing matching records will be updated.`)) {
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
      return;
    }

    setRestoreLoading(true);
    try {
      if (file.name.endsWith('.db')) {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const res = await dataService.restoreDatabase(bytes);
        if (res.success) {
          toast.success('Database restored successfully from .db backup!');
          refreshCompanies();
        } else {
          throw new Error(res.error || 'Failed to restore .db file');
        }
      } else {
        const text = await file.text();
        const res = await dataService.restoreDatabase(text);
        if (res.success) {
          toast.success(`Database restored successfully! (${res.count || 0} records processed)`);
          refreshCompanies();
        } else {
          throw new Error(res.error || 'Failed to restore JSON backup');
        }
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      toast.error('Restore failed: ' + err.message);
    } finally {
      setRestoreLoading(false);
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    }
  };

  // Import from Firebase into SQLite
  const handleFirebaseImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFirebaseLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await dataService.importFromFirebase(parsed);
      if (res.success) {
        toast.success(`Successfully imported ${res.importedCount} records from Firebase into local SQLite!`);
        refreshCompanies();
      } else {
        throw new Error(res.error || 'Import error');
      }
    } catch (err: any) {
      console.error('Firebase import error:', err);
      toast.error('Firebase import failed: ' + err.message);
    } finally {
      setImportFirebaseLoading(false);
      if (firebaseImportFileInputRef.current) firebaseImportFileInputRef.current.value = '';
    }
  };

  if (!activeCompany) {
    return (
      <div className="max-w-2xl mx-auto my-12 border-2 border-dashed border-slate-300 p-8 text-center bg-white space-y-4 font-mono text-[#002f3c]">
        <h2 className="text-sm font-black uppercase text-rose-700 flex items-center justify-center gap-1.5 leading-none">
          <ShieldAlert size={18} />
          No Company Selected
        </h2>
        <p className="text-xs text-slate-500 font-sans">
          To manage features, first select or create an active company using the "Company Hub" in the side bar.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-mono text-[#002f3c] bg-[#fafcfd] pb-12">
      
      {/* Header */}
      <div className="border-b-2 border-[#004d5a] pb-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-black uppercase tracking-widest text-[#004d5a] flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[#ffcb2b]" />
            Company Features Settings &amp; Architecture
          </h1>
          <p className="text-[10px] text-gray-500 font-sans mt-0.5">
            Manage features, local backups, SQLite database, and cloud settings for <span className="font-bold underline text-[#146e85]">{activeCompany.name}</span>.
          </p>
        </div>

        {/* Dual Version Storage Badge */}
        <div className="flex items-center space-x-2 bg-white px-3 py-1.5 border border-slate-200 shadow-xs">
          {isOfflineMode ? (
            <>
              <HardDrive size={14} className="text-emerald-600" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-emerald-800 leading-none">Offline Desktop Mode</span>
                <span className="text-[8px] text-slate-500 font-sans mt-0.5">SQLite Local PC Storage</span>
              </div>
            </>
          ) : (
            <>
              <Cloud size={14} className="text-[#146e85]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-[#146e85] leading-none">Online Web Mode</span>
                <span className="text-[8px] text-slate-500 font-sans mt-0.5">Google Firebase Firestore</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION: Dual Architecture & Local SQLite Data Management */}
      <div className="border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2">
          <h2 className="text-xs font-black uppercase text-[#146e85] flex items-center gap-1.5">
            <Database size={15} />
            Data Storage, Backup &amp; SQLite Migration
          </h2>
          <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 font-bold uppercase border border-slate-200">
            {isOfflineMode ? 'Desktop: SQLite .db' : 'Web: Cloud Firestore'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Card 1: Create Backup */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-bold text-slate-800 uppercase flex items-center gap-1.5 text-[11px]">
                <Download size={14} className="text-[#146e85]" />
                Create Timestamped Backup
              </div>
              <p className="text-[10px] text-slate-500 font-sans mt-1">
                Generates a secure snapshot (<code className="bg-slate-200 px-1 py-0.2 text-[9px]">SmartAccounting_Backup_*.db</code>) of all accounts, vouchers, products, and ledgers.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="w-full bg-[#146e85] hover:bg-[#0f5466] text-white py-1.5 px-3 font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {backupLoading ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
              <span>Generate Backup File</span>
            </button>
          </div>

          {/* Card 2: Restore Backup */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-bold text-slate-800 uppercase flex items-center gap-1.5 text-[11px]">
                <Upload size={14} className="text-emerald-700" />
                Restore Backup
              </div>
              <p className="text-[10px] text-slate-500 font-sans mt-1">
                Restore database from an existing <code className="bg-slate-200 px-1 py-0.2 text-[9px]">.db</code> or <code className="bg-slate-200 px-1 py-0.2 text-[9px]">.json</code> file safely.
              </p>
            </div>
            <input
              type="file"
              ref={backupFileInputRef}
              onChange={handleFileRestore}
              accept=".db,.json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backupFileInputRef.current?.click()}
              disabled={restoreLoading}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white py-1.5 px-3 font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {restoreLoading ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />}
              <span>Restore from File</span>
            </button>
          </div>

          {/* Card 3: Import from Firebase */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-bold text-slate-800 uppercase flex items-center gap-1.5 text-[11px]">
                <ArrowDownToLine size={14} className="text-amber-700" />
                Import from Firebase
              </div>
              <p className="text-[10px] text-slate-500 font-sans mt-1">
                Populate local SQLite database with existing Firebase data. Preserves all IDs, vouchers, and accounts without deleting cloud records.
              </p>
            </div>
            <input
              type="file"
              ref={firebaseImportFileInputRef}
              onChange={handleFirebaseImportFile}
              accept=".json"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => firebaseImportFileInputRef.current?.click()}
              disabled={importFirebaseLoading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white py-1.5 px-3 font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {importFirebaseLoading ? <RefreshCw size={12} className="animate-spin" /> : <ArrowDownToLine size={12} />}
              <span>Import Firebase JSON</span>
            </button>
          </div>
        </div>

        {lastBackupInfo && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            <span>{lastBackupInfo}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Column 1: Accounting & Taxation */}
          <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-dashed border-slate-200 pb-1 text-[#146e85] flex items-center gap-1.5">
                <Landmark size={14} />
                Accounting &amp; Taxation
              </h2>

              {/* GST TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableGst"
                  checked={enableGst}
                  onChange={(e) => setEnableGst(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableGst" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable GST / Taxation
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Calculate CGST, SGST, IGST in sales &amp; purchase invoices.
                  </p>
                </div>
              </div>

              {/* GSTIN input */}
              {enableGst && (
                <div className="pl-7 space-y-1 animation-all duration-200">
                  <label className="text-[10px] font-bold uppercase text-slate-500">
                    {activeCompany?.taxLabel || (activeCompany?.country ? getCountryTaxInfo(activeCompany.country).taxLabel : 'GSTIN / Tax Identifier')}
                  </label>
                  <input
                    type="text"
                    placeholder={activeCompany?.country ? getCountryTaxInfo(activeCompany.country).taxPlaceholder : 'e.g. 24ABCDE1234F1Z5'}
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    className="w-full px-2 py-1 text-xs border border-slate-300 focus:border-[#146e85] outline-none font-bold placeholder-slate-300 uppercase font-mono"
                  />
                </div>
              )}

              {/* COST CENTERS TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableCostCenters"
                  checked={enableCostCenters}
                  onChange={(e) => setEnableCostCenters(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableCostCenters" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable Cost Centres
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Allocate expenses and incomes across business departments/cost centers.
                  </p>
                </div>
              </div>

              {/* PAYROLL TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enablePayroll"
                  checked={enablePayroll}
                  onChange={(e) => setEnablePayroll(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enablePayroll" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable Payroll (Salary Management)
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Track dynamic employee records, attendance logs, pay heads &amp; generate monthly payslips.
                  </p>
                </div>
              </div>

              {/* POS INVOICING TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enablePosInvoice"
                  checked={enablePosInvoice}
                  onChange={(e) => setEnablePosInvoice(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enablePosInvoice" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable POS Invoicing
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Activate quick POS billing with multiple payment modes (Cash, Card) and compact thermal receipt layouts.
                  </p>
                </div>
              </div>

              {/* BILL OF MATERIALS (BOM) TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableBOM"
                  checked={enableBOM}
                  onChange={(e) => setEnableBOM(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableBOM" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable Bill of Materials (BOM)
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Create manufacturing recipes (BOM) for finished items, enabling auto-consumption of materials during production journal entries.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 font-sans italic pt-2">
              Updates to Taxation settings will apply immediately to newly added vouchers.
            </div>
          </div>

          {/* Column 2: Inventory & Invoicing */}
          <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-dashed border-slate-200 pb-1 text-[#146e85] flex items-center gap-1.5">
                <Package size={14} />
                Inventory &amp; Invoicing
              </h2>

              {/* DISCOUNT TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableDiscount"
                  checked={enableDiscount}
                  onChange={(e) => setEnableDiscount(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableDiscount" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Use Discount Column in Invoices
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Display item-wise discount percentage input column in item list.
                  </p>
                </div>
              </div>

              {/* GODOWNS TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableGodowns"
                  checked={enableGodowns}
                  onChange={(e) => setEnableGodowns(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableGodowns" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable Multiple Godowns / Locations
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Track item inventories across separate warehouses or godown branches.
                  </p>
                </div>
              </div>

              {/* BATCHES TOGGLE */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="enableBatches"
                  checked={enableBatches}
                  onChange={(e) => setEnableBatches(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="enableBatches" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Enable Batch-wise details (Mfg/Expiry)
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Assign lot/batch numbers and manufacturing details to your inventory storage.
                  </p>
                </div>
              </div>

              {/* SEPARATE BILL-ACTUAL COLUMNS */}
              <div className="flex items-start space-x-3 bg-slate-50 p-2.5 border border-slate-100">
                <input
                  type="checkbox"
                  id="useSeparateQtyColumns"
                  checked={useSeparateQtyColumns}
                  onChange={(e) => setUseSeparateQtyColumns(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-[#146e85] border-slate-300 focus:ring-[#146e85]"
                />
                <div className="space-y-0.5">
                  <label htmlFor="useSeparateQtyColumns" className="font-bold text-xs cursor-pointer select-none text-slate-800">
                    Use Separate Actual &amp; Billed Quantities
                  </label>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Allows shipping distinct actual items quantities while billing a formatted subset.
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Voucher Settings Box */}
        <div className="border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase text-[#146e85] border-b border-dashed border-slate-200 pb-1 flex items-center gap-1.5">
            <Settings2 size={14} />
            Voucher Automatic Numbering Prefix Settings
          </h2>
          <p className="text-[10px] text-slate-500 font-sans">
            Define unique series formats for transaction numbers. Prefix length can be padded, e.g. padding of 3 yields 001, 002.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {Object.keys(voucherSettings).map((type) => (
              <div key={type} className="p-3 bg-slate-50 border border-slate-100 space-y-2">
                <div className="font-bold text-slate-800 text-[11px] uppercase truncate border-b border-slate-200/60 pb-1">{type}</div>
                <div className="grid grid-cols-3 gap-1">
                  <div className="col-span-2">
                    <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Prefix</label>
                    <input
                      type="text"
                      value={voucherSettings[type].prefix || ''}
                      onChange={(e) => {
                        const next = { ...voucherSettings };
                        next[type] = { ...next[type], prefix: e.target.value };
                        setVoucherSettings(next);
                      }}
                      className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 focus:border-[#146e85] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Pad</label>
                    <input
                      type="number"
                      value={voucherSettings[type].padding || 0}
                      onChange={(e) => {
                        const next = { ...voucherSettings };
                        next[type] = { ...next[type], padding: Number(e.target.value) };
                        setVoucherSettings(next);
                      }}
                      className="w-full px-1.5 py-0.5 text-xs bg-white border border-slate-300 focus:border-[#146e85] outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#146e85] hover:bg-[#0f5466] text-white px-8 py-2.5 font-bold uppercase transition-colors shrink-0 shadow-sm border border-blue-900 text-xs tracking-wider flex items-center justify-center space-x-2 cursor-pointer"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Save size={14} />
                <span>Save configuration changes</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
