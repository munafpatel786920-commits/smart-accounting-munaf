import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { updateBalances, calculateLedgerBalances, calculateGodownStock } from '../lib/voucherUtils';
import { Voucher, Ledger, Product, VoucherTemplate, Godown, CostCenter, CostCategory } from '../types';
import { formatCurrency as formatCurrencyUtil, formatBalance as formatBalanceUtil } from '../lib/utils';
import { TALLY_GROUPS, getGroupCategory, getCountryCurrency, getCountryTaxInfo } from '../constants';
import { Plus, Search, FileText, X, Calculator, Printer, Download, Edit2, Trash2, Trash, AlertCircle, AlertTriangle, CheckCircle2, Copy, Save, Sparkles, Loader2, ShoppingBag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import * as XLSX from 'xlsx';
import VoucherPrint from '../components/VoucherPrint';
import ShortcutBar from '../components/ShortcutBar';
import { useCompany } from '../contexts/CompanyContext';
import { dataService, authService } from '../services/dataService';
import { getNarrationSuggestions } from '../services/geminiService';

const getLocalDateString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
};

const FLATTENED_OTHER_VOUCHERS = [
  { type: 'Credit Note', category: 'Accounting Vouchers', shortcut: 'Alt+F6', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Debit Note', category: 'Accounting Vouchers', shortcut: 'Alt+F5', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Stock Journal', category: 'Inventory Vouchers', shortcut: 'Alt+F7', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0, godownId: '', destinationGodownId: '' }] },
  { type: 'Manufacturing Journal', category: 'Inventory Vouchers', shortcut: 'Alt+M', mode: 'Invoice', items: [] },
  { type: 'Delivery Note', category: 'Inventory Vouchers', shortcut: 'Alt+F8', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Receipt Note', category: 'Inventory Vouchers', shortcut: 'Alt+F9', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Rejection In', category: 'Inventory Vouchers', shortcut: 'Ctrl+F6', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Rejection Out', category: 'Inventory Vouchers', shortcut: 'Alt+F6', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Sales Order', category: 'Order Vouchers', shortcut: 'Ctrl+F8', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] },
  { type: 'Purchase Order', category: 'Order Vouchers', shortcut: 'Ctrl+F9', mode: 'Invoice', items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }
];

export default function Vouchers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeCompany } = useCompany();
  const currencySymbol = activeCompany?.currencySymbol || getCountryCurrency(activeCompany?.country).symbol;
  const companyTaxInfo = useMemo(() => getCountryTaxInfo(activeCompany?.country), [activeCompany?.country]);
  const defaultTaxType = (activeCompany?.taxType || companyTaxInfo.taxType) as any;
  const defaultTaxRate = activeCompany?.defaultTaxRate !== undefined ? activeCompany.defaultTaxRate : companyTaxInfo.defaultTaxRate;
  const formatCurrency = (amount: number) => formatCurrencyUtil(amount, currencySymbol);
  const formatBalance = (amount: number) => formatBalanceUtil(amount, currencySymbol);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const ledgerBalances = calculateLedgerBalances(ledgers, vouchers);
  const [error, setError] = useState<string | null>(null);
  const [isQuickLedgerModalOpen, setIsQuickLedgerModalOpen] = useState(false);
  const [isQuickProductModalOpen, setIsQuickProductModalOpen] = useState(false);
  const [quickLedgerTarget, setQuickLedgerTarget] = useState<'ledgerId' | 'debitLedgerId' | 'creditLedgerId' | 'salesPurchaseLedgerId' | 'additionalCharge' | null>(null);
  const [quickProductTargetIndex, setQuickProductTargetIndex] = useState<number | null>(null);
  const [quickLedgerTargetIndex, setQuickLedgerTargetIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isQuickLedgerModalOpen) {
      setQuickLedgerTarget(null);
      setQuickLedgerTargetIndex(null);
    }
  }, [isQuickLedgerModalOpen]);
  const [searchTerm, setSearchTerm] = useState('');
  const [posSearchTerm, setPosSearchTerm] = useState('');

  const handlePosAddProduct = (product: Product) => {
    const currentItems = [...(formData.items || [])];
    const existingIndex = currentItems.findIndex((i: any) => i.productId === product.id);
    
    if (existingIndex >= 0) {
      const item = { ...currentItems[existingIndex] };
      const newQty = (item.quantity !== undefined ? item.quantity : 0) + 1;
      item.quantity = newQty;
      item.actualQuantity = newQty;
      item.billedQuantity = newQty;
      item.amount = Number((newQty * (item.rate || 0) * (1 - (item.discount || 0) / 100)).toFixed(2));
      currentItems[existingIndex] = item;
    } else {
      const newQty = 1;
      const rate = product.salesPrice || 0;
      currentItems.push({
        productId: product.id,
        productName: product.name,
        quantity: newQty,
        actualQuantity: newQty,
        billedQuantity: newQty,
        rate,
        discount: 0,
        amount: Number((newQty * rate).toFixed(2))
      });
    }
    
    const filteredItems = currentItems.filter((i: any) => i.productId !== '');
    setFormData((prev: any) => ({
      ...prev,
      items: filteredItems.length > 0 ? filteredItems : [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
    }));
  };

  const handlePosAdjustQuantity = (index: number, delta: number) => {
    const currentItems = [...(formData.items || [])];
    const item = { ...currentItems[index] };
    if (!item.productId) return;
    
    const newQty = Math.max(1, (item.quantity !== undefined ? item.quantity : 0) + delta);
    item.quantity = newQty;
    item.actualQuantity = newQty;
    item.billedQuantity = newQty;
    item.amount = Number((newQty * (item.rate || 0) * (1 - (item.discount || 0) / 100)).toFixed(2));
    
    currentItems[index] = item;
    setFormData((prev: any) => ({ ...prev, items: currentItems }));
  };
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState<{ index: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState<Voucher | null>(null);
  const [isChangeModeModalOpen, setIsChangeModeModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'entry' | 'list'>('entry');
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  const [isOtherVouchersOpen, setIsOtherVouchersOpen] = useState(false);
  const [otherVoucherSearch, setOtherVoucherSearch] = useState('');
  const [selectedOtherIdx, setSelectedOtherIdx] = useState(0);

  const filteredOtherList = FLATTENED_OTHER_VOUCHERS.filter(v => {
    if (v.type === 'Manufacturing Journal' && !activeCompany?.enableBOM) return false;
    return v.type.toLowerCase().includes(otherVoucherSearch.toLowerCase()) ||
           v.category.toLowerCase().includes(otherVoucherSearch.toLowerCase());
  });

  useEffect(() => {
    setSelectedOtherIdx(0);
  }, [otherVoucherSearch]);

  const otherSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOtherVouchersOpen) {
      setTimeout(() => {
        otherSearchInputRef.current?.focus();
      }, 50);
    }
  }, [isOtherVouchersOpen]);

  const firstInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode === 'entry') {
      setTimeout(() => {
        const el = document.querySelector('[data-tally-field="date"]') as HTMLElement;
        if (el) {
          el.focus();
        } else {
          firstInputRef.current?.focus();
        }
      }, 100);
    } else {
      containerRef.current?.focus();
    }
  }, [viewMode]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const isInsideModal = target.closest('.modal-content');
      
      if (!isInput && !isInsideModal && viewMode === 'list') {
        containerRef.current?.focus();
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [viewMode]);

  const filteredVouchers = vouchers.filter(v => 
    v.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [quickLedgerData, setQuickLedgerData] = useState<Partial<Ledger>>({
    name: '',
    group: 'Current Assets',
    openingBalance: 0,
    currentBalance: 0
  });

  const [quickProductData, setQuickProductData] = useState<Partial<Product>>({
    name: '',
    hsnCode: '',
    unit: 'PCS',
    openingStock: 0,
    stockQuantity: 0,
    purchasePrice: 0,
    salesPrice: 0,
    gstRate: 18,
    decimalPlaces: 0
  });

  const [formData, setFormData] = useState<Partial<Voucher>>({
    type: 'Sales',
    mode: 'Invoice',
    status: 'Regular',
    date: getLocalDateString(),
    voucherNumber: '',
    ledgerId: '',
    salesPurchaseLedgerId: '',
    debitLedgerId: '',
    creditLedgerId: '',
    amount: 0,
    gstRate: 18,
    withTax: true,
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalAmount: 0,
    narration: '',
    items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }],
    isInterState: false
  } as any);

  const getNextVoucherNumber = useCallback((type: string) => {
    const typeVouchers = vouchers.filter(v => v.type === type);
    const settings = activeCompany?.voucherSettings?.[type] || { startingNumber: 1, padding: 0, prefix: '', suffix: '' };
    
    let nextNum = settings.startingNumber || 1;
    
    if (typeVouchers.length > 0) {
      const numbers = typeVouchers
        .map(v => {
          let numStr = v.voucherNumber;
          if (settings.prefix && numStr.startsWith(settings.prefix)) {
            numStr = numStr.substring(settings.prefix.length);
          }
          if (settings.suffix && numStr.endsWith(settings.suffix)) {
            numStr = numStr.substring(0, numStr.length - settings.suffix.length);
          }
          const num = parseInt(numStr);
          return isNaN(num) ? 0 : num;
        })
        .filter(n => n > 0);
      
      if (numbers.length > 0) {
        nextNum = Math.max(...numbers) + 1;
      }
    }

    let finalNum = nextNum.toString();
    if (settings.padding && settings.padding > 0) {
      finalNum = finalNum.padStart(settings.padding, '0');
    }
    
    return `${settings.prefix || ''}${finalNum}${settings.suffix || ''}`;
  }, [vouchers, activeCompany?.voucherSettings]);

  const applyVoucherType = useCallback((targetType: Voucher['type']) => {
    let mode: Voucher['mode'] = 'Normal';
    let defaultItems: any[] = [{ ledgerId: '', amount: 0 }];

    if (targetType === 'Journal') {
      mode = 'Double Entry';
      defaultItems = [{ ledgerId: '', amount: 0, type: 'Dr' }];
    } else if (['Sales', 'Purchase', 'Credit Note', 'Debit Note', 'Sales Order', 'Purchase Order', 'Delivery Note', 'Receipt Note', 'Rejection In', 'Rejection Out'].includes(targetType)) {
      mode = 'Invoice';
      defaultItems = [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }];
    } else if (targetType === 'Stock Journal') {
      mode = 'Invoice';
      defaultItems = [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0, godownId: '', destinationGodownId: '' }];
    } else if (targetType === 'Manufacturing Journal') {
      mode = 'Invoice';
      defaultItems = [];
    }

    const isPurchase = ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(targetType);
    const isSales = ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(targetType);
    let defaultLedger = '';
    if (isPurchase) {
      const found = ledgers.find(l => {
        const g = (l.group || '').trim().toLowerCase();
        const n = (l.name || '').trim().toLowerCase();
        return g === 'purchase accounts' || g === 'purchase account' || g === 'purchase' || g === 'purchases' || n.includes('purchase');
      });
      if (found) defaultLedger = found.id || '';
    } else if (isSales) {
      const found = ledgers.find(l => {
        const g = (l.group || '').trim().toLowerCase();
        const n = (l.name || '').trim().toLowerCase();
        return g === 'sales accounts' || g === 'sales account' || g === 'sales' || n.includes('sales');
      });
      if (found) defaultLedger = found.id || '';
    }

    setFormData({
      type: targetType,
      mode,
      status: 'Regular',
      date: getLocalDateString(),
      voucherNumber: getNextVoucherNumber(targetType),
      ledgerId: '',
      salesPurchaseLedgerId: defaultLedger,
      debitLedgerId: '',
      creditLedgerId: '',
      amount: 0,
      taxType: defaultTaxType,
      gstRate: defaultTaxRate,
      withTax: true,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalAmount: 0,
      narration: '',
      items: defaultItems,
      isInterState: false
    } as any);
    setIsEditing(false);
    setEditingId(null);
    setViewMode('entry');
    setIsOtherVouchersOpen(false);
  }, [getNextVoucherNumber, ledgers, defaultTaxRate, defaultTaxType]);

  useEffect(() => {
    if (location.state) {
      const state = location.state as { defaultType?: Voucher['type']; openOtherVouchers?: boolean; viewMode?: 'entry' | 'list' };
      if (state.openOtherVouchers) {
        setIsOtherVouchersOpen(true);
        setViewMode('entry');
        setIsEditing(false);
        setEditingId(null);
      } else if (state.defaultType) {
        applyVoucherType(state.defaultType);
      }
      if (state.viewMode) {
        setViewMode(state.viewMode);
      }
    }
  }, [location.key, location.state, applyVoucherType]);

  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  const getTallyFieldSequence = () => {
    const seq = [
      'date',
      'ledgerId',
    ];

    if (['Sales Order', 'Purchase Order'].includes(formData.type)) {
      seq.push('orderNumber');
    }
    if (['Delivery Note', 'Receipt Note', 'Sales', 'Purchase', 'Rejection In', 'Rejection Out'].includes(formData.type) && formData.mode === 'Invoice') {
      seq.push('referenceOrderNo');
    }

    if (formData.mode === 'Invoice' && (formData.type === 'Sales' || formData.type === 'Purchase' || formData.type === 'Sales Order' || formData.type === 'Purchase Order' || formData.type === 'Delivery Note' || formData.type === 'Receipt Note' || formData.type === 'Rejection In' || formData.type === 'Rejection Out')) {
      seq.push('salesPurchaseLedgerId');
    }

    (formData.items || []).forEach((_, idx) => {
      if (formData.mode === 'Double Entry') {
        seq.push(`item-type-${idx}`);
      }
      seq.push(`item-name-${idx}`);
      if (formData.mode === 'Invoice') {
        const localShowSeparateQty = formData.useSeparateQtyColumns !== undefined ? formData.useSeparateQtyColumns : !!activeCompany?.useSeparateQtyColumns;
        if (localShowSeparateQty) {
          seq.push(`item-actualQty-${idx}`);
          seq.push(`item-billedQty-${idx}`);
        } else {
          seq.push(`item-quantity-${idx}`);
        }
        seq.push(`item-rate-${idx}`);
        seq.push(`item-discount-${idx}`);
      }
      seq.push(`item-amount-${idx}`);
    });

    seq.push('narration');
    seq.push('submit');
    
    return seq;
  };

  useEffect(() => {
    if (focusTarget) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-tally-field="${focusTarget}"]`) as HTMLElement;
        if (el) {
          el.focus();
          if (el instanceof HTMLInputElement) {
            el.select();
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [formData.items?.length, focusTarget]);

  // Calculate totals whenever items or tax settings change
  useEffect(() => {
    let subtotal = 0;
    if (formData.mode === 'Double Entry') {
      subtotal = (formData.items || [])
        .filter(item => item.type === 'Dr')
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    } else {
      subtotal = (formData.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }
    
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let vatAmount = 0;
    let tdsAmount = 0;
    let exciseAmount = 0;
    let serviceTaxAmount = 0;

    const rate = Number(formData.gstRate) === 0 ? 0 : (formData.gstRate !== undefined ? Number(formData.gstRate) : defaultTaxRate);
    const taxType = formData.taxType || defaultTaxType;

    if (activeCompany?.enableGst !== false && formData.withTax && formData.mode !== 'Double Entry') {
      if (taxType === 'GST') {
        if (formData.isInterState) {
          igst = (subtotal * rate) / 100;
        } else {
          cgst = (subtotal * (rate / 2)) / 100;
          sgst = (subtotal * (rate / 2)) / 100;
        }
      } else if (taxType === 'VAT' || taxType === 'Sales Tax' || taxType === 'Tax') {
        vatAmount = (subtotal * rate) / 100;
      } else if (taxType === 'TDS') {
        tdsAmount = (subtotal * rate) / 100;
      } else if (taxType === 'Excise') {
        exciseAmount = (subtotal * rate) / 100;
      } else if (taxType === 'Service Tax') {
        serviceTaxAmount = (subtotal * rate) / 100;
      }
    }

    const totalAmount = subtotal + cgst + sgst + igst + vatAmount - tdsAmount + exciseAmount + serviceTaxAmount;

    setFormData(prev => {
      if (
        prev.totalAmount === totalAmount && 
        prev.cgst === cgst && 
        prev.sgst === sgst && 
        prev.igst === igst && 
        prev.vatAmount === vatAmount &&
        prev.tdsAmount === tdsAmount &&
        prev.exciseAmount === exciseAmount &&
        prev.serviceTaxAmount === serviceTaxAmount &&
        prev.amount === subtotal &&
        prev.taxType === taxType
      ) {
        return prev;
      }
      return {
        ...prev,
        amount: subtotal,
        cgst,
        sgst,
        igst,
        vatAmount,
        tdsAmount,
        exciseAmount,
        serviceTaxAmount,
        totalAmount,
        taxType
      };
    });
  }, [formData.items, formData.withTax, formData.isInterState, formData.gstRate, formData.mode, formData.taxType]);

  // Auto-generate voucher number when type changes
  useEffect(() => {
    if (!isEditing && viewMode === 'entry') {
      const nextNum = getNextVoucherNumber(formData.type || 'Sales');
      if (formData.voucherNumber !== nextNum) {
        setFormData(prev => ({ ...prev, voucherNumber: nextNum }));
      }
    }
  }, [formData.type, viewMode, isEditing, vouchers]);

  const handleEdit = React.useCallback((voucher: Voucher) => {
    setEditingId(voucher.id);
    setIsEditing(true);
    setFormData(voucher);
    setViewMode('entry');
  }, []);

  const handleDelete = React.useCallback((voucher: Voucher) => {
    console.log('handleDelete called for voucher:', voucher.id);
    setVoucherToDelete(voucher);
    setIsDeleteModalOpen(true);
  }, []);

  // Sync form with selection
  useEffect(() => {
    if (viewMode === 'list' && filteredVouchers[selectedIndex] && isEditing) {
      const voucher = filteredVouchers[selectedIndex];
      setEditingId(voucher.id);
      setFormData(voucher);
    }
  }, [selectedIndex, filteredVouchers, isEditing, viewMode]);

  const handleDeleteVoucher = (voucher: Voucher) => {
    setVoucherToDelete(voucher);
    setIsDeleteModalOpen(true);
  };

  const handleCancelVoucher = async (v: Voucher) => {
    if (!v.id) return;
    if (v.status === 'Cancelled') {
      toast.info("Voucher is already cancelled.");
      return;
    }
    if (window.confirm(`Are you sure you want to CANCEL voucher #${v.voucherNumber}? This sets all amounts to 0, preserves the numbering record, and registers status as Cancelled.`)) {
      try {
        const cancelledVoucher = {
          ...v,
          status: 'Cancelled' as any,
          amount: 0,
          totalAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          items: v.items ? v.items.map(item => ({ ...item, amount: 0, quantity: 0, rate: 0 })) : [],
          additionalCharges: v.additionalCharges ? v.additionalCharges.map(charge => ({ ...charge, amount: 0 })) : [],
          narration: `[Cancelled] ${v.narration || ''}`.trim()
        };
        // Subtract old balance
        await updateBalances(db, v, -1);
        await updateDoc(doc(db, 'vouchers', v.id), {
          status: 'Cancelled',
          amount: 0,
          totalAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          items: cancelledVoucher.items,
          additionalCharges: cancelledVoucher.additionalCharges,
          narration: cancelledVoucher.narration,
          updatedAt: new Date().toISOString()
        } as any);
        toast.success("Voucher cancelled successfully.");
        setIsEditing(false);
        setEditingId(null);
        setViewMode('list');
      } catch (err: any) {
        console.error("Error cancelling voucher:", err);
        toast.error("Failed to cancel voucher: " + err.message);
      }
    }
  };

  // Flexible matching for Purchase Ledgers
  const matchingPurchaseLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      return (
        g === 'purchase accounts' ||
        g === 'purchase account' ||
        g === 'purchase' ||
        g === 'purchases' ||
        g.includes('purchase') ||
        n.includes('purchase')
      );
    });
  }, [ledgers]);

  // Other expense ledgers that can be allocated in Purchase
  const otherExpenseLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      const isPurchaseMatch = g === 'purchase accounts' || g === 'purchase account' || g === 'purchase' || g === 'purchases' || g.includes('purchase') || n.includes('purchase');
      if (isPurchaseMatch) return false;
      return g === 'direct expenses' || g === 'indirect expenses' || g.includes('expense');
    });
  }, [ledgers]);

  // Flexible matching for Sales Ledgers
  const matchingSalesLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      return (
        g === 'sales accounts' ||
        g === 'sales account' ||
        g === 'sales' ||
        g.includes('sales') ||
        n.includes('sales')
      );
    });
  }, [ledgers]);

  const otherIncomeLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      const isSalesMatch = g === 'sales accounts' || g === 'sales account' || g === 'sales' || g.includes('sales') || n.includes('sales');
      if (isSalesMatch) return false;
      return g === 'direct incomes' || g === 'indirect incomes' || g.includes('income');
    });
  }, [ledgers]);

  // 1-Click creation of default Purchase Account
  const handleCreateDefaultPurchaseLedger = async () => {
    if (!activeCompany?.id) return;
    const uid = auth.currentUser?.uid || authService.getUser()?.uid || 'user';
    try {
      const newLedger = {
        name: 'Purchase A/c',
        group: 'Purchase Accounts',
        openingBalance: 0,
        currentBalance: 0,
        companyId: activeCompany.id,
        createdBy: uid,
        createdAt: new Date().toISOString()
      };
      const res = await dataService.addDocument('ledgers', newLedger);
      const created = { ...newLedger, id: res.id } as Ledger;
      setLedgers(prev => {
        const exists = prev.some(l => l.id === res.id);
        return exists ? prev : [...prev, created];
      });
      setFormData(prev => ({ ...prev, salesPurchaseLedgerId: res.id }));
      toast.success('Purchase A/c ledger created & selected!');
    } catch (err: any) {
      console.error('Error creating Purchase ledger:', err);
      toast.error('Failed to create Purchase ledger: ' + err.message);
    }
  };

  // 1-Click creation of default Sales Account
  const handleCreateDefaultSalesLedger = async () => {
    if (!activeCompany?.id) return;
    const uid = auth.currentUser?.uid || authService.getUser()?.uid || 'user';
    try {
      const newLedger = {
        name: 'Sales A/c',
        group: 'Sales Accounts',
        openingBalance: 0,
        currentBalance: 0,
        companyId: activeCompany.id,
        createdBy: uid,
        createdAt: new Date().toISOString()
      };
      const res = await dataService.addDocument('ledgers', newLedger);
      const created = { ...newLedger, id: res.id } as Ledger;
      setLedgers(prev => {
        const exists = prev.some(l => l.id === res.id);
        return exists ? prev : [...prev, created];
      });
      setFormData(prev => ({ ...prev, salesPurchaseLedgerId: res.id }));
      toast.success('Sales A/c ledger created & selected!');
    } catch (err: any) {
      console.error('Error creating Sales ledger:', err);
      toast.error('Failed to create Sales ledger: ' + err.message);
    }
  };

  // 1-Click creation of sample stock items if company has no products
  const handleCreateSampleProducts = async () => {
    if (!activeCompany?.id) return;
    const uid = auth.currentUser?.uid || authService.getUser()?.uid || 'user';
    try {
      const samples = [
        { name: 'Stock Item A', unit: 'Pcs', purchasePrice: 500, salesPrice: 750, stockQuantity: 50, openingStock: 50, hsnCode: '8471', gstRate: 18, decimalPlaces: 0 },
        { name: 'Stock Item B', unit: 'Pcs', purchasePrice: 1200, salesPrice: 1600, stockQuantity: 30, openingStock: 30, hsnCode: '8473', gstRate: 18, decimalPlaces: 0 },
        { name: 'Raw Material X', unit: 'Kgs', purchasePrice: 150, salesPrice: 200, stockQuantity: 100, openingStock: 100, hsnCode: '2710', gstRate: 18, decimalPlaces: 0 }
      ];

      const createdItems: Product[] = [];
      for (const sample of samples) {
        const productData = {
          ...sample,
          companyId: activeCompany.id,
          createdBy: uid,
          createdAt: new Date().toISOString()
        };
        const res = await dataService.addDocument('products', productData);
        createdItems.push({ ...productData, id: res.id } as Product);
      }

      setProducts(prev => [...prev, ...createdItems]);
      if (createdItems.length > 0) {
        updateItem(0, 'productId', createdItems[0].id);
      }
      toast.success('3 Sample Stock Items banaye gaye aur pehla item select ho gaya!');
    } catch (err: any) {
      console.error('Error creating sample products:', err);
      toast.error('Failed to create sample products: ' + err.message);
    }
  };

  const handleSelectPurchaseVoucher = useCallback(() => {
    const pLedger = matchingPurchaseLedgers[0] || ledgers.find(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      return g === 'purchase accounts' || g === 'purchase account' || g === 'purchase' || g === 'purchases' || n.includes('purchase');
    });

    setFormData(prev => ({
      ...prev,
      type: 'Purchase',
      mode: 'Invoice',
      voucherNumber: getNextVoucherNumber('Purchase'),
      salesPurchaseLedgerId: pLedger ? pLedger.id! : (prev.salesPurchaseLedgerId || ''),
      items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
    }));
  }, [matchingPurchaseLedgers, ledgers, getNextVoucherNumber]);

  const handleSelectSalesVoucher = useCallback(() => {
    const sLedger = matchingSalesLedgers[0] || ledgers.find(l => {
      const g = (l.group || '').trim().toLowerCase();
      const n = (l.name || '').trim().toLowerCase();
      return g === 'sales accounts' || g === 'sales account' || g === 'sales' || n.includes('sales');
    });

    setFormData(prev => ({
      ...prev,
      type: 'Sales',
      mode: 'Invoice',
      voucherNumber: getNextVoucherNumber('Sales'),
      salesPurchaseLedgerId: sLedger ? sLedger.id! : (prev.salesPurchaseLedgerId || ''),
      items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
    }));
  }, [matchingSalesLedgers, ledgers, getNextVoucherNumber]);

  // Auto-select purchase/sales ledger if not set yet
  useEffect(() => {
    const isPurchase = ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string);
    if (isPurchase && !formData.salesPurchaseLedgerId && matchingPurchaseLedgers.length > 0) {
      setFormData(prev => ({
        ...prev,
        salesPurchaseLedgerId: matchingPurchaseLedgers[0].id!
      }));
    }
    const isSales = ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type as string);
    if (isSales && !formData.salesPurchaseLedgerId && matchingSalesLedgers.length > 0) {
      setFormData(prev => ({
        ...prev,
        salesPurchaseLedgerId: matchingSalesLedgers[0].id!
      }));
    }
  }, [formData.type, matchingPurchaseLedgers, matchingSalesLedgers, formData.salesPurchaseLedgerId]);

  const getShortcutItems = () => {
    return [
      { key: 'F2', label: 'Date' },
      { key: 'F4', label: 'Contra' },
      { key: 'F5', label: 'Payment' },
      { key: 'F6', label: 'Receipt' },
      { key: 'F7', label: 'Journal' },
      { key: 'F8', label: 'Sales' },
      { key: 'F9', label: 'Purchase' },
      { key: 'Ctrl+F6', label: 'Rej In' },
      { key: 'Alt+F6', label: 'Rej Out' },
      { key: 'Ctrl+A', label: 'Accept' },
      { key: 'Esc', label: 'Quit' }
    ];
  };

  const confirmDelete = React.useCallback(async () => {
    if (!voucherToDelete) {
      console.warn('confirmDelete called but voucherToDelete is null');
      return;
    }

    console.log('confirmDelete initiated for voucher:', voucherToDelete.id);
    try {
      // Reverse balances
      await updateBalances(db, voucherToDelete, -1);
      // Delete document
      await deleteDoc(doc(db, 'vouchers', voucherToDelete.id));
      console.log('Voucher document deleted successfully');
      setIsDeleteModalOpen(false);
      setVoucherToDelete(null);
      setIsEditing(false);
      setEditingId(null);
      toast.success('Voucher deleted successfully');
    } catch (error: any) {
      console.error('Error deleting voucher:', error);
      if (error.code === 'permission-denied' || error.message?.includes('permission')) {
        const errInfo = {
          error: error.message,
          operationType: 'delete',
          path: `vouchers/${voucherToDelete.id}`,
          authInfo: {
            userId: auth.currentUser?.uid,
            email: auth.currentUser?.email,
          }
        };
        console.error('Firestore Permission Error:', JSON.stringify(errInfo));
        toast.error('Permission denied: You cannot delete this voucher');
      } else {
        toast.error('Failed to delete voucher: ' + (error.message || 'Unknown error'));
      }
    }
  }, [voucherToDelete]);

  // Fetch data
  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribeV = dataService.onSnapshotCollection<Voucher>(
      'vouchers',
      conditions,
      (fetchedVouchers) => {
        fetchedVouchers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setVouchers(fetchedVouchers);
        setError(null);
      },
      (error: any) => {
        const errStr = String(error?.message || error || '');
        if (
          error?.code === 'permission-denied' ||
          errStr.includes('insufficient permissions') ||
          errStr.includes('INTERNAL ASSERTION FAILED') ||
          errStr.includes('ca9') ||
          errStr.includes('b815')
        ) return;
        console.error('Error fetching vouchers:', error);
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
          const match = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
          if (match) {
            setError(`A database index is missing. [Click here to create it](${match[0]})`);
          } else {
            setError('A database index is missing. Please check the browser console for the setup link.');
          }
        } else {
          setError(error.message || 'Failed to load vouchers. Please try again.');
        }
      }
    );

    const unsubscribeL = dataService.onSnapshotCollection<Ledger>(
      'ledgers',
      conditions,
      (fetchedLedgers) => {
        setLedgers(fetchedLedgers);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Error fetching ledgers:', error);
      }
    );

    const unsubscribeP = dataService.onSnapshotCollection<Product>(
      'products',
      conditions,
      (pData) => {
        console.log('Vouchers: Products loaded:', pData.length);
        setProducts(pData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Error fetching products:', error);
      }
    );

    const unsubscribeG = dataService.onSnapshotCollection<Godown>(
      'godowns',
      conditions,
      (fetchedGodowns) => {
        setGodowns(fetchedGodowns);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    const unsubscribeCC = dataService.onSnapshotCollection<CostCenter>(
      'costCenters',
      conditions,
      (fetchedCC) => {
        setCostCenters(fetchedCC);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    const unsubscribeCategories = dataService.onSnapshotCollection<CostCategory>(
      'costCategories',
      conditions,
      (fetchedCat) => {
        setCostCategories(fetchedCat);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    const unsubscribeT = dataService.onSnapshotCollection<VoucherTemplate>(
      'voucher_templates',
      conditions,
      (fetchedTemplates) => {
        setTemplates(fetchedTemplates);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
      }
    );

    return () => {
      unsubscribeV();
      unsubscribeL();
      unsubscribeP();
      unsubscribeG();
      unsubscribeCC();
      unsubscribeCategories();
      unsubscribeT();
    };
  }, [activeCompany?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOtherVouchersOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOtherVouchersOpen(false);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedOtherIdx(prev => Math.min(prev + 1, filteredOtherList.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedOtherIdx(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const target = filteredOtherList[selectedOtherIdx];
          if (target) {
            setFormData(prev => ({
              ...prev,
              type: target.type as any,
              mode: target.mode as any,
              voucherNumber: getNextVoucherNumber(target.type),
              items: target.items
            }));
            setIsOtherVouchersOpen(false);
            setOtherVoucherSearch('');
            setTimeout(() => {
              const el = document.querySelector('[data-tally-field="date"]') as HTMLElement;
              if (el) el.focus();
            }, 100);
          }
          return;
        }
      }

      if (isDeleteModalOpen || isQuickLedgerModalOpen || isQuickProductModalOpen || showPrintPreview) {
        if (e.key === 'Escape') {
          setIsDeleteModalOpen(false);
          setIsQuickLedgerModalOpen(false);
          setIsQuickProductModalOpen(false);
          setShowPrintPreview(false);
        }
        return;
      }

      // View Mode Toggling
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setViewMode('list');
        return;
      }

      if (viewMode === 'list') {
        if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          setViewMode('entry');
          setIsEditing(false);
          setEditingId(null);
          setFormData({
            type: 'Sales',
            mode: 'Invoice',
            date: getLocalDateString(),
            voucherNumber: getNextVoucherNumber('Sales'),
            ledgerId: '',
            salesPurchaseLedgerId: '',
            debitLedgerId: '',
            creditLedgerId: '',
            amount: 0,
            gstRate: 18,
            withTax: true,
            narration: '',
            items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
          } as any);
          return;
        }

        if (e.altKey && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          if (filteredVouchers[selectedIndex]) {
            setPrintingVoucher(filteredVouchers[selectedIndex]);
            setShowPrintPreview(true);
          }
          return;
        }

        if (e.altKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          if (filteredVouchers[selectedIndex]) {
            handleDelete(filteredVouchers[selectedIndex]);
          }
          return;
        }

        if (e.altKey && e.key.toLowerCase() === 'x') {
          e.preventDefault();
          if (filteredVouchers[selectedIndex]) {
            handleCancelVoucher(filteredVouchers[selectedIndex]);
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredVouchers.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (filteredVouchers[selectedIndex]) {
            handleEdit(filteredVouchers[selectedIndex]);
            setViewMode('entry');
          }
        } else if (e.key === 'Escape') {
          navigate('/');
        }
        return;
      }

      // Entry Mode Shortcuts
      const activeElement = document.activeElement;
      const isFormInput = activeElement && 
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'BUTTON') &&
        !activeElement.classList.contains('search-input');

      if (isFormInput) {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const tallyField = (activeElement as HTMLElement).getAttribute('data-tally-field');
          if (tallyField) {
            e.preventDefault();
            const seq = getTallyFieldSequence();
            const currIdx = seq.indexOf(tallyField);

            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              // Standard Enter or Down navigation Special cases
              
              // 1. Special case: empty Item Name jumps straight to narration!
              if (e.key === 'Enter' && tallyField.startsWith('item-name-')) {
                const itemIdx = parseInt(tallyField.split('-')[2]);
                const currentItem = formData.items?.[itemIdx];
                const isFieldEmpty = !currentItem || (formData.mode === 'Invoice' ? !currentItem.productId : !currentItem.ledgerId);
                
                if (isFieldEmpty) {
                  const narrEl = document.querySelector('[data-tally-field="narration"]') as HTMLElement;
                  if (narrEl) {
                    narrEl.focus();
                    return;
                  }
                }
              }

              // 2. Special case: Enter on Amount of the last item row adds a new row and focuses its item-name!
              if (e.key === 'Enter' && tallyField.startsWith('item-amount-')) {
                const itemIdx = parseInt(tallyField.split('-')[2]);
                const isLastRow = itemIdx === (formData.items?.length || 0) - 1;
                const currentItem = formData.items?.[itemIdx];
                const hasItemValue = currentItem && (formData.mode === 'Invoice' ? currentItem.productId : currentItem.ledgerId);
                
                if (isLastRow && hasItemValue) {
                  addItem();
                  setFocusTarget(`item-name-${itemIdx + 1}`);
                  return;
                }
              }

              // Normal flow: focus next field in sequence
              const nextField = seq[currIdx + 1];
              if (nextField) {
                const nextEl = document.querySelector(`[data-tally-field="${nextField}"]`) as HTMLElement;
                if (nextEl) {
                  nextEl.focus();
                  if (nextEl instanceof HTMLInputElement) {
                    nextEl.select();
                  }
                }
              }
            } else if (e.key === 'ArrowUp') {
              const prevField = seq[currIdx - 1];
              if (prevField) {
                const prevEl = document.querySelector(`[data-tally-field="${prevField}"]`) as HTMLElement;
                if (prevEl) {
                  prevEl.focus();
                  if (prevEl instanceof HTMLInputElement) {
                    prevEl.select();
                  }
                }
              }
            }
          } else {
            // Fallback to simple form navigation
            const form = activeElement.closest('form');
            if (form) {
              const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]')) as HTMLElement[];
              const currentIndex = inputs.indexOf(activeElement as HTMLElement);

              if (e.key === 'Enter' || e.key === 'ArrowDown') {
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
        
        if (e.ctrlKey && e.key === 'F6') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Rejection In', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Rejection In'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F6') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Rejection Out', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Rejection Out'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.ctrlKey && e.key === 'F8') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Sales Order', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Sales Order'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.ctrlKey && e.key === 'F9') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Purchase Order', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Purchase Order'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F8') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Delivery Note', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Delivery Note'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F9') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Receipt Note', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Receipt Note'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F6') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Credit Note', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Credit Note'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F5') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Debit Note', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Debit Note'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
          return;
        }

        if (e.altKey && e.key === 'F7') {
          e.preventDefault();
          setFormData(prev => ({ ...prev, type: 'Stock Journal', mode: 'Invoice', voucherNumber: getNextVoucherNumber('Stock Journal'), items: [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0, godownId: '', destinationGodownId: '' }] }));
          return;
        }
        
        // Ensure that Ctrl/Alt + function keys don't fall into the regular switch
        if (!e.ctrlKey && !e.altKey) {
          switch(e.key) {
            case 'F4': e.preventDefault(); setFormData(prev => ({ ...prev, type: 'Contra', mode: 'Normal', voucherNumber: getNextVoucherNumber('Contra'), items: [{ ledgerId: '', amount: 0 }] })); break;
            case 'F5': e.preventDefault(); setFormData(prev => ({ ...prev, type: 'Payment', mode: 'Normal', voucherNumber: getNextVoucherNumber('Payment'), items: [{ ledgerId: '', amount: 0 }] })); break;
            case 'F6': e.preventDefault(); setFormData(prev => ({ ...prev, type: 'Receipt', mode: 'Normal', voucherNumber: getNextVoucherNumber('Receipt'), items: [{ ledgerId: '', amount: 0 }] })); break;
            case 'F7': e.preventDefault(); setFormData(prev => ({ ...prev, type: 'Journal', mode: 'Double Entry', voucherNumber: getNextVoucherNumber('Journal'), items: [{ ledgerId: '', amount: 0, type: 'Dr' }] })); break;
            case 'F8': e.preventDefault(); handleSelectSalesVoucher(); break;
            case 'F9': e.preventDefault(); handleSelectPurchaseVoucher(); break;
            case 'F10': e.preventDefault(); setIsOtherVouchersOpen(prev => !prev); break;
          }
        }

        
        if (e.ctrlKey && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          handleSubmit(new Event('submit') as any);
          return;
        }

        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
          e.preventDefault();
          toggleMode();
          return;
        }

        if (e.altKey && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          const targetField = activeElement?.getAttribute('data-tally-field') || '';
          if (targetField === 'salesPurchaseLedgerId') {
            setQuickLedgerTarget('salesPurchaseLedgerId');
            setQuickLedgerData({
              name: ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? 'Purchase A/c' : 'Sales A/c',
              group: ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? 'Purchase Accounts' : 'Sales Accounts',
              openingBalance: 0,
              currentBalance: 0
            });
            setIsQuickLedgerModalOpen(true);
          } else if (targetField === 'ledgerId') {
            setQuickLedgerTarget('ledgerId');
            setQuickLedgerData({
              name: '',
              group: ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? 'Sundry Creditors' : 'Sundry Debtors',
              openingBalance: 0,
              currentBalance: 0
            });
            setIsQuickLedgerModalOpen(true);
          } else if (formData.mode === 'Invoice') {
            const match = targetField.match(/item-name-(\d+)/);
            const idx = match ? parseInt(match[1]) : (formData.items?.length || 0);
            setQuickProductTargetIndex(idx);
            setQuickProductData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18, decimalPlaces: 0 });
            setIsQuickProductModalOpen(true);
          } else {
            setQuickLedgerTargetIndex(0);
            setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
            setIsQuickLedgerModalOpen(true);
          }
          return;
        }

        if (e.altKey && e.key.toLowerCase() === 'x') {
          e.preventDefault();
          if (isEditing && editingId) {
            const v = vouchers.find(v => v.id === editingId);
            if (v) handleCancelVoucher(v);
          }
          return;
        }

        if (e.key === 'Escape') {
          (activeElement as HTMLElement).blur();
        }
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'h' && viewMode === 'entry') {
        e.preventDefault();
        toggleMode();
        return;
      }

      if (e.key === 'Escape') {
        navigate('/');
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [activeCompany?.id, isDeleteModalOpen, showPrintPreview, filteredVouchers, selectedIndex, formData, navigate, handleDelete, handleEdit, setPrintingVoucher, setShowPrintPreview, setQuickLedgerTarget, setIsQuickLedgerModalOpen, setIsEditing, setEditingId, setFormData, setSelectedIndex, confirmDelete, vouchers, isEditing, editingId, viewMode, isOtherVouchersOpen, selectedOtherIdx, filteredOtherList, otherVoucherSearch]);

  useEffect(() => {
    if (filteredVouchers.length > 0 && selectedIndex >= filteredVouchers.length) {
      setSelectedIndex(filteredVouchers.length - 1);
    } else if (filteredVouchers.length === 0 && selectedIndex !== 0) {
      setSelectedIndex(0);
    }
  }, [filteredVouchers.length, selectedIndex]);

  useEffect(() => {
    if (viewMode === 'list' && !showPrintPreview) {
      const selectedRow = document.getElementById(`row-${selectedIndex}`);
      if (selectedRow) {
        selectedRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, viewMode, showPrintPreview]);

  const prevTypeRef = useRef(formData.type);
  useEffect(() => {
    if (viewMode === 'entry' && !isEditing) {
      if (prevTypeRef.current !== formData.type || !formData.voucherNumber) {
        const nextNum = getNextVoucherNumber(formData.type as string);
        setFormData(prev => ({ ...prev, voucherNumber: nextNum }));
      }
      prevTypeRef.current = formData.type;
    }
  }, [viewMode, isEditing, formData.type, vouchers]);

  const calculateGst = (amount: number, rate: number, isInterState: boolean = false, withTax: boolean = true) => {
    if (!withTax) {
      return { cgst: 0, sgst: 0, igst: 0, total: amount };
    }
    const gst = (amount * rate) / 100;
    if (isInterState) {
      return { cgst: 0, sgst: 0, igst: gst, total: amount + gst };
    } else {
      const cgst = gst / 2;
      const sgst = gst / 2;
      return { cgst, sgst, igst: 0, total: amount + gst };
    }
  };


  const handleSaveTemplate = async () => {
    if (!auth.currentUser || !activeCompany?.id) return;
    const templateName = prompt('Enter a name for this template:');
    if (!templateName) return;

    try {
      const templateData: any = {
        name: templateName,
        type: formData.type,
        mode: formData.mode,
        ledgerId: formData.ledgerId || '',
        salesPurchaseLedgerId: formData.salesPurchaseLedgerId || '',
        debitLedgerId: formData.debitLedgerId || '',
        creditLedgerId: formData.creditLedgerId || '',
        amount: formData.amount || 0,
        gstRate: formData.gstRate || 0,
        withTax: formData.withTax || false,
        narration: formData.narration || '',
        items: formData.items || [],
        companyId: activeCompany.id,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'voucher_templates'), templateData);
      toast.success('Template saved successfully');
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    }
  };

  const handleLoadTemplate = (template: VoucherTemplate) => {
    setFormData(prev => ({
      ...prev,
      type: template.type,
      mode: template.mode,
      ledgerId: template.ledgerId,
      salesPurchaseLedgerId: template.salesPurchaseLedgerId,
      debitLedgerId: template.debitLedgerId,
      creditLedgerId: template.creditLedgerId,
      amount: template.amount,
      gstRate: template.gstRate,
      withTax: template.withTax,
      narration: template.narration,
      items: template.items,
      voucherNumber: getNextVoucherNumber(template.type)
    }));
    toast.success(`Template "${template.name}" loaded`);
  };

  const isBillFulfillingNote = (v: Partial<Voucher>) => {
    if (!v.referenceOrderNo || !['Sales', 'Purchase'].includes(v.type as string)) return false;
    const refVoucher = vouchers.find(prev => 
      (prev.type === 'Delivery Note' || prev.type === 'Receipt Note') && 
      (prev.orderNumber === v.referenceOrderNo || prev.voucherNumber === v.referenceOrderNo || prev.referenceOrderNo === v.referenceOrderNo) &&
      prev.ledgerId === v.ledgerId
    );
    return !!refVoucher;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !activeCompany?.id) return;

    if (formData.mode === 'Double Entry') {
      const drTotal = (formData.items || []).filter(i => i.type === 'Dr').reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const crTotal = (formData.items || []).filter(i => i.type === 'Cr').reduce((s, i) => s + (Number(i.amount) || 0), 0);
      if (Math.abs(drTotal - crTotal) > 0.01) {
        toast.error(`Debit (${formatCurrency(drTotal)}) and Credit (${formatCurrency(crTotal)}) totals must match!`);
        return;
      }
    }

    if (formData.mode === 'Normal') {
      if (!formData.ledgerId || formData.ledgerId.trim() === '') {
        toast.error('Please select an Account (Cash/Bank) for this transaction.');
        return;
      }
      if (formData.items && formData.items.length > 0) {
        for (const item of formData.items) {
          if (!item.ledgerId || item.ledgerId.trim() === '') {
            toast.error('Please select a valid Particulars / Ledger account for each entry line.');
            return;
          }
        }
      }
    }

    try {
      const shouldSkip = isBillFulfillingNote(formData);
      const voucherData: any = {
        ...formData,
        skipStockUpdate: shouldSkip,
        createdBy: auth.currentUser.uid,
        companyId: activeCompany.id,
        updatedAt: new Date().toISOString()
      };

      if (formData.mode === 'Double Entry') {
        const drTotal = (formData.items || []).filter(i => i.type === 'Dr').reduce((s, i) => s + (Number(i.amount) || 0), 0);
        voucherData.amount = drTotal;
        voucherData.totalAmount = drTotal;
        voucherData.cgst = 0;
        voucherData.sgst = 0;
        voucherData.igst = 0;
      }

      if (formData.type === 'Manufacturing Journal') {
        const materialCost = (formData.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const addChargesTotal = (formData.additionalCharges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
        voucherData.amount = materialCost + addChargesTotal;
        voucherData.totalAmount = materialCost + addChargesTotal;
        voucherData.cgst = 0;
        voucherData.sgst = 0;
        voucherData.igst = 0;
      }

      // Recursive cleaner to remove undefined values and top-level id key before saving to Firestore
      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return undefined;
        if (Array.isArray(obj)) {
          return obj
            .map(item => cleanUndefined(item))
            .filter(item => item !== undefined);
        }
        if (typeof obj === 'object') {
          const cleaned: any = {};
          for (const key of Object.keys(obj)) {
            const val = cleanUndefined(obj[key]);
            if (val !== undefined) {
              cleaned[key] = val;
            }
          }
          return cleaned;
        }
        return obj;
      };

      const cleanVoucherData = cleanUndefined(voucherData);
      delete cleanVoucherData.id;

      let savedId = '';
      if (isEditing && editingId) {
        // Reverse old balances
        const oldVoucher = vouchers.find(v => v.id === editingId);
        if (oldVoucher) {
          await updateBalances(db, oldVoucher, -1);
        }
        
        // Update voucher
        await updateDoc(doc(db, 'vouchers', editingId), cleanVoucherData);
        await updateBalances(db, { ...cleanVoucherData, id: editingId }, 1);
        savedId = editingId;
      } else {
        // Create new voucher
        const docRef = await addDoc(collection(db, 'vouchers'), {
          ...cleanVoucherData,
          createdAt: new Date().toISOString()
        });
        await updateBalances(db, { ...cleanVoucherData, id: docRef.id }, 1);
        savedId = docRef.id;
      }

      const isPosSaved = formData.isPos;
      const printedVoucherData = { ...cleanVoucherData, id: savedId };
      const wasEditing = isEditing;

      setIsEditing(false);
      setEditingId(null);
      if (wasEditing) {
        setViewMode('list');
      }
      
      // Reset form but keep type and mode
      setFormData(prev => ({
        type: prev.type,
        mode: prev.mode,
        status: 'Regular',
        date: getLocalDateString(),
        voucherNumber: getNextVoucherNumber(prev.type || 'Sales'),
        ledgerId: '',
        salesPurchaseLedgerId: '',
        debitLedgerId: '',
        creditLedgerId: '',
        amount: 0,
        gstRate: 18,
        withTax: true,
        narration: '',
        items: prev.mode === 'Invoice' 
          ? [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
          : prev.mode === 'Double Entry'
            ? [{ ledgerId: '', amount: 0, type: 'Dr' }]
            : [{ ledgerId: '', amount: 0 }],
        isInterState: false,
        skipStockUpdate: false,
        referenceOrderNo: '',
        referenceVoucherId: ''
      } as any));
      
      toast.success(wasEditing ? 'Voucher updated successfully' : 'Voucher created successfully');
      if (isPosSaved) {
        setPrintingVoucher(printedVoucherData);
        setShowPrintPreview(true);
      }
      setTimeout(() => firstInputRef.current?.focus(), 100);
    } catch (error) {
      console.error('Error saving voucher:', error);
      toast.error('Failed to save voucher');
    }
  };



  const handleQuickLedgerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !activeCompany?.id) return;

    const trimmedName = quickLedgerData.name?.trim().toLowerCase();
    if (!trimmedName) {
      toast.error('Ledger name cannot be empty');
      return;
    }

    const duplicateExists = ledgers.some(
      l => l.id !== quickLedgerData.id && l.name.trim().toLowerCase() === trimmedName
    );

    if (duplicateExists) {
      toast.error(`A ledger with the name '${quickLedgerData.name}' already exists!`);
      return;
    }

    try {
      if (quickLedgerData.id) {
        // Edit existing ledger
        const { id, createdBy, createdAt, ...updateData } = quickLedgerData as any;
        await updateDoc(doc(db, 'ledgers', id), updateData);
        
        if (quickLedgerTarget === 'additionalCharge' && quickLedgerTargetIndex !== null) {
          setFormData(prev => {
            const newCharges = [...(prev.additionalCharges || [])];
            if (newCharges[quickLedgerTargetIndex]) {
              newCharges[quickLedgerTargetIndex].ledgerId = id;
            }
            return { ...prev, additionalCharges: newCharges };
          });
        } else if (quickLedgerTargetIndex !== null) {
          updateItem(quickLedgerTargetIndex, 'ledgerId', id);
        } else if (quickLedgerTarget) {
          setFormData(prev => ({ ...prev, [quickLedgerTarget as string]: id }));
        }

        setIsQuickLedgerModalOpen(false);
        setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
        setQuickLedgerTarget(null);
        setQuickLedgerTargetIndex(null);
        toast.success('Ledger updated successfully');
      } else {
        // Create new ledger
        const docRef = await addDoc(collection(db, 'ledgers'), {
          ...quickLedgerData,
          createdBy: uid,
          companyId: activeCompany.id,
          createdAt: new Date().toISOString()
        });
        const createdLedger = {
          ...quickLedgerData,
          id: docRef.id,
          createdBy: uid,
          companyId: activeCompany.id,
          createdAt: new Date().toISOString()
        } as Ledger;
        setLedgers(prev => {
          const exists = prev.some(l => l.id === docRef.id);
          return exists ? prev : [...prev, createdLedger];
        });
        
        if (quickLedgerTarget === 'additionalCharge' && quickLedgerTargetIndex !== null) {
          setFormData(prev => {
            const newCharges = [...(prev.additionalCharges || [])];
            if (newCharges[quickLedgerTargetIndex]) {
              newCharges[quickLedgerTargetIndex].ledgerId = docRef.id;
            }
            return { ...prev, additionalCharges: newCharges };
          });
        } else if (quickLedgerTargetIndex !== null) {
          updateItem(quickLedgerTargetIndex, 'ledgerId', docRef.id);
        } else if (quickLedgerTarget) {
          setFormData(prev => ({ ...prev, [quickLedgerTarget as string]: docRef.id }));
        }
        
        setIsQuickLedgerModalOpen(false);
        setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
        setQuickLedgerTarget(null);
        setQuickLedgerTargetIndex(null);
        toast.success('Ledger created successfully');
      }
    } catch (error) {
      console.error('Error saving ledger:', error);
      toast.error('Failed to save ledger');
    }
  };

  const handleQuickProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) return;
    const uid = auth.currentUser?.uid || authService.getUser()?.uid || 'user';

    const trimmedName = quickProductData.name?.trim().toLowerCase();
    if (!trimmedName) {
      toast.error('Product name cannot be empty');
      return;
    }

    const duplicateExists = products.some(
      p => p.name.trim().toLowerCase() === trimmedName
    );

    if (duplicateExists) {
      toast.error(`A stock item with the name '${quickProductData.name}' already exists!`);
      return;
    }

    try {
      const newProduct = {
        ...quickProductData,
        createdBy: uid,
        companyId: activeCompany.id,
        createdAt: new Date().toISOString(),
        decimalPlaces: quickProductData.decimalPlaces || 0
      };
      const res = await dataService.addDocument('products', newProduct);
      const createdProd = { ...newProduct, id: res.id } as Product;
      setProducts(prev => {
        const exists = prev.some(p => p.id === res.id);
        return exists ? prev : [...prev, createdProd];
      });
      
      if (quickProductTargetIndex !== null) {
        const newItems = [...(formData.items || [])];
        const currentItem = newItems[quickProductTargetIndex] || { quantity: 1, rate: 0, amount: 0 };
        const qty = currentItem.quantity !== undefined && currentItem.quantity > 0 ? Number(currentItem.quantity) : 1;
        const rate = (formData.type === 'Sales' || formData.type === 'Credit Note') ? (createdProd.salesPrice || 0) : (createdProd.purchasePrice || 0);
        const disc = currentItem.discount !== undefined ? Number(currentItem.discount) : 0;
        newItems[quickProductTargetIndex] = {
          ...currentItem,
          productId: res.id,
          productName: createdProd.name,
          quantity: qty,
          actualQuantity: qty,
          billedQuantity: qty,
          rate: rate,
          discount: disc,
          amount: Number((qty * rate * (1 - disc / 100)).toFixed(2))
        };
        setFormData(prev => ({ ...prev, items: newItems }));
      }
      
      setIsQuickProductModalOpen(false);
      setQuickProductData({ name: '', hsnCode: '', unit: 'PCS', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18, decimalPlaces: 0 });
      setQuickProductTargetIndex(null);
      toast.success('Product created successfully');
    } catch (error) {
      console.error('Error creating product:', error);
      toast.error('Failed to create product');
    }
  };

  const addItem = () => {
    let newItem: any;
    if (formData.mode === 'Invoice') {
      newItem = { productId: '', productName: '', quantity: 1, rate: 0, amount: 0 };
    } else if (formData.mode === 'Double Entry') {
      const lastItem = formData.items?.[formData.items.length - 1];
      const nextType = lastItem?.type === 'Dr' ? 'Cr' : 'Dr';
      newItem = { ledgerId: '', amount: 0, type: nextType };
    } else {
      newItem = { ledgerId: '', amount: 0 };
    }
    setFormData({ ...formData, items: [...(formData.items || []), newItem] });
  };

  const removeItem = (index: number) => {
    const newItems = [...(formData.items || [])];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const handleAiNarration = async () => {
    const ledgerName = ledgers.find(l => l.id === formData.ledgerId)?.name || 'Multiple Ledgers';
    const amount = formData.totalAmount || 0;
    
    if (amount === 0) {
      toast.error('Please enter items or amount first');
      return;
    }

    setIsAiSuggesting(true);
    try {
      const suggestions = await getNarrationSuggestions({
        type: formData.type || 'Voucher',
        ledgerName,
        amount,
        items: formData.items
      });
      setAiSuggestions(suggestions);
      setShowAiSuggestions(true);
    } catch (error) {
      toast.error('Failed to get AI suggestions');
    } finally {
      setIsAiSuggesting(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...(formData.items || [])];
    const item = { ...newItems[index], [field]: value };
    
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      if (product) {
        item.productName = product.name;
        item.rate = (formData.type === 'Sales' || formData.type === 'Credit Note') ? product.salesPrice : product.purchasePrice;
        const qty = item.quantity !== undefined ? Number(item.quantity) : 1;
        const disc = item.discount !== undefined ? Number(item.discount) : 0;
        item.quantity = qty;
        item.actualQuantity = qty;
        item.billedQuantity = qty;
        item.discount = disc;
        item.amount = Number((qty * (item.rate || 0) * (1 - disc / 100)).toFixed(2));
      }
    } else if (field === 'quantity' || field === 'actualQuantity' || field === 'billedQuantity' || field === 'rate' || field === 'discount') {
      const qty = item.quantity !== undefined ? Number(item.quantity) : 0;
      const rate = item.rate !== undefined ? Number(item.rate) : 0;
      const disc = item.discount !== undefined ? Number(item.discount) : 0;
      
      let actQty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : qty;
      let billQty = item.billedQuantity !== undefined ? Number(item.billedQuantity) : qty;
      
      if (field === 'actualQuantity') {
        actQty = value === '' ? 0 : Number(value);
        item.actualQuantity = actQty;
        // fallback synchronizations
        if (item.billedQuantity === undefined) {
          item.billedQuantity = actQty;
          billQty = actQty;
        }
        item.quantity = actQty;
      } else if (field === 'billedQuantity') {
        billQty = value === '' ? 0 : Number(value);
        item.billedQuantity = billQty;
        if (item.actualQuantity === undefined) {
          item.actualQuantity = billQty;
          actQty = billQty;
        }
      } else if (field === 'quantity') {
        const valQty = value === '' ? 0 : Number(value);
        item.quantity = valQty;
        item.actualQuantity = valQty;
        item.billedQuantity = valQty;
        actQty = valQty;
        billQty = valQty;
      }
      
      const calcQty = (formData.useSeparateQtyColumns || activeCompany?.useSeparateQtyColumns) ? billQty : qty;
      item.amount = Number((calcQty * rate * (1 - disc / 100)).toFixed(2));
    }
    
    newItems[index] = item;
    setFormData({ ...formData, items: newItems });
  };

  const handleSeparateQtyToggle = (checked: boolean) => {
    const newItems = (formData.items || []).map((item: any) => {
      const qty = item.quantity !== undefined ? Number(item.quantity) : 0;
      const actQty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : qty;
      const billQty = item.billedQuantity !== undefined ? Number(item.billedQuantity) : qty;
      const rate = item.rate !== undefined ? Number(item.rate) : 0;
      const disc = item.discount !== undefined ? Number(item.discount) : 0;
      
      const calcQty = checked ? billQty : qty;
      return {
        ...item,
        actualQuantity: actQty,
        billedQuantity: billQty,
        amount: Number((calcQty * rate * (1 - disc / 100)).toFixed(2))
      };
    });
    setFormData((prev: any) => ({
      ...prev,
      useSeparateQtyColumns: checked,
      items: newItems
    }));
  };

  const toggleMode = () => {
    const isSpecial = ['Payment', 'Receipt', 'Contra', 'Journal'].includes(formData.type || '');
    if (isSpecial) {
      const nextMode = formData.mode === 'Double Entry' ? 'Normal' : 'Double Entry';
      setFormData(prev => ({ 
        ...prev, 
        mode: nextMode,
        items: nextMode === 'Double Entry' 
          ? [{ ledgerId: '', amount: 0, type: 'Dr' }] 
          : [{ ledgerId: '', amount: 0 }]
      }));
    } else {
      const nextMode = formData.mode === 'Invoice' ? 'Double Entry' : 'Invoice';
      setFormData(prev => ({ 
        ...prev, 
        mode: nextMode,
        items: nextMode === 'Double Entry' 
          ? [{ ledgerId: '', amount: 0, type: 'Dr' }] 
          : [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
      }));
    }
  };

  const handlePrint = () => {
    console.log('Voucher Print initiated');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Popup blocked. Please allow popups to print.');
      return;
    }
    
    printWindow.document.write('<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f3f4f6;"><div style="text-align:center;"><div style="border:4px solid #f3f3f3;border-top:4px solid #3498db;border-radius:50%;width:40px;height:40px;animation:spin 2s linear infinite;margin:0 auto 20px;"></div><div style="font-size:18px;color:#1f2937;font-weight:600;">Preparing Voucher for Printing...</div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style></div></body></html>');

    try {
      generateVoucherPDF('print', printWindow);
    } catch (error) {
      console.error('Print failed:', error);
      printWindow.close();
      toast.error('Print failed. Please try downloading the PDF instead.');
    }
  };

  const handleDownloadPDF = () => generateVoucherPDF('download');

  const handleExportExcel = () => {
    try {
      const data = filteredVouchers.map(v => ({
        Date: v.date,
        Type: v.type,
        Number: v.voucherNumber,
        Party: ledgers.find(l => l.id === (v.mode === 'Invoice' ? v.ledgerId : (v.type === 'Receipt' || v.type === 'Contra' || v.type === 'Purchase' ? v.creditLedgerId : v.debitLedgerId)))?.name || 'Cash/Bank',
        Amount: v.totalAmount,
        Narration: v.narration || '',
        Status: v.status || 'Regular'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daybook");
      XLSX.writeFile(wb, `Daybook_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel exported successfully');
    } catch (err: any) {
      console.error('Export Error:', err);
      toast.error('Failed to export Excel');
    }
  };

  const generateVoucherPDF = async (action: 'download' | 'print', printWindow?: Window | null) => {
    if (!printingVoucher) {
      console.error('No voucher selected for printing');
      if (printWindow) printWindow.close();
      return;
    }

    const element = document.getElementById('voucher-print-area');
    if (!element) {
      console.error('Voucher print area not found');
      toast.error('Error: Could not find the voucher content to generate PDF.');
      if (printWindow) printWindow.close();
      return;
    }

    try {
      // Use html-to-image instead of html2canvas to handle modern CSS (oklch, color-mix, etc.)
      const dataUrl = await toPng(element, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      if (action === 'print' && printWindow) {
        const pdfBlob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        printWindow.location.href = blobUrl;
        toast.success('Print preview ready');
      } else {
        pdf.save(`${printingVoucher.type}_${printingVoucher.voucherNumber}.pdf`);
        toast.success('PDF downloaded successfully');
      }
    } catch (error) {
      console.error('PDF generation failed:', error);
      if (printWindow) printWindow.close();
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const getDayName = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

   const formatDateForDisplay = (dateStr: string) => {
     const date = new Date(dateStr);
     const day = date.getDate();
     const month = date.toLocaleDateString('en-US', { month: 'short' });
     const year = date.getFullYear().toString().slice(-2);
     return `${day}-${month}-${year}`;
   };

  const showSeparateQty = formData.useSeparateQtyColumns !== undefined ? formData.useSeparateQtyColumns : !!activeCompany?.useSeparateQtyColumns;
  const showGodown = activeCompany?.enableGodowns !== false;
  const showBatch = activeCompany?.enableBatches !== false;
  const showDiscount = activeCompany?.enableDiscount !== false;
  const showCostCenters = activeCompany?.enableCostCenters !== false;
  const showGst = activeCompany?.enableGst !== false;

  const invoiceTotalCols = 1 + // Item Name
    (showGodown ? 1 : 0) + // Godown
    (showGodown && formData.type === 'Stock Journal' ? 1 : 0) + // Dst Godown
    (showBatch ? 3 : 0) + // Batch, Mfg, Exp
    (showSeparateQty ? 2 : 1) + // Qty columns
    1 + // Rate
    (showDiscount ? 1 : 0) + // Disc %
    1; // Amount

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden print:overflow-visible print:h-auto font-sans text-gray-900">
      <div className={showPrintPreview ? "print:hidden flex-1 flex flex-col h-full overflow-hidden" : "flex-1 flex flex-col h-full overflow-hidden"}>
        {viewMode === 'entry' ? (
          <>
            <div className="flex-1 flex flex-col overflow-hidden">

          {/* Voucher Header Menu */}
          <div className="bg-[#004d5a] h-12 flex items-center px-4 justify-between shrink-0 text-white font-mono shadow-md border-b-2 border-[#ffcb2b]">
            <div className="flex items-center space-x-3">
              <span className="bg-[#ffcb2b] text-[#002f3c] font-extrabold px-3 py-1 text-xs rounded uppercase tracking-wider">
                {formData.type} Voucher
              </span>
              {activeCompany?.enablePosInvoice && formData.type === 'Sales' && (
                <div className="flex items-center bg-[#003c47] p-0.5 rounded border border-[#005a69] space-x-1 shadow-inner select-none">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isPos: false }))}
                    className={`px-2.5 py-1 font-bold text-[9px] uppercase transition-all rounded ${!formData.isPos ? 'bg-[#ffcb2b] text-[#002f3c] shadow-sm font-black' : 'text-gray-300 hover:text-white'}`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashLedger = ledgers.find(l => l.group === 'Cash-in-Hand')?.id || '';
                      setFormData(prev => ({
                        ...prev,
                        isPos: true,
                        ledgerId: prev.ledgerId || cashLedger,
                        posPaymentMode: prev.posPaymentMode || 'Cash',
                        posCashReceived: prev.posCashReceived || 0,
                        posCashReturned: 0,
                        items: prev.items && prev.items.length > 1 || (prev.items?.[0]?.productId) ? prev.items : [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }]
                      }));
                    }}
                    className={`px-2.5 py-1 font-bold text-[9px] uppercase transition-all rounded ${formData.isPos ? 'bg-[#ffcb2b] text-[#002f3c] shadow-sm font-black' : 'text-gray-300 hover:text-white'}`}
                  >
                    ⚡ POS Invoice
                  </button>
                </div>
              )}
              <div className="flex items-center bg-white/10 px-2 py-0.5 rounded text-xs animate-fade-in">
                <span className="opacity-75 mr-1 text-[10px]">Voucher No:</span>
                <input
                  type="text"
                  ref={firstInputRef}
                  value={formData.voucherNumber}
                  onChange={(e) => setFormData({ ...formData, voucherNumber: e.target.value })}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 p-0 w-20 outline-none text-[#ffcb2b]"
                  placeholder="Auto"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {showGst && formData.mode !== 'Double Entry' && (
                <div className="flex items-center space-x-3 text-xs">
                  <label className="flex items-center space-x-1 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.withTax}
                      onChange={(e) => setFormData({ ...formData, withTax: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-[#ffcb2b]/30 bg-white/10 text-teal-600 focus:ring-0 cursor-pointer text-xs"
                    />
                    <span className="text-[11px] text-gray-200 group-hover:text-white">With Tax</span>
                  </label>

                  {formData.withTax && (
                    <>
                      <div className="flex items-center bg-[#003c47] px-2 py-0.5 rounded text-xs border border-[#005a69] space-x-1">
                        <span className="text-gray-300 text-[10px] uppercase">Tax:</span>
                        <select
                          value={formData.taxType || defaultTaxType}
                          onChange={(e) => setFormData({ ...formData, taxType: e.target.value as any })}
                          className="bg-[#003c47] border-none text-[#ffcb2b] font-bold text-xs focus:ring-0 p-0 outline-none cursor-pointer"
                        >
                          <option value="GST">GST</option>
                          <option value="VAT">VAT</option>
                          <option value="Sales Tax">Sales Tax</option>
                          <option value="Tax">Standard Tax</option>
                          <option value="TDS">TDS Det.</option>
                          <option value="Excise">Excise</option>
                          <option value="Service Tax">Service Tax</option>
                        </select>
                      </div>

                      <div className="flex items-center bg-[#003c47] px-2 py-0.5 rounded text-xs border border-[#005a69] space-x-1">
                        <span className="text-gray-300 text-[10px] uppercase">Rate:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.gstRate ?? 18}
                          onChange={(e) => setFormData({ ...formData, gstRate: Number(e.target.value) || 0 })}
                          className="bg-transparent border-none text-[#ffcb2b] font-bold text-xs focus:ring-0 p-0 w-8 outline-none text-center"
                        />
                        <span className="text-gray-300 text-[10px]">%</span>
                      </div>
                    </>
                  )}

                  {formData.withTax && (formData.taxType === 'GST' || !formData.taxType) && (
                    <label className="flex items-center space-x-1 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.isInterState}
                        onChange={(e) => setFormData({ ...formData, isInterState: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-[#ffcb2b]/30 bg-white/10 text-teal-600 focus:ring-0 cursor-pointer text-xs"
                      />
                      <span className="text-[11px] text-gray-200 group-hover:text-white">Inter-State (IGST)</span>
                    </label>
                  )}

                  <label className="flex items-center space-x-1 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!(formData.useSeparateQtyColumns !== undefined ? formData.useSeparateQtyColumns : activeCompany?.useSeparateQtyColumns)}
                      onChange={(e) => handleSeparateQtyToggle(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#ffcb2b]/30 bg-white/10 text-teal-600 focus:ring-0 cursor-pointer text-xs"
                    />
                    <span className="text-[11px] text-gray-200 group-hover:text-white">Sep Act/Bill Qty</span>
                  </label>
                </div>
              )}
              
              <div className="flex items-center bg-[#003c47] px-2.5 py-1 rounded text-xs border border-[#005a69]">
                <span className="text-gray-300 mr-2 text-[10px] uppercase">Status:</span>
                <select
                  value={formData.status || 'Regular'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="bg-transparent border-none text-[#ffcb2b] font-bold text-xs focus:ring-0 p-0 outline-none cursor-pointer"
                >
                  <option value="Regular" className="bg-[#004d5a] text-white">Regular</option>
                  <option value="Optional" className="bg-[#004d5a] text-white">Optional</option>
                  <option value="Post-Dated" className="bg-[#004d5a] text-white">Post-Dated</option>
                  {formData.status === 'Cancelled' && (
                    <option value="Cancelled" className="bg-[#004d5a] text-white">Cancelled</option>
                  )}
                </select>
              </div>

              <div className="flex items-center bg-[#003c47] px-2.5 py-1 rounded text-xs border border-[#005a69]">
                <span className="text-gray-300 mr-2 text-[10px] uppercase">Date:</span>
                <input
                  type="date"
                  data-tally-field="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 p-0 w-24 outline-none text-[#ffcb2b] focus:text-[#ffe082] [color-scheme:dark]"
                />
              </div>

              {/* Template Controls */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="bg-white/10 hover:bg-white/25 px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 border border-white/10"
                >
                  <Save size={11} className="text-[#ffcb2b]" />
                  <span>Save Template</span>
                </button>
                <div className="relative group/templates">
                  <button
                    type="button"
                    className="bg-white/10 hover:bg-white/25 px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 border border-white/10"
                  >
                    <Copy size={11} className="text-[#ffcb2b]" />
                    <span>Templates</span>
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-64 bg-[#fcfbf9] text-gray-800 rounded-md shadow-2xl border border-gray-300 hidden group-hover/templates:block z-[80] overflow-hidden">
                    <div className="p-2 border-b border-gray-250 bg-gray-105 text-[10px] uppercase font-bold text-[#004d5a] tracking-wider font-mono">
                      Saved Templates
                    </div>
                    <div className="max-h-64 overflow-y-auto font-mono">
                      {templates.filter(t => t.type === formData.type).map(template => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleLoadTemplate(template)}
                          className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-teal-50 transition-colors border-b border-gray-100 last:border-0"
                        >
                          <div className="font-bold text-[#004d5a]">{template.name}</div>
                          <div className="text-[10px] opacity-60">{template.mode} • {formatCurrency(template.amount)}</div>
                        </button>
                      ))}
                      {templates.filter(t => t.type === formData.type).length === 0 && (
                        <div className="p-4 text-center text-xs text-gray-400 italic">
                          No templates for {formData.type}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="m-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3 no-print font-mono text-xs">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1">
                <p className="font-bold mb-1 uppercase text-red-800">Database Index Error</p>
                {error.includes('https://console.firebase.google.com') ? (
                  <p className="text-sm">
                    This view needs a database index. 
                    <a 
                      href={error.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0]} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block mt-2 font-bold underline text-red-700 hover:text-red-900"
                    >
                      Click here to build the required index in your Firebase Console
                    </a>
                  </p>
                ) : (
                  <p className="text-xs">{error}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* Main Worksheet Area */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden relative bg-[#eaedf0] p-4">
              {formData.isPos && formData.type === 'Sales' ? (
                /* Dynamic POS Workspace */
                <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden h-full">
                  {/* Left Column: Items Selection & Shopping Cart (60%) */}
                  <div className="flex-1 flex flex-col min-w-0 bg-white shadow-md border border-gray-300 rounded-sm overflow-hidden h-full">
                    {/* Fast Search Input */}
                    <div className="p-3 bg-slate-50 border-b border-gray-200 flex gap-2 items-center">
                      <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Quick Scan or Search Product by Name/HSN..."
                          value={posSearchTerm}
                          onChange={(e) => setPosSearchTerm(e.target.value)}
                          className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 pl-9 pr-4 py-2 text-xs font-bold font-mono outline-none rounded-sm transition-all shadow-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickProductTargetIndex(formData.items?.length || 0);
                          setIsQuickProductModalOpen(true);
                        }}
                        className="p-2 bg-teal-50 text-teal-700 hover:bg-[#004d5a] hover:text-white rounded border border-teal-200 transition-all text-xs font-bold uppercase tracking-wider flex items-center gap-1 shrink-0"
                      >
                        <Plus size={14} /> Add Product
                      </button>
                    </div>

                    {/* Product Fast Tap Cards List */}
                    <div className="px-3 py-2 bg-slate-100 border-b border-gray-200 max-h-36 overflow-y-auto select-none no-print">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                        {products
                          .filter(p => !posSearchTerm || p.name.toLowerCase().includes(posSearchTerm.toLowerCase()) || p.hsnCode?.includes(posSearchTerm))
                          .slice(0, 12)
                          .map(product => {
                            const cartCount = (formData.items || []).find(i => i.productId === product.id)?.quantity || 0;
                            return (
                              <button
                                key={product.id}
                                type="button"
                                onClick={() => handlePosAddProduct(product)}
                                className="p-1.5 bg-white border border-slate-350 hover:border-teal-600 hover:bg-teal-50 text-left transition-all rounded shadow-sm relative group flex flex-col justify-between"
                              >
                                {cartCount > 0 && (
                                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                                    {cartCount}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold text-slate-800 line-clamp-1 group-hover:text-teal-900 leading-tight uppercase font-mono">{product.name}</span>
                                <span className="text-[9px] text-[#146e85] font-black font-mono mt-0.5">{formatCurrency(product.salesPrice || 0)}</span>
                              </button>
                            );
                          })}
                        {products.length === 0 && (
                          <div className="col-span-full py-3 text-center text-xs text-gray-400 italic font-mono">No products added. Add or import them.</div>
                        )}
                      </div>
                    </div>

                    {/* Active Cart/Invoice Table Container */}
                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-[11px] font-mono border-collapse select-text">
                        <thead>
                          <tr className="bg-[#eaedf0] text-slate-700 uppercase tracking-wider border-b border-gray-300 select-none">
                            <th className="py-2 px-3 text-left w-6">#</th>
                            <th className="py-2 px-2 text-left">Product Name</th>
                            <th className="py-2 px-2 text-center w-28">Qty</th>
                            <th className="py-2 px-2 text-right w-20">Rate</th>
                            <th className="py-2 px-2 text-right w-16">Disc %</th>
                            <th className="py-2 px-3 text-right w-24">Amount</th>
                            <th className="py-2 px-2 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {(formData.items || []).map((item: any, index: number) => {
                            const isPlaceholder = !item.productId;
                            const product = products.find(p => p.id === item.productId);
                            return (
                              <tr key={index} className={`hover:bg-slate-50 transition-colors ${isPlaceholder ? 'opacity-40' : ''}`}>
                                <td className="py-1.5 px-3 font-semibold text-slate-400 text-center">{index + 1}</td>
                                <td className="py-1.5 px-2 font-bold text-slate-800">
                                  {isPlaceholder ? (
                                    <span className="text-gray-400 italic font-medium">Select a product or tap above...</span>
                                  ) : (
                                    <div className="flex flex-col">
                                      <span>{item.productName || product?.name}</span>
                                      <span className="text-[9px] text-gray-450 font-normal">{product?.hsnCode ? `HSN: ${product.hsnCode}` : ''}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2">
                                  {!isPlaceholder && (
                                    <div className="flex items-center justify-center space-x-1 select-none">
                                      <button
                                        type="button"
                                        onClick={() => handlePosAdjustQuantity(index, -1)}
                                        className="h-6 w-6 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-black border border-slate-350 active:scale-95 transition-all text-xs"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        min="1"
                                        value={item.quantity !== undefined ? item.quantity : 1}
                                        onChange={(e) => updateItem(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-10 bg-white border border-gray-300 focus:bg-[#ffffcc] focus:border-teal-600 focus:ring-0 p-0 text-center text-[10px] font-bold h-6 rounded-sm outline-none font-mono"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handlePosAdjustQuantity(index, 1)}
                                        className="h-6 w-6 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-black border border-slate-350 active:scale-95 transition-all text-xs"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  {!isPlaceholder && (
                                    <input
                                      type="number"
                                      value={item.rate !== undefined ? item.rate : 0}
                                      onChange={(e) => updateItem(index, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                                      className="w-16 bg-transparent hover:bg-white focus:bg-[#ffffcc] border-0 focus:border focus:border-teal-400 p-0 text-right text-[10px] font-bold outline-none font-mono focus:ring-0 h-6"
                                    />
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  {!isPlaceholder && (
                                    <input
                                      type="number"
                                      value={item.discount !== undefined ? item.discount : ''}
                                      placeholder="0"
                                      onChange={(e) => updateItem(index, 'discount', e.target.value === '' ? '' : Number(e.target.value))}
                                      className="w-12 bg-transparent hover:bg-white focus:bg-[#ffffcc] border-0 focus:border focus:border-teal-400 p-0 text-right text-[10px] font-bold outline-none font-mono focus:ring-0 h-6"
                                    />
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-right font-extrabold text-slate-850">
                                  {isPlaceholder ? '-' : formatCurrency(item.amount)}
                                </td>
                                <td className="py-1.5 px-2 text-center text-rose-500 hover:text-rose-700">
                                  {!isPlaceholder && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = (formData.items || []).filter((_: any, i: number) => i !== index);
                                        setFormData(prev => ({ ...prev, items: newItems.length > 0 ? newItems : [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }] }));
                                      }}
                                      className="p-1 hover:bg-rose-50 rounded"
                                    >
                                      <Trash size={12} className="mx-auto" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Customer & Checkout Side Panel (40%) */}
                  <div className="w-full lg:w-[380px] shrink-0 flex flex-col bg-slate-900 text-slate-100 rounded-sm border border-slate-800 shadow-xl overflow-hidden h-full font-mono">
                    {/* Customer Selection block */}
                    <div className="p-4 border-b border-slate-950 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Party A/c (Customer)</label>
                          <div className="flex items-center gap-2">
                            {formData.ledgerId && (
                              <button
                                type="button"
                                onClick={() => {
                                  const selectedLedger = ledgers.find(l => l.id === formData.ledgerId);
                                  if (selectedLedger) {
                                    setQuickLedgerTarget('ledgerId');
                                    setQuickLedgerData(selectedLedger);
                                    setIsQuickLedgerModalOpen(true);
                                  }
                                }}
                                className="text-[9px] font-bold uppercase text-blue-400 flex items-center gap-1 hover:underline"
                                title="Edit Ledger"
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setQuickLedgerTarget('ledgerId');
                                setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
                                setIsQuickLedgerModalOpen(true);
                              }}
                              className="text-[9px] font-bold uppercase text-amber-400 flex items-center gap-1 hover:underline"
                            >
                              <Plus size={12} /> Add
                            </button>
                          </div>
                        </div>
                        <select
                          required
                          value={formData.ledgerId || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, ledgerId: e.target.value }))}
                          className="w-full bg-slate-800 text-white font-bold text-[#fcfbf9] text-xs p-2.5 rounded border border-slate-700 outline-none focus:border-amber-400 focus:bg-slate-850 cursor-pointer"
                        >
                          <option value="">Select Customer / walk-in ledger</option>
                          {ledgers
                            .filter(l => l.group === 'Cash-in-Hand' || l.group === 'Sundry Debtors')
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(l => (
                              <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                            ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Sales Ledger</label>
                          <select
                            required
                            value={formData.salesPurchaseLedgerId || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, salesPurchaseLedgerId: e.target.value }))}
                            className="w-full bg-slate-800 text-white font-bold text-[10px] p-2 rounded border border-slate-700 outline-none cursor-pointer"
                          >
                            <option value="">Select Sales A/c</option>
                            {ledgers
                              .filter(l => l.group === 'Sales Accounts')
                              .map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Voucher No</label>
                          <input
                            type="text"
                            value={formData.voucherNumber}
                            onChange={(e) => setFormData(prev => ({ ...prev, voucherNumber: e.target.value }))}
                            className="w-full bg-slate-800 text-slate-300 font-bold text-[10px] p-2 rounded border border-slate-700 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Numeric Cash register total display section */}
                    <div className="p-4 bg-slate-950/60 border-b border-slate-950 flex flex-col items-stretch space-y-2">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>SUB-TOTAL:</span>
                        <span>{formatCurrency(formData.amount || 0)}</span>
                      </div>
                      
                      {formData.withTax !== false && (
                        <div className="flex justify-between text-[11px] text-slate-400 font-normal">
                          {formData.isInterState ? (
                            <>
                              <span>IGST ({formData.gstRate}%):</span>
                              <span>{formatCurrency(formData.igst || 0)}</span>
                            </>
                          ) : (
                            <>
                              <span>CGST/SGST ({(formData.gstRate || 18)/2}% each):</span>
                              <span>{formatCurrency((formData.cgst || 0) + (formData.sgst || 0))}</span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between bg-slate-900 border border-teal-950/50 p-2.5 rounded">
                        <span className="text-xs font-black text-teal-400 tracking-widest">NET PAYABLE:</span>
                        <span className="text-xl font-black text-[#ffcb2b] tracking-wider">
                          {formatCurrency(formData.totalAmount || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Checkout & Payment Modes section */}
                    <div className="p-4 flex-1 space-y-3.5 overflow-y-auto font-mono">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Payment Mode</label>
                        <div className="grid grid-cols-3 gap-1">
                          {['Cash', 'Card', 'Multi-Mode'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setFormData(prev => ({
                                  ...prev,
                                  posPaymentMode: mode as any,
                                  posCashReceived: prev.posCashReceived || prev.totalAmount || 0,
                                  posCashReturned: Math.max(0, (prev.posCashReceived || prev.totalAmount || 0) - (prev.totalAmount || 0)),
                                  posCardAmount: prev.totalAmount || 0,
                                  posCashAmount: Math.floor((prev.totalAmount || 0) / 2),
                                  posCardAmountMulti: Math.ceil((prev.totalAmount || 0) / 2)
                              }))}
                              className={`p-2 font-bold text-[10px] uppercase transition-all rounded text-center border ${
                                formData.posPaymentMode === mode
                                  ? 'bg-[#ffcb2b] text-[#002f3c] border-[#ffcb2b] shadow font-black'
                                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                              }`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Payment Inputs conditional on mode */}
                      {formData.posPaymentMode === 'Cash' && (
                        <div className="p-3 bg-[#0a141a]/60 rounded border border-slate-800 space-y-2">
                          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Cash Received ({currencySymbol})</label>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={formData.posCashReceived !== undefined ? formData.posCashReceived : ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setFormData(prev => ({
                                  ...prev,
                                  posCashReceived: val,
                                  posCashReturned: Math.max(0, val - (prev.totalAmount || 0))
                                }));
                              }}
                              className="w-full bg-slate-800 text-white font-black text-sm p-2 rounded border border-slate-700 outline-none focus:border-amber-400 focus:ring-0"
                              placeholder="Enter Cash Received"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const roundedVal = Math.ceil(formData.totalAmount || 0);
                                setFormData(prev => ({
                                  ...prev,
                                  posCashReceived: roundedVal,
                                  posCashReturned: Math.max(0, roundedVal - (prev.totalAmount || 0))
                                }));
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-slate-700 hover:bg-slate-600 text-[#ffcb2b] px-1.5 py-0.5 rounded transition-all"
                            >
                              EXACT
                            </button>
                          </div>
                          
                          {/* Quick Denominations click targets */}
                          <div className="flex gap-1.5 pt-1">
                            {[100, 200, 500, 2000].map(demon => (
                              <button
                                key={demon}
                                type="button"
                                onClick={() => {
                                  const currentTotal = formData.totalAmount || 0;
                                  const newVal = demon >= currentTotal ? demon : (Math.ceil(currentTotal / demon) * demon);
                                  setFormData(prev => ({
                                    ...prev,
                                    posCashReceived: newVal,
                                    posCashReturned: Math.max(0, newVal - currentTotal)
                                  }));
                                }}
                                className="flex-1 bg-slate-800 hover:bg-[#1c2930] active:scale-95 transition-all py-1 text-[9px] font-bold text-slate-300 rounded border border-slate-750 font-mono"
                              >
                                {currencySymbol}{demon}
                              </button>
                            ))}
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-800 pt-2 mt-1">
                            <span className="text-[10px] text-slate-400 uppercase">Change returned:</span>
                            <span className="text-sm font-black text-emerald-400">
                              {formatCurrency(formData.posCashReturned || 0)}
                            </span>
                          </div>
                        </div>
                      )}

                      {formData.posPaymentMode === 'Card' && (
                        <div className="p-3 bg-[#0a141a]/60 rounded border border-slate-800 space-y-1.5 font-bold text-[10px] leading-relaxed text-blue-300 flex items-center gap-2">
                          <Check size={14} className="text-blue-400 shrink-0 select-none animate-pulse" />
                          <span>Charge terminal for card payment of: {formatCurrency(formData.totalAmount || 0)}.</span>
                        </div>
                      )}

                      {formData.posPaymentMode === 'Multi-Mode' && (
                        <div className="p-3 bg-[#0a141a]/60 rounded border border-slate-800 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Cash portion</label>
                              <input
                                type="number"
                                value={formData.posCashAmount !== undefined ? formData.posCashAmount : ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  setFormData(prev => ({
                                    ...prev,
                                    posCashAmount: val,
                                    posCardAmount: Math.max(0, (prev.totalAmount || 0) - val)
                                  }));
                                }}
                                className="w-full bg-slate-800 text-white font-bold text-[11px] p-2 rounded border border-slate-700 outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Card portion</label>
                              <input
                                type="number"
                                value={formData.posCardAmount !== undefined ? formData.posCardAmount : ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  setFormData(prev => ({
                                    ...prev,
                                    posCardAmount: val,
                                    posCashAmount: Math.max(0, (prev.totalAmount || 0) - val)
                                  }));
                                }}
                                className="w-full bg-slate-800 text-white font-bold text-[11px] p-2 rounded border border-slate-700 outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Narration Memo textarea */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
                          <span>Memo Note</span>
                          <button
                            type="button"
                            onClick={handleAiNarration}
                            className="text-[9px] text-[#ffcb2b] hover:underline flex items-center gap-0.5 font-bold animate-pulse"
                          >
                            <Sparkles size={10} /> Suggest Auto
                          </button>
                        </label>
                        <textarea
                          value={formData.narration}
                          onChange={(e) => setFormData(prev => ({ ...prev, narration: e.target.value }))}
                          className="w-full bg-slate-800 text-[#fcfbf9] border border-slate-700 rounded-sm p-2 text-[10px] outline-none h-11 resize-none font-semibold font-mono"
                          placeholder="Quick walk-in memo narration..."
                        />
                      </div>
                    </div>

                    {/* Massive Checkout Trigger Footer bar */}
                    <div className="p-3 bg-slate-950 border-t border-slate-850 flex gap-2 select-none no-print">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, isPos: false }))}
                        className="px-3 bg-slate-800 hover:bg-slate-700 outline-none font-bold text-[10px] uppercase rounded text-slate-300 transition-colors shrink-0"
                      >
                        Standard Mode
                      </button>
                      <button
                        type="submit"
                        disabled={!formData.ledgerId || !formData.items?.[0]?.productId}
                        className="flex-1 bg-[#ffcb2b] hover:bg-[#ffe082] py-2.5 uppercase font-black text-xs text-[#002f3c] text-center rounded shadow-md active:scale-[0.98] transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                      >
                        <ShoppingBag size={14} /> Accept &amp; Print (Ctrl+A)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Voucher Sheet paper card */}
                  <div className="flex-1 bg-[#faf8f5] shadow-lg border-t-2 border-x border-b-2 border-gray-300 rounded-sm p-6 overflow-y-auto font-mono text-slate-800 select-text">
                {formData.status && formData.status !== 'Regular' && (
                  <div className={`p-4 mb-6 rounded border text-center font-bold text-xs uppercase ${
                    formData.status === 'Optional' ? 'bg-amber-50 text-amber-900 border-amber-300' :
                    formData.status === 'Post-Dated' ? 'bg-teal-50 text-[#004d5a] border-teal-300' :
                    'bg-slate-100 text-slate-705 border-slate-350 line-through text-red-700'
                  }`}>
                    🛑 {formData.status} Voucher: This entry will not affect financial ledger balances
                  </div>
                )}
                {/* Single Entry Style Account Selection */}
                {formData.mode !== 'Double Entry' && formData.type !== 'Stock Journal' && formData.type !== 'Manufacturing Journal' && (
                  <div className="space-y-3 mb-6 max-w-4xl border-b border-gray-200 pb-6">
                    <div className="flex items-center">
                      <label className="w-36 text-xs font-bold text-gray-700 uppercase tracking-wide">Account (Party A/c)</label>
                      <span className="mr-3 text-gray-400 font-bold">:</span>
                      <div className="flex-1 flex items-center group relative">
                        <select
                          data-tally-field="ledgerId"
                          required
                          value={formData.ledgerId || ''}
                          onChange={(e) => setFormData({ ...formData, ledgerId: e.target.value })}
                          className="flex-1 bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all shadow-sm"
                        >
                          <option value="">-- Select Party A/c / Cash / Bank --</option>
                          {['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? (
                            <>
                              <optgroup label="Cash & Bank Accounts">
                                {ledgers
                                  .filter(l => ['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                              <optgroup label="Suppliers / Creditors (Sundry Creditors)">
                                {ledgers
                                  .filter(l => l.group === 'Sundry Creditors' || (l.group || '').toLowerCase().includes('creditor'))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                              <optgroup label="Other Accounts">
                                {ledgers
                                  .filter(l => !['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c', 'Sundry Creditors'].includes(l.group) && !(l.group || '').toLowerCase().includes('creditor'))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                            </>
                          ) : ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type as string) ? (
                            <>
                              <optgroup label="Cash & Bank Accounts">
                                {ledgers
                                  .filter(l => ['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                              <optgroup label="Customers / Debtors (Sundry Debtors)">
                                {ledgers
                                  .filter(l => l.group === 'Sundry Debtors' || (l.group || '').toLowerCase().includes('debtor'))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                              <optgroup label="Other Accounts">
                                {ledgers
                                  .filter(l => !['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c', 'Sundry Debtors'].includes(l.group) && !(l.group || '').toLowerCase().includes('debtor'))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                            </>
                          ) : (
                            <>
                              <optgroup label="Cash & Bank Accounts">
                                {ledgers
                                  .filter(l => ['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                              <optgroup label="All Other Ledgers">
                                {ledgers
                                  .filter(l => !['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))
                                  .map(l => (
                                    <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                  ))}
                              </optgroup>
                            </>
                          )}
                        </select>
                        {formData.ledgerId && (
                          <button
                            type="button"
                            onClick={() => {
                              const selectedLedger = ledgers.find(l => l.id === formData.ledgerId);
                              if (selectedLedger) {
                                setQuickLedgerTarget('ledgerId');
                                setQuickLedgerData(selectedLedger);
                                setIsQuickLedgerModalOpen(true);
                              }
                            }}
                            className="ml-1 p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                            title="Quick Edit Ledger"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setQuickLedgerTarget('ledgerId');
                            setQuickLedgerData({
                              name: '',
                              group: ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? 'Sundry Creditors' : ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type as string) ? 'Sundry Debtors' : 'Current Assets',
                              openingBalance: 0,
                              currentBalance: 0
                            });
                            setIsQuickLedgerModalOpen(true);
                          }}
                          className="ml-2 p-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                          title="Quick Create Party Ledger (Alt+C)"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {formData.ledgerId && (
                      <div className="flex items-center -mt-1.5">
                        <div className="w-36"></div>
                        <span className="mr-3 ml-1 text-transparent">:</span>
                        <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-sm border border-teal-100">
                          Current Balance: {formatBalance(ledgerBalances[formData.ledgerId] || 0)}
                        </div>
                      </div>
                    )}

                    {formData.mode === 'Invoice' && (formData.type === 'Sales' || formData.type === 'Purchase' || formData.type === 'Credit Note' || formData.type === 'Debit Note' || formData.type === 'Sales Order' || formData.type === 'Purchase Order' || formData.type === 'Delivery Note' || formData.type === 'Receipt Note' || formData.type === 'Rejection In' || formData.type === 'Rejection Out') && (
                      <div className="space-y-3 pt-3">
                        {/* Order Number for Orders */}
                        {['Sales Order', 'Purchase Order'].includes(formData.type) && (
                          <div className="flex items-center">
                            <label className="w-36 text-xs font-bold text-gray-700 uppercase tracking-wide">Order No.</label>
                            <span className="mr-3 text-gray-400 font-bold">:</span>
                            <div className="flex-1">
                              <input
                                type="text"
                                data-tally-field="orderNumber"
                                value={formData.orderNumber || ''}
                                onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                                placeholder="Enter Order Number"
                                className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all shadow-sm"
                              />
                            </div>
                          </div>
                        )}

                        {/* Reference Order selection for DN/RN/Invoice/Rejections */}
                        {['Delivery Note', 'Receipt Note', 'Sales', 'Purchase', 'Rejection In', 'Rejection Out'].includes(formData.type) && (
                          <div className="flex items-center">
                            <label className="w-36 text-xs font-bold text-gray-700 uppercase tracking-wide">Select Order/Note</label>
                            <span className="mr-3 text-gray-400 font-bold">:</span>
                            <div className="flex-1 flex items-center space-x-2">
                              <select
                                data-tally-field="referenceOrderNo"
                                value={formData.referenceOrderNo || ''}
                                onChange={(e) => {
                                  const orderNo = e.target.value;
                                  if (!orderNo) {
                                    setFormData({ ...formData, referenceOrderNo: '', skipStockUpdate: false });
                                    return;
                                  }
                                  
                                  // Determine possible source voucher types
                                  let sourceTypes: string[] = [];
                                  if (formData.type === 'Sales') {
                                    sourceTypes = ['Delivery Note', 'Sales Order'];
                                  } else if (formData.type === 'Delivery Note') {
                                    sourceTypes = ['Sales Order'];
                                  } else if (formData.type === 'Rejection In') {
                                    sourceTypes = ['Delivery Note'];
                                  } else if (formData.type === 'Purchase') {
                                    sourceTypes = ['Receipt Note', 'Purchase Order'];
                                  } else if (formData.type === 'Receipt Note') {
                                    sourceTypes = ['Purchase Order'];
                                  } else if (formData.type === 'Rejection Out') {
                                    sourceTypes = ['Receipt Note'];
                                  }

                                  // Find the best source voucher (prefer Note over Order)
                                  let sourceVoucher = null;
                                  for (const type of sourceTypes) {
                                    sourceVoucher = vouchers.find(v => v.type === type && (v.orderNumber === orderNo || v.voucherNumber === orderNo || v.referenceOrderNo === orderNo) && v.ledgerId === formData.ledgerId);
                                    if (sourceVoucher) break;
                                  }
                                  
                                  if (sourceVoucher) {
                                    // Load items from source
                                    let newItems = sourceVoucher.items ? sourceVoucher.items.map(item => ({ ...item })) : [];
                                    
                                    // Subtract Rejections if it's a final bill (Sales/Purchase)
                                    if (['Sales', 'Purchase'].includes(formData.type as string)) {
                                      // Search for Rejection In/Out documents matching this reference number to subtract quantity.
                                      // Supporting both Rejection In and Rejection Out to cover any user choice seamlessly.
                                      const rejections = vouchers.filter(v => 
                                        (v.type === 'Rejection In' || v.type === 'Rejection Out') && 
                                        (v.referenceOrderNo === orderNo || v.orderNumber === orderNo || v.voucherNumber === orderNo) && 
                                        v.ledgerId === formData.ledgerId
                                      );
                                      
                                      rejections.forEach(rej => {
                                        if (rej.items) {
                                          rej.items.forEach(rejItem => {
                                            const itemIdx = newItems.findIndex(i => i.productId === rejItem.productId);
                                            if (itemIdx !== -1) {
                                              const currentQty = newItems[itemIdx].quantity || 0;
                                              const rejQty = rejItem.quantity || 0;
                                              newItems[itemIdx].quantity = Math.max(0, currentQty - rejQty);
                                              
                                              if (newItems[itemIdx].actualQuantity !== undefined) {
                                                const currentAct = Number(newItems[itemIdx].actualQuantity) || 0;
                                                const rejAct = rejItem.actualQuantity !== undefined ? Number(rejItem.actualQuantity) : rejQty;
                                                newItems[itemIdx].actualQuantity = Math.max(0, currentAct - rejAct);
                                              }
                                              if (newItems[itemIdx].billedQuantity !== undefined) {
                                                const currentBilled = Number(newItems[itemIdx].billedQuantity) || 0;
                                                const rejBilled = rejItem.billedQuantity !== undefined ? Number(rejItem.billedQuantity) : rejQty;
                                                newItems[itemIdx].billedQuantity = Math.max(0, currentBilled - rejBilled);
                                              }

                                              newItems[itemIdx].amount = (newItems[itemIdx].billedQuantity !== undefined ? Number(newItems[itemIdx].billedQuantity) : (newItems[itemIdx].quantity || 0)) * (newItems[itemIdx].rate || 0);
                                            }
                                          });
                                        }
                                      });
                                    }

                                    // Find if it's a tracking note (RN/DN)
                                    const isTrackingNote = sourceVoucher.type === 'Delivery Note' || sourceVoucher.type === 'Receipt Note';
                                    const shouldSkipStock = ['Sales', 'Purchase'].includes(formData.type as string) && isTrackingNote;

                                    setFormData({
                                      ...formData,
                                      referenceOrderNo: orderNo,
                                      referenceVoucherId: sourceVoucher.id,
                                      salesPurchaseLedgerId: sourceVoucher.salesPurchaseLedgerId || formData.salesPurchaseLedgerId,
                                      skipStockUpdate: shouldSkipStock,
                                      items: newItems.length > 0 ? newItems : [{ productId: '', productName: '', quantity: 1, rate: 0, amount: 0 }],
                                      narration: `Against ${sourceVoucher.type}: ${orderNo}. ${sourceVoucher.narration || ''}`
                                    });
                                    if (shouldSkipStock) {
                                      toast.success(`Loaded from ${sourceVoucher.type}: Inventory update will be skipped for this bill as it was handled by the note.`);
                                    } else {
                                      toast.success(`Loaded items from ${sourceVoucher.type}: ${orderNo}`);
                                    }
                                  } else {
                                    setFormData({ ...formData, referenceOrderNo: orderNo });
                                  }
                                }}
                                className="flex-1 bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all shadow-sm"
                              >
                                <option value="">End of List / Not Applicable</option>
                                {vouchers
                                  .filter(v => {
                                    let targetTypes: string[] = [];
                                    if (formData.type === 'Sales') {
                                      targetTypes = ['Delivery Note', 'Sales Order'];
                                    } else if (formData.type === 'Delivery Note') {
                                      targetTypes = ['Sales Order'];
                                    } else if (formData.type === 'Rejection In') {
                                      targetTypes = ['Delivery Note'];
                                    } else if (formData.type === 'Purchase') {
                                      targetTypes = ['Receipt Note', 'Purchase Order'];
                                    } else if (formData.type === 'Receipt Note') {
                                      targetTypes = ['Purchase Order'];
                                    } else if (formData.type === 'Rejection Out') {
                                      targetTypes = ['Receipt Note'];
                                    }
                                    return targetTypes.includes(v.type) && v.ledgerId === formData.ledgerId && (v.orderNumber || v.voucherNumber);
                                  })
                                  .map(v => {
                                    const refNo = v.orderNumber || v.voucherNumber;
                                    return (
                                      <option key={v.id} value={refNo}>{refNo} ({v.type} - {v.date})</option>
                                    );
                                  })
                                }
                              </select>
                            </div>
                          </div>
                        )}

                        {formData.skipStockUpdate && (
                          <div className="flex items-center ml-[152px] -mt-1 mb-2">
                             <div className="flex items-center text-[10px] text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 font-bold">
                               <AlertCircle className="w-3 h-3 mr-1" />
                               Inventory already updated via tracking note. Skipping stock adjustment for this bill.
                             </div>
                          </div>
                        )}

                        <div className="flex items-center">
                          <label className="w-36 text-xs font-bold text-gray-700 uppercase tracking-wide">
                            {['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type) ? 'Sales Ledger' : 'Purchase Ledger'}
                          </label>
                          <span className="mr-3 text-gray-400 font-bold">:</span>
                          <div className="flex-1 flex items-center group relative">
                            <select
                              data-tally-field="salesPurchaseLedgerId"
                              required
                              value={formData.salesPurchaseLedgerId || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__AUTO_CREATE_PURCHASE__') {
                                  handleCreateDefaultPurchaseLedger();
                                  return;
                                }
                                if (val === '__AUTO_CREATE_SALES__') {
                                  handleCreateDefaultSalesLedger();
                                  return;
                                }
                                setFormData({ ...formData, salesPurchaseLedgerId: val });
                              }}
                              className="flex-1 bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all shadow-sm"
                            >
                              <option value="">Select {['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type as string) ? 'Sales' : 'Purchase'} Ledger</option>
                              {['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) ? (
                                <>
                                  {matchingPurchaseLedgers.length > 0 ? (
                                    <optgroup label="Purchase Accounts">
                                      {matchingPurchaseLedgers.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                    </optgroup>
                                  ) : (
                                    <option value="__AUTO_CREATE_PURCHASE__" className="text-teal-700 font-bold">
                                      ⚡ No Purchase Ledger found — Click to create "Purchase A/c"
                                    </option>
                                  )}
                                  {otherExpenseLedgers.length > 0 && (
                                    <optgroup label="Direct / Indirect Expenses">
                                      {otherExpenseLedgers.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="All Other Ledgers">
                                    {ledgers
                                      .filter(l => !matchingPurchaseLedgers.some(m => m.id === l.id) && !otherExpenseLedgers.some(m => m.id === l.id))
                                      .map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                  </optgroup>
                                </>
                              ) : (
                                <>
                                  {matchingSalesLedgers.length > 0 ? (
                                    <optgroup label="Sales Accounts">
                                      {matchingSalesLedgers.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                    </optgroup>
                                  ) : (
                                    <option value="__AUTO_CREATE_SALES__" className="text-teal-700 font-bold">
                                      ⚡ No Sales Ledger found — Click to create "Sales A/c"
                                    </option>
                                  )}
                                  {otherIncomeLedgers.length > 0 && (
                                    <optgroup label="Direct / Indirect Incomes">
                                      {otherIncomeLedgers.map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="All Other Ledgers">
                                    {ledgers
                                      .filter(l => !matchingSalesLedgers.some(m => m.id === l.id) && !otherIncomeLedgers.some(m => m.id === l.id))
                                      .map(l => (
                                        <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                      ))}
                                  </optgroup>
                                </>
                              )}
                            </select>
                            {formData.salesPurchaseLedgerId && (
                              <button
                                type="button"
                                onClick={() => {
                                  const selectedLedger = ledgers.find(l => l.id === formData.salesPurchaseLedgerId);
                                  if (selectedLedger) {
                                    setQuickLedgerTarget('salesPurchaseLedgerId');
                                    setQuickLedgerData(selectedLedger);
                                    setIsQuickLedgerModalOpen(true);
                                  }
                                }}
                                className="ml-1 p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                                title="Quick Edit Ledger"
                              >
                                <Edit2 size={14} />
                              </button>
                            )}
                            {['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note', 'Rejection Out'].includes(formData.type as string) && matchingPurchaseLedgers.length === 0 && (
                              <button
                                type="button"
                                onClick={handleCreateDefaultPurchaseLedger}
                                className="ml-2 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-xs flex items-center gap-1 shrink-0"
                                title="Quick Create Default Purchase A/c"
                              >
                                <Plus size={13} /> Create Purchase A/c
                              </button>
                            )}
                            {['Sales', 'Credit Note', 'Sales Order', 'Delivery Note', 'Rejection In'].includes(formData.type as string) && matchingSalesLedgers.length === 0 && (
                              <button
                                type="button"
                                onClick={handleCreateDefaultSalesLedger}
                                className="ml-2 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-xs flex items-center gap-1 shrink-0"
                                title="Quick Create Default Sales A/c"
                              >
                                <Plus size={13} /> Create Sales A/c
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setQuickLedgerTarget('salesPurchaseLedgerId');
                                setQuickLedgerData({ 
                                  name: ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note'].includes(formData.type as string) ? 'Sales A/c' : 'Purchase A/c', 
                                  group: ['Sales', 'Credit Note', 'Sales Order', 'Delivery Note'].includes(formData.type as string) ? 'Sales Accounts' : 'Purchase Accounts',
                                  openingBalance: 0,
                                  currentBalance: 0
                                });
                                setIsQuickLedgerModalOpen(true);
                              }}
                              className="ml-2 p-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                              title="Quick Create Ledger (Alt+C)"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        {formData.salesPurchaseLedgerId && (
                          <div className="flex items-center -mt-1.5">
                            <div className="w-36"></div>
                            <span className="mr-3 ml-1 text-transparent">:</span>
                            <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-sm border border-teal-100">
                              Current Balance: {formatBalance(ledgerBalances[formData.salesPurchaseLedgerId] || 0)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Manufacturing Journal custom inputs */}
                {formData.type === 'Manufacturing Journal' && (
                  <div className="space-y-4 mb-6 max-w-4xl border border-dashed border-[#004d5a]/30 bg-[#004d5a]/5 p-4 rounded-sm pb-5 font-mono text-slate-800">
                    <p className="text-xs uppercase font-bold text-[#004d5a] border-b border-[#004d5a]/20 pb-2 mb-3">🛠️ Manufacturing details (Assembling Finished Item)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Product to Manufacture */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                          Finished Good Item
                        </label>
                        <select
                          value={formData.manufacturedProductId || ''}
                          onChange={(e) => {
                            const pId = e.target.value;
                            const product = products.find(p => p.id === pId);
                            const qty = formData.manufacturedQuantity || 1;
                            
                            // Auto fill items from BOM magnified by qty
                            let initialItems: any[] = [];
                            if (product && product.enableBom && product.bom) {
                              initialItems = product.bom.map(bomItem => {
                                const compProd = products.find(p => p.id === bomItem.productId);
                                const reqQty = bomItem.quantity * qty;
                                const price = compProd ? (compProd.purchasePrice || compProd.salesPrice || 0) : 0;
                                return {
                                  productId: bomItem.productId,
                                  productName: compProd?.name || '',
                                  quantity: reqQty,
                                  rate: price,
                                  amount: reqQty * price,
                                  godownId: formData.manufacturedGodownId || ''
                                };
                              });
                            }
                            
                            setFormData({
                              ...formData,
                              manufacturedProductId: pId,
                              items: initialItems
                            });
                          }}
                          className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all"
                          required
                        >
                          <option value="">-- Choose Finished Item with BOM predefined --</option>
                          {products
                            .filter(p => p.enableBom)
                            .map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                        </select>
                      </div>

                      {/* Godown */}
                      {activeCompany?.enableGodowns && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                            Store Manufactured Item in Godown
                          </label>
                          <select
                            value={formData.manufacturedGodownId || ''}
                            onChange={(e) => {
                              const gId = e.target.value;
                              const updatedItems = (formData.items || []).map(item => ({
                                ...item,
                                godownId: item.godownId || gId
                              }));
                              setFormData({
                                ...formData,
                                manufacturedGodownId: gId,
                                items: updatedItems
                              });
                            }}
                            className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all"
                            required
                          >
                            <option value="">-- Select Destination Godown --</option>
                            {godowns.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Quantity */}
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                          Quantity of Finished Item to Produce
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0.00001"
                            step="any"
                            value={formData.manufacturedQuantity || ''}
                            onChange={(e) => {
                              const qty = Number(e.target.value) || 0;
                              const product = products.find(p => p.id === formData.manufacturedProductId);
                              
                              // Recalculate components quantities and amounts
                              let updatedItems = (formData.items || []).map((item, idx) => {
                                if (product && product.enableBom && product.bom && product.bom[idx]) {
                                  const bomQtyFactor = product.bom[idx].quantity;
                                  const newQty = bomQtyFactor * qty;
                                  return {
                                    ...item,
                                    quantity: newQty,
                                    amount: newQty * (item.rate || 0)
                                  };
                                }
                                return item;
                              });
                              
                              setFormData({
                                ...formData,
                                manufacturedQuantity: qty,
                                items: updatedItems
                              });
                            }}
                            className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] p-2 text-xs font-bold font-mono outline-none rounded-sm transition-all"
                            placeholder="Specify manufacture batch quantity"
                            required
                          />
                          <span className="self-center font-bold text-xs text-slate-600 bg-slate-100 border border-slate-300 px-4 py-2 text-center shrink-0">
                            {products.find(p => p.id === formData.manufacturedProductId)?.unit || 'Units'}
                          </span>
                        </div>
                      </div>

                      {/* Live Cost Calculation Card */}
                      {formData.manufacturedProductId && (
                        <div className="md:col-span-2 mt-2 bg-teal-50 border border-teal-200/50 p-3 rounded-none flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-slate-800">
                          <div>
                            <p className="text-[10px] text-teal-700 uppercase font-bold tracking-wider">Estimated Production Cost Summary</p>
                            <h4 className="text-xs font-bold mt-0.5">
                              Producing {formData.manufacturedQuantity || 0} {products.find(p => p.id === formData.manufacturedProductId)?.unit || 'unit(s)'} of <span className="text-[#004d5a] font-extrabold font-mono">{products.find(p => p.id === formData.manufacturedProductId)?.name}</span>
                            </h4>
                          </div>
                          <div className="flex gap-4 md:text-right text-xs">
                            <div className="border-l md:border-l-0 md:border-r border-teal-200 px-3 md:pl-0 md:pr-4">
                              <p className="text-[10px] text-slate-500 uppercase">Total Material Cost</p>
                              <p className="font-extrabold text-[#004d5a] font-mono">
                                {formatCurrency((formData.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0))}
                              </p>
                            </div>
                            <div className="border-r border-teal-200 pr-4">
                              <p className="text-[10px] text-slate-500 uppercase">Additional Costs</p>
                              <p className="font-extrabold text-orange-600 font-mono">
                                + {formatCurrency((formData.additionalCharges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0))}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-teal-700 uppercase font-black tracking-wider">Effective Cost Per 1 {products.find(p => p.id === formData.manufacturedProductId)?.unit || 'Pc'}</p>
                              <p className="text-sm font-black text-rose-600 font-mono">
                                {formatCurrency((formData.manufacturedQuantity || 0) > 0 ? (((formData.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0) + (formData.additionalCharges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0)) / (Number(formData.manufacturedQuantity) || 1)) : 0)} / {products.find(p => p.id === formData.manufacturedProductId)?.unit || 'Pc'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* No Stock Items alert banner for Invoice vouchers */}
                {formData.mode === 'Invoice' && products.length === 0 && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Is company me abhi koi Stock Item nahi hai. Entry karne ke liye stock item banayein ya sample items add karein:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickProductTargetIndex(0);
                          setQuickProductData({ name: '', hsnCode: '', unit: 'Pcs', openingStock: 0, stockQuantity: 0, purchasePrice: 0, salesPrice: 0, gstRate: 18, decimalPlaces: 0 });
                          setIsQuickProductModalOpen(true);
                        }}
                        className="px-3 py-1 bg-[#004d5a] hover:bg-[#003842] text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
                      >
                        <Plus size={14} /> + Naya Stock Item Banayein (Alt+C)
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateSampleProducts}
                        className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs shrink-0 cursor-pointer"
                        title="3 Sample items create karein (Item A, Item B, Raw Material)"
                      >
                        <Sparkles size={14} /> ⚡ 3 Sample Items Banayein
                      </button>
                    </div>
                  </div>
                )}

                {/* Particulars Table */}
                <div className="border border-gray-450 bg-white rounded-sm overflow-hidden mt-4">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="bg-[#004d5a] text-white border-b border-gray-300">
                        {formData.mode === 'Double Entry' && (
                          <th className="text-left py-2.5 px-3 font-bold w-16 uppercase tracking-wider text-[#ffcb2b] border-r border-[#005a69]">Dr/Cr</th>
                        )}
                        {formData.mode === 'Invoice' ? (
                          <>
                            <th className="text-left py-2.5 px-4 font-bold min-w-[120px] uppercase tracking-wider text-gray-100">Item Name</th>
                            {showGodown && (
                              <th className="text-left py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">{formData.type === 'Stock Journal' ? 'Src Godown' : 'Godown'}</th>
                            )}
                            {showGodown && formData.type === 'Stock Journal' && (
                              <th className="text-left py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Dst Godown</th>
                            )}
                            {showBatch && (
                              <>
                                <th className="text-left py-2.5 px-4 font-bold min-w-[80px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Batch</th>
                                <th className="text-left py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Mfg Date</th>
                                <th className="text-left py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Exp Date</th>
                              </>
                            )}
                            {showSeparateQty ? (
                              <>
                                <th className="text-right py-2.5 px-4 font-bold min-w-[80px] border-l border-gray-300 uppercase tracking-wider text-amber-300">Actual Qty</th>
                                <th className="text-right py-2.5 px-4 font-bold min-w-[80px] border-l border-gray-300 uppercase tracking-wider text-blue-300">Billed Qty</th>
                              </>
                            ) : (
                              <th className="text-right py-2.5 px-4 font-bold min-w-[80px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Quantity</th>
                            )}
                            <th className="text-right py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Rate</th>
                            {showDiscount && (
                              <th className="text-right py-2.5 px-4 font-bold min-w-[80px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Disc %</th>
                            )}
                            <th className="text-right py-2.5 px-4 font-bold min-w-[100px] border-l border-gray-300 uppercase tracking-wider text-gray-100">Amount</th>
                          </>
                        ) : (
                          <>
                            <th className="text-left py-2.5 px-4 font-bold w-[60%] uppercase tracking-wider text-gray-100 font-mono">Particulars</th>
                            <th className="text-right py-2.5 px-4 border-l border-gray-300 font-bold w-[40%] uppercase tracking-wider text-gray-100 font-mono">Amount</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(formData.items || []).map((item, index) => (
                        <tr key={index} className="hover:bg-[#fcfcf0] group transition-colors">
                          {formData.mode === 'Double Entry' && (
                            <td className="py-2 px-3 border-r border-gray-200">
                             <select
                                data-tally-field={`item-type-${index}`}
                                value={item.type || 'Dr'}
                                onChange={(e) => updateItem(index, 'type', e.target.value)}
                                className="w-full border border-gray-200 bg-transparent focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-600 focus:border-teal-600 rounded p-1 text-xs font-mono font-bold outline-none uppercase transition-colors"
                              >
                                <option value="Dr">Dr</option>
                                <option value="Cr">Cr</option>
                              </select>
                            </td>
                          )}
                          <td className="py-2 px-3">
                            <div className="flex flex-col group relative">
                              <div className="flex items-center">
                                {formData.mode === 'Invoice' ? (
                                  <div className="flex-1 flex items-center gap-1 relative">
                                    <select
                                      data-tally-field={`item-name-${index}`}
                                      value={item.productId || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '__CREATE_NEW_ITEM__') {
                                          setQuickProductTargetIndex(index);
                                          setQuickProductData({
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
                                          setIsQuickProductModalOpen(true);
                                          return;
                                        }
                                        if (val === '__CREATE_SAMPLE_ITEMS__') {
                                          handleCreateSampleProducts();
                                          return;
                                        }
                                        updateItem(index, 'productId', val);
                                      }}
                                      className="flex-1 bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-1.5 text-xs font-mono font-bold outline-none rounded-sm transition-all shadow-2xs cursor-pointer"
                                    >
                                      <option value="">-- Select Stock Item / Product --</option>
                                      {products.length === 0 ? (
                                        <>
                                          <option value="__CREATE_NEW_ITEM__" className="text-teal-700 font-bold">
                                            ➕ + Naya Stock Item Banayein (Alt+C)
                                          </option>
                                          <option value="__CREATE_SAMPLE_ITEMS__" className="text-blue-700 font-bold">
                                            ⚡ 3 Sample Items Add Karein
                                          </option>
                                        </>
                                      ) : (
                                        <>
                                          {products.map(p => {
                                            const rate = ['Purchase', 'Debit Note', 'Purchase Order', 'Receipt Note'].includes(formData.type as string)
                                              ? (p.purchasePrice || 0)
                                              : (p.salesPrice || 0);
                                            return (
                                              <option key={p.id} value={p.id}>
                                                {p.name} [{p.stockQuantity || 0} {p.unit || 'PCS'} in Stock | {currencySymbol}{rate}]
                                              </option>
                                            );
                                          })}
                                          <option value="__CREATE_NEW_ITEM__" className="text-teal-700 font-bold">
                                            ➕ + Naya Stock Item Banayein (Alt+C)
                                          </option>
                                        </>
                                      )}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuickProductTargetIndex(index);
                                        setQuickProductData({
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
                                        setIsQuickProductModalOpen(true);
                                      }}
                                      className="p-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded border border-teal-200 transition-colors shrink-0"
                                      title="Create new stock item (Alt+C)"
                                    >
                                      <Plus size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex-1 relative">
                                    <select
                                      data-tally-field={`item-name-${index}`}
                                      value={item.ledgerId || ''}
                                      onChange={(e) => updateItem(index, 'ledgerId', e.target.value)}
                                      className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-1.5 text-xs font-mono font-bold outline-none rounded-sm transition-all shadow-2xs cursor-pointer"
                                    >
                                      <option value="">-- Select Ledger Account --</option>
                                      {ledgers
                                        .filter(l => {
                                          if (formData.mode !== 'Double Entry') {
                                            const cashBankGroups = ['Cash-in-Hand', 'Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'];
                                            if (formData.type === 'Payment' || formData.type === 'Receipt') {
                                              return !cashBankGroups.includes(l.group);
                                            }
                                            if (formData.type === 'Contra') {
                                              return cashBankGroups.includes(l.group);
                                            }
                                          }
                                          return true;
                                        })
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(l => (
                                          <option key={l.id} value={l.id}>{l.name} ({l.group})</option>
                                        ))}
                                    </select>
                                  </div>
                                )}
                                {formData.mode !== 'Invoice' && item.ledgerId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const selectedLedger = ledgers.find(l => l.id === item.ledgerId);
                                      if (selectedLedger) {
                                        setQuickLedgerTargetIndex(index);
                                        setQuickLedgerData(selectedLedger);
                                        setIsQuickLedgerModalOpen(true);
                                      }
                                    }}
                                    className="ml-1 p-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200 transition-colors shrink-0"
                                    title="Quick edit ledger"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (formData.mode === 'Invoice') {
                                      setQuickProductTargetIndex(index);
                                      setQuickProductData({
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
                                      setIsQuickProductModalOpen(true);
                                    } else {
                                      setQuickLedgerTargetIndex(index);
                                      setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
                                      setIsQuickLedgerModalOpen(true);
                                    }
                                  }}
                                  className="ml-1.5 p-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded border border-teal-200 transition-colors shrink-0"
                                  title={formData.mode === 'Invoice' ? "Quick create stock item (Alt+C)" : "Quick create ledger (Alt+C)"}
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="ml-1 p-1 bg-red-50 text-red-600 hover:bg-red-100 rounded border border-red-200 transition-colors shrink-0"
                                  title="Delete row"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              {/* Dynamic Stock Indicator / Ledger Balance */}
                              {formData.mode === 'Invoice' && item.productId && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    📦 In Stock: {products.find(p => p.id === item.productId)?.stockQuantity || 0} {products.find(p => p.id === item.productId)?.unit || 'PCS'}
                                  </span>
                                  {products.find(p => p.id === item.productId)?.hsnCode && (
                                    <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                      HSN: {products.find(p => p.id === item.productId)?.hsnCode}
                                    </span>
                                  )}
                                </div>
                              )}
                              {formData.mode !== 'Invoice' && item.ledgerId && (
                                <span className="text-[10px] font-bold text-teal-700 ml-1 mt-0.5 uppercase bg-teal-50 px-1 py-0.2 rounded-sm max-w-fit border border-teal-100">
                                  Current Bal: {formatBalance(ledgerBalances[item.ledgerId] || 0)}
                                </span>
                              )}
                            </div>
                          </td>
                          {formData.mode === 'Invoice' && (
                            <>
                              {showGodown && (
                                <td className="py-1 px-3 border-l border-gray-200">
                                  <div className="flex items-center group">
                                    <div className="flex-1 relative">
                                      <input
                                        list={`godown-list-${index}`}
                                        value={item.godownId ? (godowns.find(g => g.id === item.godownId)?.name || item.godownId) : ''}
                                        onChange={(e) => {
                                          const godown = godowns.find(g => g.name === e.target.value);
                                          if (godown) {
                                            updateItem(index, 'godownId', godown.id);
                                          } else {
                                            updateItem(index, 'godownId', e.target.value);
                                          }
                                        }}
                                        placeholder="Main Location"
                                        className="w-full border-none bg-transparent focus:bg-[#ffffcc] p-1 outline-none font-semibold text-xs text-gray-800"
                                      />
                                      {item.productId && (item.godownId || 'Main Location') && (
                                        <div className="text-[9px] text-gray-500 font-medium px-1 pb-1 truncate max-w-[100px]">
                                          Stock: {calculateGodownStock(item.productId, item.godownId || 'Main Location', vouchers)} {products.find(p => p.id === item.productId)?.unit || ''}
                                        </div>
                                      )}
                                      <datalist id={`godown-list-${index}`}>
                                        {godowns.map(g => (
                                          <option key={g.id} value={g.name} />
                                        ))}
                                        <option value="Main Location" />
                                      </datalist>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        // Quick Create Godown logic
                                        const currentVal = item.godownId || '';
                                        if (currentVal && !godowns.find(g => g.id === currentVal) && currentVal !== 'Main Location') {
                                          try {
                                            const newGodown = {
                                              name: currentVal,
                                              companyId: activeCompany!.id,
                                              createdBy: auth.currentUser!.uid,
                                              createdAt: new Date().toISOString()
                                            };
                                            const docRef = await addDoc(collection(db, 'godowns'), newGodown);
                                            updateItem(index, 'godownId', docRef.id);
                                            toast.success(`Godown '${currentVal}' created.`);
                                          } catch (e: any) {
                                            toast.error('Failed to create Godown');
                                          }
                                        } else if (!currentVal || currentVal === 'Main Location') {
                                          toast.info('Type a new godown name first, then click +');
                                        }
                                      }}
                                      className="ml-1.5 p-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Quick create"
                                    >
                                      <Plus size={10} />
                                    </button>
                                  </div>
                                </td>
                              )}
                              {showGodown && formData.type === 'Stock Journal' && (
                                <td className="py-1 px-3 border-l border-gray-200">
                                  <div className="flex items-center group">
                                    <div className="flex-1 relative">
                                      <input
                                        list={`dst-godown-list-${index}`}
                                        value={item.destinationGodownId ? (godowns.find(g => g.id === item.destinationGodownId)?.name || item.destinationGodownId) : ''}
                                        onChange={(e) => {
                                          const godown = godowns.find(g => g.name === e.target.value);
                                          if (godown) {
                                            updateItem(index, 'destinationGodownId', godown.id);
                                          } else {
                                            updateItem(index, 'destinationGodownId', e.target.value);
                                          }
                                        }}
                                        placeholder="Main Location"
                                        className="w-full border-none bg-transparent focus:bg-[#ffffcc] p-1 outline-none font-semibold text-xs text-gray-800"
                                      />
                                      {item.productId && (item.destinationGodownId || 'Main Location') && (
                                        <div className="text-[9px] text-gray-500 font-medium px-1 pb-1 truncate max-w-[100px]">
                                          Stock: {calculateGodownStock(item.productId, item.destinationGodownId || 'Main Location', vouchers)} {products.find(p => p.id === item.productId)?.unit || ''}
                                        </div>
                                      )}
                                      <datalist id={`dst-godown-list-${index}`}>
                                        {godowns.map(g => (
                                          <option key={g.id} value={g.name} />
                                        ))}
                                        <option value="Main Location" />
                                      </datalist>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const currentVal = item.destinationGodownId || '';
                                        if (currentVal && !godowns.find(g => g.id === currentVal) && currentVal !== 'Main Location') {
                                          try {
                                            const newGodown = {
                                              name: currentVal,
                                              companyId: activeCompany!.id,
                                              createdBy: auth.currentUser!.uid,
                                              createdAt: new Date().toISOString()
                                            };
                                            const docRef = await addDoc(collection(db, 'godowns'), newGodown);
                                            updateItem(index, 'destinationGodownId', docRef.id);
                                            toast.success(`Godown '${currentVal}' created.`);
                                          } catch (e: any) {
                                            toast.error('Failed to create Godown');
                                          }
                                        } else if (!currentVal || currentVal === 'Main Location') {
                                          toast.info('Type a new godown name first, then click +');
                                        }
                                      }}
                                      className="ml-1.5 p-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Quick create"
                                    >
                                      <Plus size={10} />
                                    </button>
                                  </div>
                                </td>
                              )}
                              {showBatch && (
                                <>
                                  <td className="py-1 px-3 border-l border-gray-200">
                                    <input
                                      type="text"
                                      data-tally-field={`item-batch-${index}`}
                                      value={item.batchNumber || ''}
                                      onChange={(e) => updateItem(index, 'batchNumber', e.target.value)}
                                      placeholder="Primary Batch"
                                      className="w-full border-none bg-transparent focus:bg-[#ffffcc] p-1 outline-none font-semibold text-xs text-gray-800"
                                    />
                                  </td>
                                  <td className="py-1 px-3 border-l border-gray-200">
                                    <input
                                      type="date"
                                      data-tally-field={`item-mfg-${index}`}
                                      value={item.manufacturingDate || ''}
                                      onChange={(e) => updateItem(index, 'manufacturingDate', e.target.value)}
                                      className="w-full border-none bg-transparent focus:bg-[#ffffcc] p-1 outline-none font-semibold text-xs text-gray-800"
                                    />
                                  </td>
                                  <td className="py-1 px-3 border-l border-gray-200">
                                    <input
                                      type="date"
                                      data-tally-field={`item-exp-${index}`}
                                      value={item.expiryDate || ''}
                                      onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                                      className="w-full border-none bg-transparent focus:bg-[#ffffcc] p-1 outline-none font-semibold text-xs text-gray-800"
                                    />
                                  </td>
                                </>
                              )}
                              {showSeparateQty ? (
                                <>
                                  <td className="py-1 px-3 border-l border-gray-200">
                                    <input
                                      type="number"
                                      data-tally-field={`item-actualQty-${index}`}
                                      value={item.actualQuantity !== undefined ? item.actualQuantity : (item.quantity !== undefined ? item.quantity : '')}
                                      onChange={(e) => updateItem(index, 'actualQuantity', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="0"
                                      className="w-full border-none bg-transparent focus:bg-[#ffffcc] text-right p-1 outline-none font-semibold text-xs text-amber-950"
                                      min="0"
                                      step="any"
                                    />
                                  </td>
                                  <td className="py-1 px-3 border-l border-gray-200">
                                    <input
                                      type="number"
                                      data-tally-field={`item-billedQty-${index}`}
                                      value={item.billedQuantity !== undefined ? item.billedQuantity : (item.quantity !== undefined ? item.quantity : '')}
                                      onChange={(e) => updateItem(index, 'billedQuantity', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="0"
                                      className="w-full border-none bg-transparent focus:bg-[#ffffcc] text-right p-1 outline-none font-semibold text-xs text-blue-950"
                                      min="0"
                                      step="any"
                                    />
                                  </td>
                                </>
                              ) : (
                                <td className="py-1 px-3 border-l border-gray-200">
                                  <input
                                    type="number"
                                    data-tally-field={`item-quantity-${index}`}
                                    value={item.quantity !== undefined ? item.quantity : ''}
                                    onChange={(e) => updateItem(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full border-none bg-transparent focus:bg-[#ffffcc] text-right p-1 outline-none font-semibold"
                                    min="0"
                                    step="any"
                                  />
                                </td>
                              )}
                              <td className="py-1 px-3 border-l border-gray-200">
                                <input
                                  type="number"
                                  data-tally-field={`item-rate-${index}`}
                                  value={item.rate !== undefined ? item.rate : ''}
                                  onChange={(e) => updateItem(index, 'rate', e.target.value === '' ? '' : Number(e.target.value))}
                                  placeholder="0.00"
                                  className="w-full border-none bg-transparent focus:bg-[#ffffcc] text-right p-1 outline-none font-semibold"
                                  min="0"
                                  step="any"
                                />
                              </td>
                              {showDiscount && (
                                <td className="py-1 px-3 border-l border-gray-200">
                                  <input
                                    type="number"
                                    data-tally-field={`item-discount-${index}`}
                                    value={item.discount !== undefined ? item.discount : ''}
                                    onChange={(e) => updateItem(index, 'discount', e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0%"
                                    className="w-full border-none bg-transparent focus:bg-[#ffffcc] text-right p-1 outline-none font-semibold"
                                    min="0"
                                    max="100"
                                    step="any"
                                  />
                                </td>
                              )}
                            </>
                          )}
                          <td className="py-1 px-3 border-l border-gray-200 text-right">
                            <input
                              type="number"
                              data-tally-field={`item-amount-${index}`}
                              value={item.amount !== undefined ? item.amount : 0}
                              onChange={(e) => updateItem(index, 'amount', Number(e.target.value))}
                              onBlur={() => {
                                if (formData.mode !== 'Invoice' && item.ledgerId) {
                                  const ledger = ledgers.find(l => l.id === item.ledgerId);
                                  if (ledger?.costCentersEnabled && (!item.costCenterAllocations || item.costCenterAllocations.length === 0)) {
                                    setCostCenterModal({ index });
                                  }
                                }
                              }}
                              className="w-full border-none bg-[#f1f3f1] focus:bg-[#ffffcc] text-right font-bold p-1 outline-none rounded-sm border border-gray-200 focus:border-teal-600 focus:ring-0"
                              step="any"
                            />
                            {formData.mode !== 'Invoice' && item.ledgerId && ledgers.find(l => l.id === item.ledgerId)?.costCentersEnabled && (
                              <button
                                type="button"
                                onClick={() => setCostCenterModal({ index })}
                                className="block w-full mt-1 text-[9px] font-bold text-center text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 py-0.5 rounded transition-colors"
                              >
                                Allocations ({item.costCenterAllocations?.length || 0})
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Add Item Row */}
                      <tr className="border-b border-gray-50 bg-[#fafafa]">
                        <td className="py-2 px-4" colSpan={formData.mode === 'Double Entry' ? 2 : 1}>
                          <button
                            type="button"
                            onClick={addItem}
                            className="text-[#004d5a] hover:text-[#003c47] text-[11px] font-bold flex items-center gap-1 bg-white border border-gray-350 px-2 py-1 rounded shadow-xs active:scale-95 transition-all"
                          >
                            <Plus size={12} /> {formData.mode === 'Invoice' ? 'Add Item Line' : 'Add Particular'}
                          </button>
                        </td>
                        <td
                          className="px-4 border-l border-gray-50"
                          colSpan={formData.mode === 'Invoice' ? (invoiceTotalCols - 1) : 1}
                        ></td>
                      </tr>
                      {/* Empty rows for visual layout space matching classic accounting sheets */}
                      {[...Array(Math.max(0, 4 - (formData.items?.length || 0)))].map((_, i) => (
                        <tr key={i} className="h-9 border-b border-gray-50 text-[13px]">
                          {formData.mode === 'Double Entry' && <td className="px-4 border-r border-gray-50 h-full"></td>}
                          <td className="px-4 h-full" colSpan={formData.mode === 'Invoice' ? (invoiceTotalCols - 1) : 1}></td>
                          <td className="px-4 border-l border-gray-50 h-full"></td>
                        </tr>
                      ))}

                      {/* Dynamic Subtotal and Taxes rows calculated live */}
                      {formData.mode !== 'Double Entry' && (
                        <>
                          <tr className="border-t-2 border-gray-300 font-bold bg-[#fafafa] text-[12px]">
                            <td className="py-1.5 px-4 text-left text-gray-700">Subtotal</td>
                            {formData.mode === 'Invoice' && (
                              <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                            )}
                            <td className="py-1.5 px-4 border-l border-gray-200 text-right text-gray-800">
                              {formatCurrency(formData.amount || 0)}
                            </td>
                          </tr>

                          {formData.withTax && (formData.taxType === 'GST' || !formData.taxType) && !formData.isInterState && (
                            <>
                              <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                                <td className="py-1 px-4 text-left text-gray-600 font-medium">
                                  CGST {(Number(formData.gstRate) || 18) / 2}%
                                </td>
                                {formData.mode === 'Invoice' && (
                                  <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                                )}
                                <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                  {formatCurrency(formData.cgst || 0)}
                                </td>
                              </tr>
                              <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                                <td className="py-1 px-4 text-left text-gray-600 font-medium font-mono">
                                  SGST {(Number(formData.gstRate) || 18) / 2}%
                                </td>
                                {formData.mode === 'Invoice' && (
                                  <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                                )}
                                <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                  {formatCurrency(formData.sgst || 0)}
                                </td>
                              </tr>
                            </>
                          )}

                          {formData.withTax && (formData.taxType === 'GST' || !formData.taxType) && formData.isInterState && (
                            <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                              <td className="py-1 px-4 text-left text-gray-600 font-medium">
                                IGST {formData.gstRate || 18}%
                              </td>
                              {formData.mode === 'Invoice' && (
                                <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                              )}
                              <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                {formatCurrency(formData.igst || 0)}
                              </td>
                            </tr>
                          )}

                          {formData.withTax && (formData.taxType === 'VAT' || formData.taxType === 'Sales Tax' || formData.taxType === 'Tax') && (
                            <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                              <td className="py-1 px-4 text-left text-gray-600 font-medium">
                                {(formData.taxType === 'Sales Tax' ? 'Sales Tax' : formData.taxType === 'Tax' ? 'Tax' : 'VAT')} {formData.gstRate !== undefined ? formData.gstRate : defaultTaxRate}%
                              </td>
                              {formData.mode === 'Invoice' && (
                                <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                              )}
                              <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                {formatCurrency(formData.vatAmount || 0)}
                              </td>
                            </tr>
                          )}

                          {formData.withTax && formData.taxType === 'TDS' && (
                            <tr className="border-t border-gray-200 text-[11px] bg-red-50/50">
                              <td className="py-1 px-4 text-left text-red-700 font-bold font-mono">
                                TDS Deduction (-) {formData.gstRate || 18}%
                              </td>
                              {formData.mode === 'Invoice' && (
                                <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                              )}
                              <td className="py-1 px-4 border-l border-gray-200 text-right text-red-700 font-extrabold">
                                -{formatCurrency(formData.tdsAmount || 0)}
                              </td>
                            </tr>
                          )}

                          {formData.withTax && formData.taxType === 'Excise' && (
                            <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                              <td className="py-1 px-4 text-left text-gray-600 font-medium">
                                Excise Duty {formData.gstRate || 18}%
                              </td>
                              {formData.mode === 'Invoice' && (
                                <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                              )}
                              <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                {formatCurrency(formData.exciseAmount || 0)}
                              </td>
                            </tr>
                          )}

                          {formData.withTax && formData.taxType === 'Service Tax' && (
                            <tr className="border-t border-gray-200 text-[11px] bg-[#fafafa]">
                              <td className="py-1 px-4 text-left text-gray-600 font-medium">
                                Service Tax {formData.gstRate || 18}%
                              </td>
                              {formData.mode === 'Invoice' && (
                                <td className="border-l border-gray-200" colSpan={invoiceTotalCols - 2}></td>
                              )}
                              <td className="py-1 px-4 border-l border-gray-200 text-right text-gray-700">
                                {formatCurrency(formData.serviceTaxAmount || 0)}
                              </td>
                            </tr>
                          )}
                        </>
                      )}

                      {/* Grand Total Row with iconic double lines */}
                      <tr className="border-t-2 border-b-4 border-double border-gray-500 font-bold bg-[#faf8f0] text-[13px]">
                        <td className="py-2.5 px-4 text-left text-[#004d5a] uppercase font-bold tracking-wide">
                          Total Amount Value
                        </td>
                        {formData.mode === 'Invoice' && (
                          <>
                            <td className="border-l border-gray-200"></td>
                            <td className="border-l border-gray-200"></td>
                            <td className="border-l border-gray-200"></td>
                          </>
                        )}
                        <td className="py-2.5 px-4 border-l border-gray-200 text-right text-[#004d5a] text-sm font-extrabold">
                          {formatCurrency(formData.totalAmount || 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Additional Costs for Manufacturing Journal */}
                {formData.type === 'Manufacturing Journal' && (
                  <div className="mt-4 border border-teal-200 bg-white rounded-sm overflow-hidden mb-4">
                     <p className="bg-teal-50 px-4 py-2 text-[11px] font-bold text-teal-800 uppercase tracking-wide border-b border-teal-200 flex items-center justify-between">
                       <span>Additional Costs (Power, Labour, Packing, etc.)</span>
                       <span className="text-orange-600 font-mono">
                         {formatCurrency((formData.additionalCharges || []).reduce((s, c) => s + (c.amount || 0), 0))}
                       </span>
                     </p>
                     <table className="w-full text-xs font-mono border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="py-2 px-4 text-left font-bold border-r border-slate-200 uppercase tracking-wider">Ledger Account</th>
                            <th className="py-2 px-4 text-right font-bold uppercase tracking-wider w-40 border-l border-slate-200">Amount</th>
                            <th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(formData.additionalCharges || []).map((charge, idx) => (
                            <tr key={idx} className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                              <td className="p-0 flex items-center border-r border-slate-200 relative group h-full">
                                <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400 group-focus-within:text-teal-600" />
                                <select
                                  value={charge.ledgerId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'create_new_ledger') {
                                      setQuickLedgerTarget('additionalCharge');
                                      setQuickLedgerTargetIndex(idx);
                                      setIsQuickLedgerModalOpen(true);
                                      return;
                                    }
                                    const newCharges = [...(formData.additionalCharges || [])];
                                    newCharges[idx].ledgerId = val;
                                    setFormData({ ...formData, additionalCharges: newCharges });
                                  }}
                                  className="w-full h-full p-2 pl-7 outline-none bg-transparent hover:bg-slate-100 focus:bg-[#ffffcc] transition-colors"
                                >
                                  <option value="">-- Select Expense Ledger --</option>
                                  <option value="create_new_ledger" className="font-bold text-blue-600 bg-blue-50">+ Create New Ledger (Alt+C)</option>
                                  {/* Filter ledgers except bank/cash or just show all for flexibility */}
                                  {ledgers.map(l => (
                                      <option key={l.id} value={l.id}>{l.name}</option>
                                  ))}
                                </select>
                                {charge.ledgerId && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const selectedLedger = ledgers.find(l => l.id === charge.ledgerId);
                                      if (selectedLedger) {
                                        setQuickLedgerTarget('additionalCharge');
                                        setQuickLedgerTargetIndex(idx);
                                        setQuickLedgerData(selectedLedger);
                                        setIsQuickLedgerModalOpen(true);
                                      }
                                    }}
                                    className="mr-1 p-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                    title="Quick edit Ledger"
                                  >
                                    <Edit2 size={10} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickLedgerTarget('additionalCharge');
                                    setQuickLedgerTargetIndex(idx);
                                    setQuickLedgerData({ name: '', group: 'Current Assets', openingBalance: 0, currentBalance: 0 });
                                    setIsQuickLedgerModalOpen(true);
                                  }}
                                  className="ml-1 mr-1 p-1 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  title="Quick create"
                                >
                                  <Plus size={10} />
                                </button>
                              </td>
                              <td className="p-0 border-l border-slate-200 text-right w-40">
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  min="0"
                                  step="any"
                                  value={charge.amount || ''}
                                  onChange={(e) => {
                                    const newCharges = [...(formData.additionalCharges || [])];
                                    newCharges[idx].amount = Number(e.target.value) || 0;
                                    
                                    // Update total amount automatically when changing additional costs
                                    const newFormData = { ...formData, additionalCharges: newCharges };
                                    const materialCost = (newFormData.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
                                    const addChargesTotal = newCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
                                    newFormData.amount = materialCost + addChargesTotal;
                                    newFormData.totalAmount = materialCost + addChargesTotal;
                                    
                                    setFormData(newFormData);
                                  }}
                                  className="w-full h-full p-2 bg-transparent text-right outline-none hover:bg-slate-100 focus:bg-[#ffffcc] transition-colors font-bold text-teal-900"
                                />
                              </td>
                              <td className="p-0 w-10 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newCharges = (formData.additionalCharges || []).filter((_, i) => i !== idx);
                                    const newFormData = { ...formData, additionalCharges: newCharges };
                                    const materialCost = (newFormData.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
                                    const addChargesTotal = newCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
                                    newFormData.amount = materialCost + addChargesTotal;
                                    newFormData.totalAmount = materialCost + addChargesTotal;
                                    setFormData(newFormData);
                                  }}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 w-full h-full transition-colors flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={3} className="p-2 border-t border-slate-200 bg-slate-50">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    additionalCharges: [...(formData.additionalCharges || []), { ledgerId: '', amount: 0 }]
                                  });
                                }}
                                className="text-[#004d5a] hover:text-teal-700 font-bold text-[10px] uppercase flex items-center gap-1 px-2 py-1 rounded bg-teal-100/50 hover:bg-teal-100 transition-colors pointer-cursor"
                              >
                                <Plus size={12} /> Add Additional Cost
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                  </div>
                )}

                {/* Bottom Narration Area */}
                <div className="mt-6 border-t border-gray-250 pt-4 max-w-4xl relative">
                  <div className="flex items-start">
                    <label className="w-36 text-xs font-bold text-gray-700 pt-2 flex items-center gap-1.5 uppercase tracking-wide">
                      Narration
                      <button
                        type="button"
                        onClick={handleAiNarration}
                        disabled={isAiSuggesting}
                        className="p-1 text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                        title="AI Suggest Narration"
                      >
                        {isAiSuggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      </button>
                    </label>
                    <span className="mr-3 text-gray-400 pt-2 font-bold">:</span>
                    <div className="flex-1 relative">
                      <textarea
                        data-tally-field="narration"
                        value={formData.narration}
                        onChange={(e) => setFormData({ ...formData, narration: e.target.value })}
                        className="w-full bg-white border border-gray-300 focus:border-teal-600 focus:bg-[#ffffcc] focus:ring-1 focus:ring-teal-100 p-2.5 text-xs outline-none h-16 resize-none shadow-sm transition-all rounded-sm font-mono font-semibold"
                        placeholder="Enter narration remarks or accept AI suggestions..."
                      />
                      {showAiSuggestions && (
                        <div className="absolute left-0 bottom-full mb-2 w-full bg-white rounded-lg shadow-2xl border border-purple-100 z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 font-sans">
                          <div className="bg-purple-50 px-3 py-2 border-b border-purple-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles size={10} /> AI Narrative Suggestions
                            </span>
                            <button onClick={() => setShowAiSuggestions(false)} className="text-purple-400 hover:text-purple-600">
                              <X size={12} />
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {aiSuggestions.map((suggestion, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, narration: suggestion });
                                  setShowAiSuggestions(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action Bar */}
              <div className="h-14 bg-[#faf8f5] border-t border-gray-300 flex items-center justify-end px-6 space-x-3 shrink-0 rounded-b font-mono">
                <button type="button" onClick={() => setViewMode('list')} className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-gray-200 border border-gray-300 hover:bg-gray-300 rounded active:scale-95 transition-all">
                  {t('cancel')} (Esc)
                </button>
                {isEditing && (
                  <>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (editingId) {
                          const v = vouchers.find(v => v.id === editingId);
                          if (v) handleDelete(v);
                        }
                      }} 
                      className="px-4 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded active:scale-95 transition-all"
                    >
                      Delete (Alt+D)
                    </button>
                    {formData.status !== 'Cancelled' && (
                      <button 
                        type="button" 
                        onClick={() => {
                          if (editingId) {
                            const v = vouchers.find(v => v.id === editingId);
                            if (v) handleCancelVoucher(v);
                          }
                        }} 
                        className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 hover:bg-slate-200 rounded active:scale-95 transition-all animate-pulse"
                      >
                        Cancel Voucher (Alt+X)
                      </button>
                    )}
                  </>
                )}
                <button data-tally-field="submit" type="submit" className="px-6 py-1.5 bg-[#004d5a] hover:bg-[#003c46] border-b-2 border-[#002f3c] text-[#ffcb2b] text-xs font-bold rounded shadow-sm active:scale-95 transition-all uppercase tracking-wider">
                  {isEditing ? 'Accept & Update (Ctrl+A)' : 'Accept (Ctrl+A)'}
                </button>
              </div>
                </>
              )}
            </form>

            {/* Right Sidebar for Shortcuts */}
            <div className="w-64 bg-[#1f3d47] border-l border-[#142930] flex flex-col p-1.5 shrink-0 select-none text-white overflow-y-auto font-sans">
              <div className="text-[10px] uppercase tracking-wider font-bold text-teal-300 px-3 py-2 border-b border-[#294c58] mb-1 font-mono">
                {t('voucher_types')} / Shortcuts
              </div>
              <div className="flex-1 space-y-1">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'Contra', mode: 'Normal', voucherNumber: getNextVoucherNumber('Contra'), items: [{ ledgerId: '', amount: 0 }] }))}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Contra' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Contra</span>
                  <kbd className={`px-1 rounded text-[10px] font-mono shadow ${
                    formData.type === 'Contra' ? 'bg-[#1c333a] text-yellow-400' : 'bg-[#1c333a] text-yellow-500 font-bold'
                  }`}>F4</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'Payment', mode: 'Normal', voucherNumber: getNextVoucherNumber('Payment'), items: [{ ledgerId: '', amount: 0 }] }))}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Payment' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Payment</span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F5</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'Receipt', mode: 'Normal', voucherNumber: getNextVoucherNumber('Receipt'), items: [{ ledgerId: '', amount: 0 }] }))}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Receipt' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Receipt</span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F6</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'Journal', mode: 'Double Entry', voucherNumber: getNextVoucherNumber('Journal'), items: [{ ledgerId: '', amount: 0, type: 'Dr' }] }))}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Journal' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Journal</span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F7</kbd>
                </button>
                <button
                  type="button"
                  onClick={handleSelectSalesVoucher}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Sales' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Sales</span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F8</kbd>
                </button>
                <button
                  type="button"
                  onClick={handleSelectPurchaseVoucher}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold border rounded transition-all text-left ${
                    formData.type === 'Purchase' ? 'bg-[#ffcb2b] border-[#ffcb2b] text-[#002f3c]' : 'bg-[#294e5b] border-[#2b515f] text-gray-100 hover:bg-[#325f6e]'
                  }`}
                >
                  <span>Purchase</span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F9</kbd>
                </button>

                <div className="h-px bg-[#294c58] my-2"></div>

                <button
                  type="button"
                  onClick={() => setIsOtherVouchersOpen(true)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold border rounded transition-all text-left ${
                    isOtherVouchersOpen ? 'bg-amber-400 border-amber-400 text-[#002f3c]' : 'bg-[#214b59] border-amber-500/50 text-amber-300 hover:bg-[#2a5d6e] hover:border-amber-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles size={13} className="text-amber-400 animate-pulse" />
                    Other Vouchers
                  </span>
                  <kbd className="px-1 rounded text-[10px] font-mono bg-[#1c333a] text-yellow-500 font-bold shadow">F10</kbd>
                </button>

                <div className="pt-2"></div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-teal-300 px-3 py-1.5 border-b border-[#294c58] mb-1 font-mono">
                  {t('actions')} / Config
                </div>

                <button
                  type="button"
                  onClick={toggleMode}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-[#294e5b] border border-[#2b515f] hover:bg-[#325f6e] hover:border-yellow-400 rounded transition-all text-left"
                >
                  <span>Change Mode</span>
                  <kbd className="px-1 rounded text-[9px] font-mono bg-[#1c333a] text-orange-400 font-bold shadow">Ctrl+H</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold bg-[#294e5b] border border-[#2b515f] hover:bg-[#325f6e] hover:border-yellow-400 rounded transition-[#ffffcc] text-left"
                >
                  <span>Day Book</span>
                  <kbd className="px-1 rounded text-[9px] font-mono bg-[#1c333a] text-orange-400 font-bold shadow">Alt+F</kbd>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-yellow-400 bg-[#294e5b] border border-[#2b515f] hover:bg-[#325f6e] hover:border-yellow-400 rounded transition-all text-left"
                >
                  <span>Save Template</span>
                  <kbd className="px-1 rounded text-[9px] font-mono bg-[#1c333a] text-orange-400 font-bold shadow">Alt+S</kbd>
                </button>
              </div>
              <div className="border-t border-[#294c58] p-3 text-[10px] text-gray-400 space-y-1 font-mono select-none">
                <p><span className="text-yellow-400 font-bold">↵ Enter</span>: Next Field</p>
                <p><span className="text-yellow-400 font-bold">Ctrl+A</span>: Quick Accept</p>
                <p><span className="text-yellow-400 font-bold">Esc</span>: Quit Workspace</p>
              </div>
            </div>
          </div>
        </div>

          </>
      ) : (
        /* Day Book View (Master-Detail) */
        <div className="flex-1 flex overflow-hidden font-mono">
          {/* Left Sidebar: Voucher List */}
          <div className="w-96 bg-[#002f3c] text-white flex flex-col border-r border-[#004d5a] shadow-lg z-10 font-mono">
            <div className="p-4 bg-[#004d5a] border-b-2 border-[#003c46]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-[#ffcb2b] border-l-2 border-[#ffcb2b] pl-2">{t('day_book')}</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={handleExportExcel} 
                    className="text-[10px] bg-emerald-600 text-white px-2 py-1 rounded-none hover:bg-emerald-700 font-bold uppercase flex items-center gap-1"
                    title="Export to Excel"
                  >
                    <Download size={10} /> XL
                  </button>
                  <button onClick={() => setViewMode('entry')} className="text-[10px] bg-[#ffcb2b] text-[#002f3c] px-2.5 py-1 rounded-none hover:bg-yellow-400 font-bold uppercase">{t('entry_v')}</button>
                </div>
              </div>
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#ffcb2b]/60" size={12} />
                <input
                  type="text"
                  placeholder={t('search_vouchers')}
                  className="w-full bg-[#003c46] border border-teal-800 rounded-none text-xs py-1.5 pl-8 pr-3 outline-none text-[#ffcb2b] placeholder-[#ffcb2b]/40 focus:border-[#ffcb2b]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredVouchers.length === 0 ? (
                <div className="p-8 text-center text-teal-200/60 italic text-xs">
                  {t('no_vouchers_found')}
                </div>
              ) : (
                filteredVouchers.map((voucher, index) => (
                  <div
                    key={voucher.id}
                    id={`row-${index}`}
                    onClick={() => {
                      setSelectedIndex(index);
                    }}
                    className={`p-3 cursor-pointer border-b border-[#004d5a]/35 transition-all relative group ${
                      selectedIndex === index 
                        ? 'bg-[#ffcb2b] text-[#002f3c] font-bold border-l-4 border-l-[#ffcb2b]' 
                        : 'hover:bg-[#003c46] text-white'
                    } ${
                      voucher.status === 'Cancelled' ? 'opacity-50 line-through text-rose-300' :
                      voucher.status === 'Optional' ? 'border-dashed border-orange-400' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${selectedIndex === index ? 'text-[#002f3c]/70' : 'text-teal-300'}`}>{formatDateForDisplay(voucher.date)}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono ${selectedIndex === index ? 'text-[#002f3c]' : 'text-yellow-400'}`}>#{voucher.voucherNumber}</span>
                          {voucher.status && voucher.status !== 'Regular' && (
                            <span className={`text-[8px] font-mono font-bold px-1 rounded-sm ${
                              voucher.status === 'Cancelled' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                              voucher.status === 'Optional' ? 'bg-orange-950 text-orange-300 border border-orange-850' :
                              'bg-indigo-950 text-indigo-300 border border-indigo-850'
                            }`}>
                              [{voucher.status}]
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-none font-bold uppercase ${
                        selectedIndex === index ? 'bg-[#002f3c]/10 text-[#002f3c] border border-[#002f3c]/30' :
                        voucher.type === 'Sales' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800' :
                        voucher.type === 'Purchase' ? 'bg-sky-950/40 text-sky-300 border border-sky-800' :
                        voucher.type === 'Payment' ? 'bg-rose-950/40 text-rose-300 border border-rose-800' :
                        voucher.type === 'Receipt' ? 'bg-cyan-950/40 text-cyan-300 border border-cyan-800' :
                        'bg-gray-800 text-gray-300'
                      }`}>
                        {voucher.type}
                      </span>
                    </div>
                    
                    <div className="text-xs font-bold truncate mb-1">
                      {ledgers.find(l => l.id === (voucher.mode === 'Invoice' ? voucher.ledgerId : (voucher.type === 'Receipt' || voucher.type === 'Contra' || voucher.type === 'Purchase' ? voucher.creditLedgerId : voucher.debitLedgerId)))?.name || 'Cash/Bank'}
                    </div>
                    
                    <div className="flex justify-between items-center text-[10px]">
                      <span className={`italic truncate max-w-[150px] ${selectedIndex === index ? 'text-[#002f3c]/70' : 'text-gray-300'}`}>
                        {voucher.narration || 'No narration'}
                      </span>
                      <span className={`font-bold ${selectedIndex === index ? 'text-[#002f3c]' : 'text-[#ffcb2b]'}`}>
                        {voucher.status === 'Cancelled' ? formatCurrency(0) : formatCurrency(voucher.totalAmount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2.5 bg-[#004d5a] border-t border-[#003c46] flex justify-between items-center text-[10px] text-[#ffcb2b] font-bold">
              <span>{filteredVouchers.length} {t('vouchers')}</span>
              <span className="flex items-center gap-1">
                {t('total')}: {formatCurrency(filteredVouchers.reduce((sum, v) => sum + v.totalAmount, 0))}
              </span>
            </div>
          </div>

          {/* Right Content: Voucher Details View */}
          <div className="flex-1 bg-[#fdfcf0] overflow-y-auto custom-scrollbar p-6 relative">
            {filteredVouchers[selectedIndex] ? (
              <div className="max-w-4xl mx-auto">
                {/* Action Toolbar */}
                <div className="mb-4 flex justify-between items-center bg-[#004d5a] p-2 px-4 rounded-none border border-[#003c46] text-white">
                  <div className="flex items-center gap-4">
                    <h3 className="text-xs font-bold text-[#ffcb2b] uppercase tracking-wider flex items-center gap-2">
                      <FileText size={14} className="text-[#ffcb2b]" />
                      {t('voucher_details')}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const v = filteredVouchers[selectedIndex];
                        if (v) {
                          const duplicate = { 
                            ...v, 
                            id: undefined, 
                            date: getLocalDateString(),
                            voucherNumber: getNextVoucherNumber(v.type),
                            createdAt: new Date().toISOString() 
                          };
                          setFormData(duplicate);
                          setIsEditing(false);
                          setEditingId(null);
                          setViewMode('entry');
                          toast.info(`Duplicating ${v.type} #${v.voucherNumber}`);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded-none text-xs font-bold transition-all shadow-sm"
                    >
                      <Copy size={12} /> {t('duplicate')}
                    </button>
                    <button
                      onClick={() => handleEdit(filteredVouchers[selectedIndex])}
                      className="flex items-center gap-1.5 px-3 py-1 bg-[#ffcb2b] text-[#002f3c] hover:bg-yellow-400 rounded-none text-xs font-bold transition-all shadow-sm"
                    >
                      <Edit2 size={12} /> {t('edit')}
                    </button>
                    <button
                      onClick={() => {
                        setPrintingVoucher(filteredVouchers[selectedIndex]);
                        setShowPrintPreview(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-[#003c46] text-[#ffcb2b] hover:bg-[#002f3c] border border-[#ffcb2b]/30 rounded-none text-xs font-bold transition-all shadow-sm"
                    >
                      <Printer size={12} /> {t('print_alt_p')}
                    </button>
                    <button
                      onClick={() => handleDelete(filteredVouchers[selectedIndex])}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-700 text-white hover:bg-red-800 rounded-none text-xs font-bold transition-all shadow-sm"
                    >
                      <Trash2 size={12} /> {t('delete_alt_d')}
                    </button>
                  </div>
                </div>

                {/* Voucher Content */}
                <div className="bg-white shadow-md rounded-none border border-[#003c46]/30 overflow-hidden transform transition-all">
                  <VoucherPrint 
                    voucher={filteredVouchers[selectedIndex]} 
                    ledgers={ledgers}
                    products={products}
                    godowns={godowns}
                    company={activeCompany!} 
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <FileText size={80} className="opacity-10 mb-4" />
                <h3 className="text-xl font-bold text-gray-500">{t('no_voucher_selected')}</h3>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {isQuickLedgerModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{quickLedgerData.id ? 'Edit Ledger Details' : t('quick_create_ledger')}</h3>
              <button onClick={() => setIsQuickLedgerModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickLedgerSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('ledger_name')}</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={quickLedgerData.name}
                  onChange={(e) => setQuickLedgerData({ ...quickLedgerData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter ledger name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('group')}</label>
                <select
                  required
                  value={quickLedgerData.group}
                  onChange={(e) => setQuickLedgerData({ ...quickLedgerData, group: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {TALLY_GROUPS.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('opening_balance')}</label>
                <input
                  type="number"
                  value={quickLedgerData.openingBalance}
                  onChange={(e) => setQuickLedgerData({ ...quickLedgerData, openingBalance: Number(e.target.value), currentBalance: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="pt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsQuickLedgerModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                >
                  {quickLedgerData.id ? 'Save Changes' : t('create_ledger')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQuickProductModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{t('quick_create_product')}</h3>
              <button onClick={() => setIsQuickProductModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickProductSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('product_name')}</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={quickProductData.name}
                  onChange={(e) => setQuickProductData({ ...quickProductData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter product name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('hsn_code')}</label>
                <input
                  type="text"
                  value={quickProductData.hsnCode}
                  onChange={(e) => setQuickProductData({ ...quickProductData, hsnCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter HSN code"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('unit')}</label>
                  <select
                    value={quickProductData.unit}
                    onChange={(e) => {
                      const newUnit = e.target.value;
                      setQuickProductData({ 
                        ...quickProductData, 
                        unit: newUnit,
                        decimalPlaces: (newUnit === 'Kg' || newUnit === 'Ltr') ? (quickProductData.decimalPlaces || 2) : 0
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Pcs">Pcs</option>
                    <option value="Kg">Kg</option>
                    <option value="Ltr">Ltr</option>
                    <option value="Box">Box</option>
                    <option value="Nos">Nos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('gst_rate')} (%)</label>
                  <input
                    type="number"
                    value={quickProductData.gstRate}
                    onChange={(e) => setQuickProductData({ ...quickProductData, gstRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              {(quickProductData.unit === 'Kg' || quickProductData.unit === 'Ltr') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('number_of_decimal_places')}</label>
                    <select
                      value={quickProductData.decimalPlaces}
                      onChange={(e) => setQuickProductData({ ...quickProductData, decimalPlaces: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('purchase_price')}</label>
                  <input
                    type="number"
                    value={quickProductData.purchasePrice}
                    onChange={(e) => setQuickProductData({ ...quickProductData, purchasePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('sales_price')}</label>
                  <input
                    type="number"
                    value={quickProductData.salesPrice}
                    onChange={(e) => setQuickProductData({ ...quickProductData, salesPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="pt-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setIsQuickProductModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors"
                >
                  {t('create_product')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrintPreview && printingVoucher && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:block print:overflow-visible print:static">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden print:shadow-none print:rounded-none">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 print:hidden">
              <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                <Printer size={20} className="text-blue-600" />
                <span>{t('print_preview')}</span>
              </h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDownloadPDF}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 flex items-center space-x-2 shadow-lg"
                >
                  <Download size={18} />
                  <span>{t('download_pdf')}</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center space-x-2 shadow-lg"
                >
                  <Printer size={18} />
                  <span>{t('print_now')}</span>
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="p-2 hover:bg-gray-200 rounded-lg text-gray-500"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-8 bg-[#f3f4f6] print:p-0 print:bg-[#ffffff] overflow-y-auto max-h-[80vh] print:max-h-none">
              <div id="voucher-print-area" style={{ backgroundColor: '#ffffff' }}>
                <VoucherPrint 
                  voucher={printingVoucher} 
                  ledgers={ledgers} 
                  products={products} 
                  godowns={godowns}
                  company={activeCompany}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {costCenterModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#eef3ee] border-2 border-[#002f3c] w-full max-w-md shadow-2xl relative flex flex-col">
            <div className="bg-[#002f3c] text-white px-4 py-2 flex justify-between items-center border-b-[3px] border-[#ffcb2b]">
              <h2 className="text-sm font-black uppercase tracking-widest font-mono">Cost Centre Allocations</h2>
              <button type="button" onClick={() => setCostCenterModal(null)} className="text-[#eef3ee] hover:text-[#ffcb2b] transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4 flex-1">
              {(() => {
                const item = formData.items![costCenterModal.index];
                const totalTarget = item.amount || 0;
                const allocations = item.costCenterAllocations || [];
                const allocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
                const remaining = totalTarget - allocatedTotal;

                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs font-bold text-[#002f3c]">
                      <span>Amount: {totalTarget}</span>
                      <span className={remaining === 0 ? "text-green-600" : "text-red-500"}>Remaining: {remaining}</span>
                    </div>

                    <table className="w-full text-left bg-white border border-[#003c46]/20">
                      <thead>
                        <tr className="bg-[#004d5a] text-[#ffcb2b] text-[10px] uppercase font-bold font-mono">
                          <th className="p-2 border-r border-[#003c46]/45">Cost Centre</th>
                          <th className="p-2 border-r border-[#003c46]/45 w-32 text-right">Amount</th>
                          <th className="p-2 w-10 text-center">Act</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {allocations.map((alloc, aidx) => (
                          <tr key={aidx}>
                            <td className="p-1 border-r border-gray-200">
                              <select 
                                value={alloc.costCenterId}
                                onChange={(e) => {
                                  const newAlloc = [...allocations];
                                  newAlloc[aidx].costCenterId = e.target.value;
                                  updateItem(costCenterModal.index, 'costCenterAllocations', newAlloc);
                                }}
                                className="w-full text-xs p-1 outline-none font-bold"
                              >
                                <option value="">Select...</option>
                                {costCategories.length > 0 ? (
                                  <>
                                    {costCategories.map(cat => {
                                      const catCenters = costCenters.filter(cc => cc.categoryId === cat.id);
                                      if (catCenters.length === 0) return null;
                                      return (
                                        <optgroup key={cat.id} label={cat.name}>
                                          {catCenters.map(cc => (
                                            <option key={cc.id} value={cc.id}>{cc.name}</option>
                                          ))}
                                        </optgroup>
                                      );
                                    })}
                                    {costCenters.filter(cc => !cc.categoryId).length > 0 && (
                                      <optgroup label="Primary Cost Category">
                                        {costCenters.filter(cc => !cc.categoryId).map(cc => (
                                          <option key={cc.id} value={cc.id}>{cc.name}</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </>
                                ) : (
                                  costCenters.map(cc => (
                                    <option key={cc.id} value={cc.id}>{cc.name}</option>
                                  ))
                                )}
                              </select>
                            </td>
                            <td className="p-1 border-r border-gray-200">
                              <input 
                                type="number" 
                                value={alloc.amount}
                                onChange={(e) => {
                                  const newAlloc = [...allocations];
                                  newAlloc[aidx].amount = Number(e.target.value);
                                  updateItem(costCenterModal.index, 'costCenterAllocations', newAlloc);
                                }}
                                className="w-full text-xs p-1 outline-none text-right font-bold"
                                step="any"
                              />
                            </td>
                            <td className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const newAlloc = allocations.filter((_, i) => i !== aidx);
                                  updateItem(costCenterModal.index, 'costCenterAllocations', newAlloc);
                                }}
                                className="text-red-600 hover:text-red-800"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <button
                      type="button"
                      onClick={() => {
                        const newAlloc = [...allocations, { costCenterId: '', amount: remaining > 0 ? remaining : 0 }];
                        updateItem(costCenterModal.index, 'costCenterAllocations', newAlloc);
                      }}
                      className="text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded transition-colors"
                    >
                      + Add Allocation
                    </button>
                    
                    {remaining !== 0 && (
                      <p className="text-[10px] text-red-500 font-bold max-w-[300px]">Warning: Total allocated amount does not match the ledger amount.</p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="bg-gray-100 p-3 flex justify-end">
              <button 
                type="button" 
                onClick={() => setCostCenterModal(null)}
                className="bg-[#004d5a] hover:bg-[#003c46] text-[#ffcb2b] px-6 py-1.5 text-xs font-bold tracking-wider rounded uppercase transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isOtherVouchersOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-910/60 backdrop-blur-sm p-4">
          <div className="bg-[#1c333a] border border-[#ffcb2b] w-full max-w-sm rounded shadow-2xl overflow-hidden font-mono text-gray-100 flex flex-col">
            {/* Header in Classic Style */}
            <div className="bg-[#0f2127] border-b border-[#294c58] px-3.5 py-2 flex items-center justify-between select-none">
              <span className="text-[#ffcb2b] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-400 animate-pulse" />
                List of Voucher Types
              </span>
              <button 
                onClick={() => {
                  setIsOtherVouchersOpen(false);
                  setOtherVoucherSearch('');
                }} 
                className="text-gray-400 hover:text-white transition-colors"
                id="close-other-vouchers-btn"
              >
                <X size={15} />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="p-2 border-b border-[#294c58] bg-[#12242a]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                <input
                  ref={otherSearchInputRef}
                  type="text"
                  placeholder="Typing filters..."
                  value={otherVoucherSearch}
                  onChange={(e) => setOtherVoucherSearch(e.target.value)}
                  className="w-full bg-[#1c333a] border border-[#294c58] rounded pl-7 pr-2 py-1 text-xs text-white focus:outline-none focus:border-[#ffcb2b] outline-none placeholder-gray-500 font-mono"
                  id="other-voucher-search-input"
                />
              </div>
            </div>

            {/* Vouchers List */}
            <div className="max-h-[280px] overflow-y-auto p-1 bg-[#0f2127]/50">
              {filteredOtherList.length > 0 ? (
                Object.entries(
                  filteredOtherList.reduce((acc, current) => {
                    if (!acc[current.category]) acc[current.category] = [];
                    acc[current.category].push(current);
                    return acc;
                  }, {} as Record<string, typeof FLATTENED_OTHER_VOUCHERS>)
                ).map(([category, items]) => (
                  <div key={category} className="mb-2 last:mb-0">
                    <div className="text-[10px] uppercase text-teal-400 font-bold px-2 py-1 select-none tracking-wide text-left">
                      {category}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const globalIdx = filteredOtherList.indexOf(item);
                        const isSelected = globalIdx === selectedOtherIdx;
                        return (
                          <div
                            key={item.type}
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                type: item.type as any,
                                mode: item.mode as any,
                                voucherNumber: getNextVoucherNumber(item.type),
                                items: item.items
                              }));
                              setIsOtherVouchersOpen(false);
                              setOtherVoucherSearch('');
                              setTimeout(() => {
                                const el = document.querySelector('[data-tally-field="date"]') as HTMLElement;
                                if (el) el.focus();
                              }, 100);
                            }}
                            className={`flex items-center justify-between px-2.5 py-1 text-xs font-semibold rounded cursor-pointer transition-all select-none ${
                              isSelected
                                ? 'bg-[#ffcb2b] text-[#002f3c]'
                                : 'text-gray-200 hover:bg-[#203c44] hover:text-white'
                            }`}
                          >
                            <span>{item.type}</span>
                            <span className={`text-[9px] font-mono font-bold ${
                              isSelected ? 'text-[#002f3c]/70' : 'text-orange-400'
                            }`}>
                              {item.shortcut}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-5 text-[11px] text-gray-500 font-mono">
                  No matching voucher types.
                </div>
              )}
            </div>

            {/* Visual Hints Footer */}
            <div className="bg-[#0f2127] border-t border-[#294c58] px-3 py-1 text-[9px] text-gray-400 flex justify-between select-none">
              <span>↑↓: Move</span>
              <span>Enter / Click: Select</span>
              <span>Esc: Quit</span>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t('confirm_delete')}</h3>
              <p className="text-slate-600 mb-6">
                {t('confirm_delete_voucher_msg')} <span className="font-bold text-slate-900">{voucherToDelete?.voucherNumber}</span>? 
                {t('reverse_impact_msg')}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setVoucherToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                >
                  {t('delete_voucher')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
