import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Voucher, Ledger, Product, Company } from '../types';
import { formatCurrency as formatCurrencyUtil, formatBalance as formatBalanceUtil } from '../lib/utils';
import { updateBalances, calculateGodownStock } from '../lib/voucherUtils';
import { FileText, Download, Printer, Package, TrendingUp, TrendingDown, Landmark, Building2, Calendar, MapPin, X, Trash2, MessageCircle, Sparkles, Loader2, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Markdown from 'react-markdown';
import { getGroupCategory } from '../constants';
import { useCompany } from '../contexts/CompanyContext';
import { getFinancialInsights } from '../services/geminiService';
import { dataService } from '../services/dataService';
import ProductSummaryModal from '../components/ProductSummaryModal';
import VoucherPrint from '../components/VoucherPrint';

const getLocalDateString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
};

export default function Reports() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [searchParams] = useSearchParams();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [costCategories, setCostCategories] = useState<any[]>([]);

  const handleDeleteVoucher = (voucher: Voucher) => {
    setVoucherToDelete(voucher);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!voucherToDelete) return;
    try {
      await updateBalances(db, voucherToDelete, -1);
      await deleteDoc(doc(db, 'vouchers', voucherToDelete.id));
      toast.success('Voucher deleted successfully');
      setIsDeleteModalOpen(false);
      setVoucherToDelete(null);
    } catch (error: any) {
      console.error('Error deleting voucher:', error);
      toast.error('Failed to delete voucher: ' + error.message);
    }
  };
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [voucherToDelete, setVoucherToDelete] = useState<Voucher | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [reportType, setReportType] = useState<'PL' | 'BS' | 'GST' | 'STOCK' | 'GODOWN_SUMMARY' | 'DAYBOOK' | 'LEDGER' | 'OUTSTANDING' | 'TRIAL_BALANCE' | 'CASH_FLOW' | 'BRS' | 'COST_CENTER' | 'POS_REGISTER'>((searchParams.get('type') as any) || 'DAYBOOK');
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>(searchParams.get('ledgerId') || '');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('all');
  const [selectedCostCategoryId, setSelectedCostCategoryId] = useState<string>('all');
  const [selectedGodownId, setSelectedGodownId] = useState<string>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [outstandingType, setOutstandingType] = useState<'RECEIVABLES' | 'PAYABLES'>('RECEIVABLES');
  const [showOutstandingAging, setShowOutstandingAging] = useState(false);
  const [gstSubTab, setGstSubTab] = useState<'OVERVIEW' | 'GSTR1' | 'GSTR3B' | 'OTHER_TAXES'>('OVERVIEW');
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState<string>('');
  const [brsClearedDates, setBrsClearedDates] = useState<Record<string, string>>({});
  const [brsFilter, setBrsFilter] = useState<'ALL' | 'CLEARED' | 'UNCLEARED'>('ALL');
  const [showInterestCalc, setShowInterestCalc] = useState(false);
  const [interestRate, setInterestRate] = useState(12);
  const [interestGraceDays, setInterestGraceDays] = useState(0);
  const [dateRange, setDateRange] = useState({
    from: getLocalDateString(),
    to: getLocalDateString()
  });
  const [selectedSummaryProduct, setSelectedSummaryProduct] = useState<Product | null>(null);
  const [selectedSummaryVoucher, setSelectedSummaryVoucher] = useState<Voucher | null>(null);

  // Reset reportType if corresponding features are toggled off
  useEffect(() => {
    if (activeCompany) {
      if (activeCompany.enableGodowns === false && reportType === 'GODOWN_SUMMARY') {
        setReportType('DAYBOOK');
      }
      if (activeCompany.enableCostCenters === false && reportType === 'COST_CENTER') {
        setReportType('DAYBOOK');
      }
    }
  }, [activeCompany?.enableGodowns, activeCompany?.enableCostCenters, reportType]);

  // Load BRS cleared dates on activeCompany change
  useEffect(() => {
    if (activeCompany?.id) {
      const stored = localStorage.getItem(`smartacc_brs_${activeCompany.id}`);
      if (stored) {
        try {
          setBrsClearedDates(JSON.parse(stored));
        } catch (e) {
          setBrsClearedDates({});
        }
      } else {
        setBrsClearedDates({});
      }
    }
  }, [activeCompany?.id]);

  const handleUpdateBrsClearedDate = (voucherId: string, clearingDate: string) => {
    const updated = { ...brsClearedDates, [voucherId]: clearingDate };
    setBrsClearedDates(updated);
    if (activeCompany?.id) {
      localStorage.setItem(`smartacc_brs_${activeCompany.id}`, JSON.stringify(updated));
    }
    toast.success('Bank clearance date updated');
  };

  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribeV = dataService.onSnapshotCollection<Voucher>(
      'vouchers',
      conditions,
      (fetchedVouchers) => {
        fetchedVouchers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
        ) {
          return;
        }
        console.error('Reports: Error fetching vouchers:', error);
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

    const unsubscribeL = dataService.onSnapshotCollection<Ledger>(
      'ledgers',
      conditions,
      (ledgerData) => setLedgers(ledgerData),
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Reports: Error fetching ledgers:', error);
      }
    );

    const unsubscribeP = dataService.onSnapshotCollection<Product>(
      'products',
      conditions,
      (productData) => setProducts(productData),
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Reports: Error fetching products:', error);
      }
    );

    const unsubscribeG = dataService.onSnapshotCollection<any>(
      'godowns',
      conditions,
      (godownData) => setGodowns(godownData),
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Reports: Error fetching godowns:', error);
      }
    );

    const unsubscribeCC = dataService.onSnapshotCollection<any>(
      'costCenters',
      conditions,
      (ccData) => setCostCenters(ccData),
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Reports: Error fetching costCenters:', error);
      }
    );

    const unsubscribeCat = dataService.onSnapshotCollection<any>(
      'costCategories',
      conditions,
      (catData) => setCostCategories(catData),
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) return;
        console.error('Reports: Error fetching costCategories:', error);
      }
    );

    return () => {
      unsubscribeV();
      unsubscribeL();
      unsubscribeP();
      unsubscribeG();
      unsubscribeCC();
      unsubscribeCat();
    };
  }, [activeCompany?.id]);

  useEffect(() => {
    const type = searchParams.get('type') as any;
    const ledgerId = searchParams.get('ledgerId');
    if (type) setReportType(type);
    if (ledgerId) setSelectedLedgerId(ledgerId);
  }, [searchParams]);

  const reportTypes: ('DAYBOOK' | 'LEDGER' | 'PL' | 'BS' | 'GST' | 'STOCK' | 'GODOWN_SUMMARY' | 'OUTSTANDING' | 'TRIAL_BALANCE' | 'CASH_FLOW' | 'BRS' | 'COST_CENTER' | 'POS_REGISTER')[] = ['DAYBOOK', 'LEDGER', 'PL', 'BS', 'GST', 'STOCK', 'GODOWN_SUMMARY', 'OUTSTANDING', 'TRIAL_BALANCE', 'CASH_FLOW', 'BRS', 'COST_CENTER', 'POS_REGISTER'];
  const navigate = React.useMemo(() => {
    const n = (path: string) => window.location.hash = path;
    return n;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.history.back();
        return;
      }

      const currentReportVouchers = reportType === 'DAYBOOK' 
        ? vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to)
        : reportType === 'LEDGER'
        ? vouchers.filter(v => (v.ledgerId === selectedLedgerId || v.salesPurchaseLedgerId === selectedLedgerId || v.debitLedgerId === selectedLedgerId || v.creditLedgerId === selectedLedgerId || v.items?.some(i => i.ledgerId === selectedLedgerId)) && v.date >= dateRange.from && v.date <= dateRange.to)
        : [];
      
      const itemsCount = reportType === 'STOCK' ? products.length : currentReportVouchers.length;

      if (e.key === 'ArrowDown') {
        setSelectedIndex(prev => Math.min(prev + 1, itemsCount - 1));
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'ArrowRight' && !['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        const currentIndex = reportTypes.indexOf(reportType);
        const nextIndex = (currentIndex + 1) % reportTypes.length;
        setReportType(reportTypes[nextIndex]);
        setSelectedIndex(0);
      } else if (e.key === 'ArrowLeft' && !['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        const currentIndex = reportTypes.indexOf(reportType);
        const prevIndex = (currentIndex - 1 + reportTypes.length) % reportTypes.length;
        setReportType(reportTypes[prevIndex]);
        setSelectedIndex(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reportType, vouchers, products, dateRange, selectedLedgerId]);

  const getStockStats = (productId: string) => {
    let inwards = 0;
    let outwards = 0;

    vouchers.forEach(v => {
      if (v.mode === 'Invoice' && v.items) {
        const item = v.items.find(i => i.productId === productId);
        if (item) {
          if (v.type === 'Purchase' || v.type === 'Credit Note') {
            inwards += item.quantity;
          } else if (v.type === 'Sales' || v.type === 'Debit Note') {
            outwards += item.quantity;
          }
        }
      }
    });

    return { inwards, outwards };
  };

  const currencySymbol = activeCompany?.currencySymbol || (activeCompany?.country === 'India' ? '₹' : (activeCompany?.country ? '' : '₹'));

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, currencySymbol);
  };

  const formatBalance = (amount: number) => {
    return formatBalanceUtil(amount, currencySymbol);
  };

  const reportLedgers = React.useMemo(() => {
    const list = [...ledgers];
    const hasCgst = ledgers.some(l => (l.name || '').toLowerCase().includes('cgst') || (l.name || '').toLowerCase().includes('central'));
    const hasSgst = ledgers.some(l => (l.name || '').toLowerCase().includes('sgst') || (l.name || '').toLowerCase().includes('state') || (l.name || '').toLowerCase().includes('utgst'));
    const hasIgst = ledgers.some(l => (l.name || '').toLowerCase().includes('igst') || (l.name || '').toLowerCase().includes('integrated'));
    const hasDuties = ledgers.some(l => (l.group || '').toLowerCase().includes('duties') || (l.group || '').toLowerCase().includes('tax'));

    // Compute unposted invoice tax across all vouchers
    let unpostedCgst = 0;
    let unpostedSgst = 0;
    let unpostedIgst = 0;

    vouchers.forEach(v => {
      if (v.mode !== 'Invoice') return;
      const isSalesSide = v.type === 'Sales' || v.type === 'Debit Note';
      const isPurchaseSide = v.type === 'Purchase' || v.type === 'Credit Note';
      if (!isSalesSide && !isPurchaseSide) return;

      const cgst = Number(v.cgst) || 0;
      const sgst = Number(v.sgst) || 0;
      const igst = Number(v.igst) || 0;

      if (isSalesSide) {
        if (!hasCgst && !hasDuties) unpostedCgst -= cgst;
        if (!hasSgst && !hasDuties) unpostedSgst -= sgst;
        if (!hasIgst && !hasDuties) unpostedIgst -= igst;
      } else {
        if (!hasCgst && !hasDuties) unpostedCgst += cgst;
        if (!hasSgst && !hasDuties) unpostedSgst += sgst;
        if (!hasIgst && !hasDuties) unpostedIgst += igst;
      }
    });

    if (!hasCgst && !hasDuties && Math.abs(unpostedCgst) > 0.001) {
      list.push({
        id: 'virtual_cgst',
        name: 'CGST',
        group: 'Duties & Taxes',
        openingBalance: 0,
        currentBalance: unpostedCgst,
        companyId: activeCompany?.id || '',
        balanceType: unpostedCgst >= 0 ? 'Dr' : 'Cr',
        createdBy: '',
        createdAt: new Date().toISOString()
      });
    }
    if (!hasSgst && !hasDuties && Math.abs(unpostedSgst) > 0.001) {
      list.push({
        id: 'virtual_sgst',
        name: 'SGST',
        group: 'Duties & Taxes',
        openingBalance: 0,
        currentBalance: unpostedSgst,
        companyId: activeCompany?.id || '',
        balanceType: unpostedSgst >= 0 ? 'Dr' : 'Cr',
        createdBy: '',
        createdAt: new Date().toISOString()
      });
    }
    if (!hasIgst && !hasDuties && Math.abs(unpostedIgst) > 0.001) {
      list.push({
        id: 'virtual_igst',
        name: 'IGST',
        group: 'Duties & Taxes',
        openingBalance: 0,
        currentBalance: unpostedIgst,
        companyId: activeCompany?.id || '',
        balanceType: unpostedIgst >= 0 ? 'Dr' : 'Cr',
        createdBy: '',
        createdAt: new Date().toISOString()
      });
    }

    return list;
  }, [ledgers, vouchers, activeCompany?.id]);

  const getGstTaxForLedger = (ledger: Ledger, v: Voucher): number => {
    if (v.mode !== 'Invoice') return 0;
    const name = (ledger.name || '').trim().toLowerCase();
    const group = (ledger.group || '').trim().toLowerCase();
    const isDuties = group.includes('duties') || group.includes('tax') || name.includes('gst');
    if (!isDuties) return 0;

    const isSalesSide = v.type === 'Sales' || v.type === 'Debit Note';
    const isPurchaseSide = v.type === 'Purchase' || v.type === 'Credit Note';
    if (!isSalesSide && !isPurchaseSide) return 0;

    if (name.includes('input') && isSalesSide) return 0;
    if (name.includes('output') && isPurchaseSide) return 0;

    let taxAmount = 0;
    const isCgst = name.includes('cgst') || name.includes('central');
    const isSgst = name.includes('sgst') || name.includes('utgst') || name.includes('state');
    const isIgst = name.includes('igst') || name.includes('integrated');

    if (isCgst) {
      taxAmount = Number(v.cgst) || 0;
    } else if (isSgst) {
      taxAmount = Number(v.sgst) || 0;
    } else if (isIgst) {
      taxAmount = Number(v.igst) || 0;
    } else if (name === 'gst' || name === 'duties & taxes' || group === 'duties & taxes') {
      const otherLedgers = reportLedgers.filter(l => l.id !== ledger.id);
      const hasOtherCgst = otherLedgers.some(l => (l.name || '').toLowerCase().includes('cgst') || (l.name || '').toLowerCase().includes('central'));
      const hasOtherSgst = otherLedgers.some(l => (l.name || '').toLowerCase().includes('sgst') || (l.name || '').toLowerCase().includes('state') || (l.name || '').toLowerCase().includes('utgst'));
      const hasOtherIgst = otherLedgers.some(l => (l.name || '').toLowerCase().includes('igst') || (l.name || '').toLowerCase().includes('integrated'));

      taxAmount = (!hasOtherCgst ? (Number(v.cgst) || 0) : 0) +
                  (!hasOtherSgst ? (Number(v.sgst) || 0) : 0) +
                  (!hasOtherIgst ? (Number(v.igst) || 0) : 0);
    }

    if (taxAmount === 0) return 0;
    return isSalesSide ? -taxAmount : taxAmount;
  };

  const getLedgerBalanceAsOf = (ledgerId: string, toDate: string, useTaxableForPNL: boolean = false) => {
    const ledger = reportLedgers.find(l => l.id === ledgerId) || ledgers.find(l => l.id === ledgerId);
    if (!ledger) return 0;

    const groupCat = getGroupCategory(ledger.group);
    const isPNLGroup = ['Income', 'Expenses'].includes(groupCat);
    const isPNLAccountType = isPNLGroup || ['Purchase Accounts', 'Sales Accounts', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes'].some(g => ledger.group === g);

    let opening = Number(ledger.openingBalance) || 0;
    if (ledger.balanceType === 'Cr' || (ledger.balanceType !== 'Dr' && (groupCat === 'Liabilities' || groupCat === 'Income'))) {
      opening = -Math.abs(opening);
    } else {
      opening = Math.abs(opening);
    }

    const vouchersTotal = vouchers
      .filter(v => v.date <= toDate)
      .reduce((sum, v) => {
        if (['Sales Order', 'Purchase Order', 'Delivery Note', 'Receipt Note'].includes(v.type)) return sum;
        let ledgerChange = 0;
        const amountToUse = (useTaxableForPNL || isPNLAccountType) && v.mode === 'Invoice' ? (v.amount ?? v.totalAmount) : v.totalAmount;

        if (v.mode === 'Double Entry') {
          v.items?.forEach(item => {
            if (item.ledgerId === ledgerId) {
              ledgerChange += (item.type === 'Dr' ? item.amount : -item.amount);
            }
          });
        } else if (v.mode === 'Normal') {
          if (v.ledgerId === ledgerId) {
            if (v.type === 'Payment') ledgerChange -= v.totalAmount;
            else if (v.type === 'Receipt' || v.type === 'Contra') ledgerChange += v.totalAmount;
            else if (v.type === 'Journal') ledgerChange -= v.totalAmount;
          }
          v.items?.forEach(item => {
            if (item.ledgerId === ledgerId) {
              if (v.type === 'Payment') ledgerChange += item.amount;
              else if (v.type === 'Receipt' || v.type === 'Contra') ledgerChange -= item.amount;
              else if (v.type === 'Journal') ledgerChange += item.amount;
            }
          });
          if (!v.items || v.items.length === 0) {
            if (v.debitLedgerId === ledgerId) ledgerChange += v.totalAmount;
            if (v.creditLedgerId === ledgerId) ledgerChange -= v.totalAmount;
          }
        } else if (v.mode === 'Invoice') {
          if (v.ledgerId === ledgerId) {
            if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange += v.totalAmount;
            else if (['Purchase', 'Credit Note'].includes(v.type)) ledgerChange -= v.totalAmount;
            else if (v.type === 'Payment') ledgerChange -= v.totalAmount;
            else if (v.type === 'Receipt') ledgerChange += v.totalAmount;
          }

          const isMatchedSalesPurchaseLedger = v.salesPurchaseLedgerId 
            ? (v.salesPurchaseLedgerId === ledgerId)
            : (['Sales', 'Debit Note'].includes(v.type)
                ? (ledger.group === 'Sales Accounts' || ledger.name.toLowerCase() === 'sales a/c')
                : (ledger.group === 'Purchase Accounts' || ledger.name.toLowerCase() === 'purchase a/c'));

          if (isMatchedSalesPurchaseLedger) {
            if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= amountToUse;
            else if (['Purchase', 'Credit Note'].includes(v.type)) ledgerChange += amountToUse;
          }

          if (v.additionalCharges && Array.isArray(v.additionalCharges)) {
            v.additionalCharges.forEach(charge => {
              if (charge.ledgerId === ledgerId) {
                const chargeAmt = Number(charge.amount) || 0;
                if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= chargeAmt;
                else ledgerChange += chargeAmt;
              }
            });
          }

          if (!isMatchedSalesPurchaseLedger && v.items && Array.isArray(v.items)) {
            v.items.forEach(item => {
              if (item.ledgerId === ledgerId) {
                if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= (Number(item.amount) || 0);
                else ledgerChange += (Number(item.amount) || 0);
              }
            });
          }

          ledgerChange += getGstTaxForLedger(ledger, v);
        }

        if (v.type === 'Manufacturing Journal' && v.additionalCharges && Array.isArray(v.additionalCharges)) {
          v.additionalCharges.forEach(charge => {
            if (charge.ledgerId === ledgerId) {
              ledgerChange -= (Number(charge.amount) || 0);
            }
          });
        }

        return sum + ledgerChange;
      }, 0);
    
    return opening + vouchersTotal;
  };

  const getLedgerBalance = (ledgerId: string, isPeriod: boolean = true) => {
    if (isPeriod) {
      const filtered = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to);
      return filtered.reduce((sum, v) => {
        return sum + getVoucherLedgerChange(v, ledgerId, true);
      }, 0);
    }
    return getLedgerBalanceAsOf(ledgerId, dateRange.to);
  };

  const getLedgerOutstandingAging = (ledgerId: string, balance: number, type: 'RECEIVABLES' | 'PAYABLES') => {
    let remaining = Math.abs(balance);
    const buckets = { current: 0, intermediate: 0, old: 0, oldest: 0 };
    if (remaining <= 0) return buckets;

    const ledgerVouchers = vouchers
      .filter(v => v.date <= dateRange.to && v.ledgerId === ledgerId)
      .filter(v => {
        if (type === 'RECEIVABLES') {
          return ['Sales', 'Credit Note'].includes(v.type) || (v.mode === 'Double Entry' && v.items?.some(i => i.ledgerId === ledgerId && i.type === 'Dr'));
        } else {
          return ['Purchase', 'Debit Note'].includes(v.type) || (v.mode === 'Double Entry' && v.items?.some(i => i.ledgerId === ledgerId && i.type === 'Cr'));
        }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const parseDaysPassed = (dateStr: string) => {
      const d1 = new Date(dateStr);
      const d2 = new Date(dateRange.to);
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return isNaN(diffDays) ? 0 : diffDays;
    };

    for (const v of ledgerVouchers) {
      if (remaining <= 0) break;
      const vAmount = v.totalAmount;
      const days = parseDaysPassed(v.date);
      const alloc = Math.min(remaining, vAmount);
      
      if (days >= 0 && days <= 15) {
        buckets.current += alloc;
      } else if (days > 15 && days <= 30) {
        buckets.intermediate += alloc;
      } else if (days > 30 && days <= 60) {
        buckets.old += alloc;
      } else {
        buckets.oldest += alloc;
      }
      remaining -= alloc;
    }
    
    if (remaining > 0) {
      buckets.oldest += remaining;
    }
    
    return buckets;
  };

  const getVoucherLedgerChange = (v: Voucher, ledgerId: string, useTaxableForPNL: boolean = false) => {
    const ledger = reportLedgers.find(l => l.id === ledgerId) || ledgers.find(l => l.id === ledgerId);
    if (!ledger) return 0;
    const groupCat = getGroupCategory(ledger.group);
    const isPNLGroup = ['Income', 'Expenses'].includes(groupCat);
    const isPNLAccountType = isPNLGroup || ['Purchase Accounts', 'Sales Accounts', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes', 'Indirect Incomes'].some(g => ledger.group === g);
    
    let ledgerChange = 0;
    if (['Sales Order', 'Purchase Order', 'Delivery Note', 'Receipt Note'].includes(v.type)) return 0;
    
    const amountToUse = (useTaxableForPNL || isPNLAccountType) && v.mode === 'Invoice' ? (v.amount ?? v.totalAmount) : v.totalAmount;

    if (v.mode === 'Double Entry') {
      v.items?.forEach(item => {
        if (item.ledgerId === ledgerId) {
          ledgerChange += (item.type === 'Dr' ? item.amount : -item.amount);
        }
      });
    } else if (v.mode === 'Normal') {
      if (v.ledgerId === ledgerId) {
        if (v.type === 'Payment') ledgerChange -= v.totalAmount;
        else if (v.type === 'Receipt' || v.type === 'Contra') ledgerChange += v.totalAmount;
        else if (v.type === 'Journal') ledgerChange -= v.totalAmount;
      }
      v.items?.forEach(item => {
        if (item.ledgerId === ledgerId) {
          if (v.type === 'Payment') ledgerChange += item.amount;
          else if (v.type === 'Receipt' || v.type === 'Contra') ledgerChange -= item.amount;
          else if (v.type === 'Journal') ledgerChange += item.amount;
        }
      });
      if (!v.items || v.items.length === 0) {
        if (v.debitLedgerId === ledgerId) ledgerChange += v.totalAmount;
        if (v.creditLedgerId === ledgerId) ledgerChange -= v.totalAmount;
      }
    } else if (v.mode === 'Invoice') {
      if (v.ledgerId === ledgerId) {
        if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange += v.totalAmount;
        else if (['Purchase', 'Credit Note'].includes(v.type)) ledgerChange -= v.totalAmount;
        else if (v.type === 'Payment') ledgerChange -= v.totalAmount;
        else if (v.type === 'Receipt') ledgerChange += v.totalAmount;
      }

      const isMatchedSalesPurchaseLedger = v.salesPurchaseLedgerId 
        ? (v.salesPurchaseLedgerId === ledgerId)
        : (['Sales', 'Debit Note'].includes(v.type)
            ? (ledger.group === 'Sales Accounts' || ledger.name.toLowerCase() === 'sales a/c')
            : (ledger.group === 'Purchase Accounts' || ledger.name.toLowerCase() === 'purchase a/c'));

      if (isMatchedSalesPurchaseLedger) {
        if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= amountToUse;
        else if (['Purchase', 'Credit Note'].includes(v.type)) ledgerChange += amountToUse;
      }

      if (v.additionalCharges && Array.isArray(v.additionalCharges)) {
        v.additionalCharges.forEach(charge => {
          if (charge.ledgerId === ledgerId) {
            const chargeAmt = Number(charge.amount) || 0;
            if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= chargeAmt;
            else ledgerChange += chargeAmt;
          }
        });
      }

      if (!isMatchedSalesPurchaseLedger && v.items && Array.isArray(v.items)) {
        v.items.forEach(item => {
          if (item.ledgerId === ledgerId) {
            if (['Sales', 'Debit Note'].includes(v.type)) ledgerChange -= (Number(item.amount) || 0);
            else ledgerChange += (Number(item.amount) || 0);
          }
        });
      }

      ledgerChange += getGstTaxForLedger(ledger, v);
    }

    if (v.type === 'Manufacturing Journal' && v.additionalCharges && Array.isArray(v.additionalCharges)) {
      v.additionalCharges.forEach(charge => {
        if (charge.ledgerId === ledgerId) {
          ledgerChange -= (Number(charge.amount) || 0);
        }
      });
    }

    return ledgerChange;
  };

  const financialData = React.useMemo(() => {
    const isPurchaseLedger = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      const n = (l.name || '').toLowerCase();
      return g === 'purchase accounts' || g === 'purchase account' || g === 'purchases' || g === 'purchase' || n.includes('purchase');
    };
    const isSalesLedger = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      const n = (l.name || '').toLowerCase();
      return g === 'sales accounts' || g === 'sales account' || g === 'sales' || n.includes('sales');
    };
    const isDirectExp = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      return (g === 'direct expenses' || g.includes('direct exp')) && !isPurchaseLedger(l);
    };
    const isDirectInc = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      return (g === 'direct incomes' || g.includes('direct inc')) && !isSalesLedger(l);
    };

    const isStockLedger = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      const n = (l.name || '').toLowerCase();
      return g === 'stock-in-hand' || g.includes('stock') || n === 'stock-in-hand' || n === 'closing stock';
    };
    const stockLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Assets' && isStockLedger(l));
    const stockLedgersOpening = stockLedgers.reduce((s, l) => s + (Number(l.openingBalance) || 0), 0);
    const stockLedgersBal = stockLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);

    const productsStockValue = products.reduce((sum, p) => sum + ((p.stockQuantity || 0) * (p.purchasePrice || 0)), 0);
    const productsOpeningStock = products.reduce((sum, p) => sum + ((p.openingStock || 0) * (p.purchasePrice || 0)), 0);

    const openingStockValue = stockLedgersOpening > 0 ? stockLedgersOpening : productsOpeningStock;
    const closingStockValue = productsStockValue > 0 ? productsStockValue : (stockLedgersBal > 0 ? stockLedgersBal : 0);

    const purchaseTotal = reportLedgers.filter(isPurchaseLedger).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
    const directExpTotal = reportLedgers.filter(isDirectExp).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
    const salesTotal = -reportLedgers.filter(isSalesLedger).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
    const directIncTotal = -reportLedgers.filter(isDirectInc).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

    const grossProfit = (salesTotal + directIncTotal + closingStockValue) - (openingStockValue + purchaseTotal + directExpTotal);

    const indirectExpTotal = reportLedgers
      .filter(l => getGroupCategory(l.group) === 'Expenses' && !isPurchaseLedger(l) && !isDirectExp(l))
      .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

    const indirectIncTotal = -reportLedgers
      .filter(l => getGroupCategory(l.group) === 'Income' && !isSalesLedger(l) && !isDirectInc(l))
      .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

    const isPL = (name: string) => {
      const n = (name || '').toLowerCase();
      return n === 'profit & loss a/c' || n === 'profit & loss' || n === 'p & l a/c' || n === 'p&l a/c' || n.includes('profit & loss') || n.includes('p & l') || n.includes('p&l');
    };
    const plLedger = reportLedgers.find(l => isPL(l.name));
    const plOpenSigned = plLedger?.openingBalance 
      ? ((plLedger.balanceType === 'Dr' || plLedger.openingBalance < 0) ? -Math.abs(plLedger.openingBalance) : Math.abs(plLedger.openingBalance))
      : 0;

    const currentNetProfit = (grossProfit + indirectIncTotal) - indirectExpTotal;
    const netProfit = currentNetProfit + plOpenSigned;

    return {
      openingStockValue,
      closingStockValue,
      purchaseTotal,
      directExpTotal,
      salesTotal,
      directIncTotal,
      grossProfit,
      indirectExpTotal,
      indirectIncTotal,
      currentNetProfit,
      plOpeningBalance: plOpenSigned,
      netProfit
    };
  }, [vouchers, ledgers, products, dateRange, reportLedgers]);

  const exportToExcel = () => {
    let data: any[] = [];
    let filename = "Accounting_Report.xlsx";

    if (reportType === 'STOCK') {
      data = products.map(p => {
        const { inwards, outwards } = getStockStats(p.id!);
        return {
          [t('product_name')]: p.name,
          [t('hsn_code')]: p.hsnCode || '',
          [t('opening_qty')]: p.openingStock || 0,
          [t('inwards_purchase')]: inwards,
          [t('outwards_sales')]: outwards,
          [t('closing_qty')]: p.stockQuantity,
          [t('unit')]: p.unit,
          [t('rate')]: p.purchasePrice,
          [t('value')]: p.stockQuantity * p.purchasePrice
        };
      });
      filename = "Stock_Summary.xlsx";
    } else if (reportType === 'POS_REGISTER') {
      data = vouchers
        .filter(v => v.type === 'Sales' && v.isPos && v.date >= dateRange.from && v.date <= dateRange.to)
        .map(v => {
          const cashAmt = v.posPaymentMode === 'Cash' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCashAmount || 0) : 0);
          const cardAmt = v.posPaymentMode === 'Card' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCardAmount || 0) : 0);
          return {
            'Date': v.date,
            'Invoice No': v.voucherNumber,
            'Customer Name': ledgers.find(l => l.id === v.ledgerId)?.name || 'Walk-in Customer',
            'Payment Mode': v.posPaymentMode || 'Cash',
            'Sub Total': v.amount || 0,
            'Tax (GST)': (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0),
            'Total Amount': v.totalAmount || 0,
            'Cash Amount': cashAmt,
            'Card Amount': cardAmt,
          };
        });
      filename = `POS_Register_${dateRange.from}_to_${dateRange.to}.xlsx`;
    } else if (reportType === 'DAYBOOK') {
      data = vouchers
        .filter(v => v.date >= dateRange.from && v.date <= dateRange.to)
        .map(v => ({
          [t('date')]: v.date,
          [t('type')]: v.type,
          [t('number')]: v.voucherNumber,
          [t('particulars')]: ledgers.find(l => l.id === v.ledgerId)?.name || t('unknown'),
          [t('amount')]: v.totalAmount,
          [t('narration')]: v.narration
        }));
      filename = `Daybook_${dateRange.from}_to_${dateRange.to}.xlsx`;
    } else if (reportType === 'LEDGER') {
      const ledger = ledgers.find(l => l.id === selectedLedgerId);
      let balance = ledger?.openingBalance || 0;
      data = vouchers
        .filter(v => (v.ledgerId === selectedLedgerId || v.salesPurchaseLedgerId === selectedLedgerId || v.debitLedgerId === selectedLedgerId || v.creditLedgerId === selectedLedgerId || v.items?.some(i => i.ledgerId === selectedLedgerId)) && v.date >= dateRange.from && v.date <= dateRange.to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(v => {
          const ledgerChange = getVoucherLedgerChange(v, selectedLedgerId);
          const debit = ledgerChange > 0 ? ledgerChange : 0;
          const credit = ledgerChange < 0 ? -ledgerChange : 0;
          balance += (debit - credit);
          return {
            [t('date')]: v.date,
            [t('voucher')]: `${v.type} #${v.voucherNumber}`,
            [t('debit')]: debit,
            [t('credit')]: credit,
            [t('balance')]: formatBalance(balance)
          };
        });
      filename = `Ledger_${ledger?.name || 'Report'}.xlsx`;
    } else if (reportType === 'TRIAL_BALANCE') {
      data = reportLedgers.map(l => {
        const balance = getLedgerBalanceAsOf(l.id!, dateRange.to);
        return {
          [t('ledger_name')]: l.name,
          [t('group')]: l.group,
          [t('debit')]: balance > 0 ? balance : 0,
          [t('credit')]: balance < 0 ? Math.abs(balance) : 0
        };
      });
      filename = `Trial_Balance_${dateRange.to}.xlsx`;
    } else if (reportType === 'CASH_FLOW') {
      const inflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Receipt' || v.type === 'Sales'));
      const outflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Payment' || v.type === 'Purchase'));
      
      data = [
        ...inflows.map(v => ({ [t('type')]: t('inflow'), [t('date')]: v.date, [t('voucher')]: `${v.type} #${v.voucherNumber}`, [t('particulars')]: ledgers.find(l => l.id === v.ledgerId)?.name, [t('amount')]: v.totalAmount })),
        ...outflows.map(v => ({ [t('type')]: t('outflow'), [t('date')]: v.date, [t('voucher')]: `${v.type} #${v.voucherNumber}`, [t('particulars')]: ledgers.find(l => l.id === v.ledgerId)?.name, [t('amount')]: -v.totalAmount }))
      ];
      filename = `Cash_Flow_${dateRange.from}_to_${dateRange.to}.xlsx`;
    } else if (reportType === 'PL') {
      const totalTradingDr = financialData.openingStockValue + financialData.purchaseTotal + financialData.directExpTotal + financialData.grossProfit;
      const totalTradingCr = financialData.salesTotal + financialData.directIncTotal + financialData.closingStockValue;
      
      const totalPlDr = financialData.indirectExpTotal + (financialData.netProfit > 0 ? financialData.netProfit : 0);
      const totalPlCr = financialData.indirectIncTotal + financialData.grossProfit + (financialData.netProfit < 0 ? Math.abs(financialData.netProfit) : 0);

      data = [
        { [t('particulars')]: t('opening_stock'), [t('amount')]: financialData.openingStockValue },
        { [t('particulars')]: t('purchase_accounts'), [t('amount')]: financialData.purchaseTotal },
        { [t('particulars')]: t('direct_expenses'), [t('amount')]: financialData.directExpTotal },
        { [t('particulars')]: t('gross_profit'), [t('amount')]: financialData.grossProfit },
        { [t('particulars')]: t('total_trading_dr'), [t('amount')]: totalTradingDr },
        { [t('particulars')]: '---', [t('amount')]: '---' },
        { [t('particulars')]: t('sales_accounts'), [t('amount')]: financialData.salesTotal },
        { [t('particulars')]: t('direct_incomes'), [t('amount')]: financialData.directIncTotal },
        { [t('particulars')]: t('closing_stock'), [t('amount')]: financialData.closingStockValue },
        { [t('particulars')]: t('total_trading_cr'), [t('amount')]: totalTradingCr },
        { [t('particulars')]: '---', [t('amount')]: '---' },
        { [t('particulars')]: t('indirect_expenses'), [t('amount')]: financialData.indirectExpTotal },
        { [t('particulars')]: t('net_profit'), [t('amount')]: financialData.netProfit > 0 ? financialData.netProfit : 0 },
        { [t('particulars')]: t('total_pl_dr'), [t('amount')]: totalPlDr },
        { [t('particulars')]: '---', [t('amount')]: '---' },
        { [t('particulars')]: t('indirect_incomes'), [t('amount')]: financialData.indirectIncTotal },
        { [t('particulars')]: t('gross_profit_bf'), [t('amount')]: financialData.grossProfit },
        { [t('particulars')]: t('net_loss'), [t('amount')]: financialData.netProfit < 0 ? Math.abs(financialData.netProfit) : 0 },
        { [t('particulars')]: t('total_pl_cr'), [t('amount')]: totalPlCr }
      ];
      filename = `Profit_Loss_${dateRange.from}_to_${dateRange.to}.xlsx`;
    } else if (reportType === 'BS') {
      const capitalGroups = ['Capital Account', 'Reserves & Surplus'];
      const loanLiabGroups = ['Loans (Liability)', 'Secured Loans', 'Unsecured Loans', 'Bank OCC A/c', 'Bank OD A/c'];
      const currentLiabGroups = ['Current Liabilities', 'Provisions', 'Sundry Creditors', 'Suspense Account', 'Branch / Divisions'];

      const fixedAssetGroups = ['Fixed Assets'];
      const investmentGroups = ['Investments'];
      const currentAssetGroups = ['Current Assets', 'Bank Accounts', 'Cash-in-Hand', 'Sundry Debtors', 'Deposits (Asset)', 'Loans & Advances (Asset)', 'Misc. Expenses (Asset)'];

      const isPL = (name: string) => {
        const n = name.toLowerCase();
        return n === 'profit & loss a/c' || n === 'profit & loss' || n === 'p & l a/c' || n === 'p&l a/c' || n.includes('profit & loss') || n.includes('p & l') || n.includes('p&l');
      };

      const getGroupBalance = (groups: string[]) => {
        return ledgers
          .filter(l => groups.includes(l.group) && !isPL(l.name))
          .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
      };

      const capitalBal = -getGroupBalance(capitalGroups);
      const loansBal = -getGroupBalance(loanLiabGroups);
      const currentLiabBal = -getGroupBalance(currentLiabGroups);

      const fixedAssetsBal = getGroupBalance(fixedAssetGroups);
      const investmentsBal = getGroupBalance(investmentGroups);
      const currentAssetsBal = getGroupBalance(currentAssetGroups);

      const totalDrOpening = ledgers
        .filter(l => !isPL(l.name))
        .reduce((sum, l) => {
          const cat = getGroupCategory(l.group);
          let opening = l.openingBalance || 0;
          if (cat === 'Liabilities' || cat === 'Income') opening = -opening;
          return sum + (opening > 0 ? opening : 0);
        }, 0);
      const totalCrOpening = ledgers
        .filter(l => !isPL(l.name))
        .reduce((sum, l) => {
          const cat = getGroupCategory(l.group);
          let opening = l.openingBalance || 0;
          if (cat === 'Liabilities' || cat === 'Income') opening = -opening;
          return sum + (opening < 0 ? Math.abs(opening) : 0);
        }, 0);
      const diffOpening = totalDrOpening - totalCrOpening;

      const gstOnSales = vouchers
        .filter(v => v.date <= dateRange.to && ['Sales', 'Debit Note'].includes(v.type))
        .reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);
      
      const gstOnPurchases = vouchers
        .filter(v => v.date <= dateRange.to && ['Purchase', 'Credit Note'].includes(v.type))
        .reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);

      const gstTotal = gstOnSales - gstOnPurchases;
      const stockValue = products.reduce((sum, p) => sum + (p.stockQuantity * p.purchasePrice), 0);
      const netProfit = financialData.netProfit;

      const totalLiabilitiesRaw = capitalBal + loansBal + currentLiabBal + 
        (gstTotal > 0 ? gstTotal : 0) + 
        (diffOpening > 0 ? diffOpening : 0) + 
        (netProfit > 0 ? netProfit : 0);

      const totalAssetsRaw = fixedAssetsBal + investmentsBal + currentAssetsBal + stockValue + 
        (gstTotal < 0 ? Math.abs(gstTotal) : 0) + 
        (diffOpening < 0 ? Math.abs(diffOpening) : 0) + 
        (netProfit < 0 ? Math.abs(netProfit) : 0);
        
      const diffInBooks = totalLiabilitiesRaw - totalAssetsRaw;
      const grandTotal = Math.max(totalLiabilitiesRaw, totalAssetsRaw);

      data = [
        { [t('liabilities')]: t('capital_account'), [t('liabilities_amount')]: Math.abs(capitalBal), [t('assets')]: t('fixed_assets'), [t('assets_amount')]: fixedAssetsBal },
        { [t('liabilities')]: t('loans_liability'), [t('liabilities_amount')]: Math.abs(loansBal), [t('assets')]: t('investments'), [t('assets_amount')]: investmentsBal },
        { [t('liabilities')]: t('current_liabilities'), [t('liabilities_amount')]: Math.abs(currentLiabBal + gstTotal + diffOpening), [t('assets')]: t('current_assets'), [t('assets_amount')]: currentAssetsBal },
        { [t('liabilities')]: t('profit_loss_account'), [t('liabilities_amount')]: netProfit > 0 ? netProfit : 0, [t('assets')]: t('closing_stock'), [t('assets_amount')]: stockValue },
        { [t('liabilities')]: diffInBooks < -0.01 ? 'Capital A/c' : '', [t('liabilities_amount')]: diffInBooks < -0.01 ? Math.abs(diffInBooks) : 0, [t('assets')]: netProfit < 0 ? t('profit_loss_account_loss') : (diffInBooks > 0.01 ? 'Capital A/c' : ''), [t('assets_amount')]: netProfit < 0 ? Math.abs(netProfit) : (diffInBooks > 0.01 ? Math.abs(diffInBooks) : 0) },
        { [t('liabilities')]: t('total'), [t('liabilities_amount')]: grandTotal, [t('assets')]: t('total'), [t('assets_amount')]: grandTotal }
      ];
      filename = `Balance_Sheet_${dateRange.to}.xlsx`;
    } else if (reportType === 'COST_CENTER') {
      const filteredCostCenters = costCenters.filter(cc => {
        if (selectedCostCenterId !== 'all') return cc.id === selectedCostCenterId;
        if (selectedCostCategoryId !== 'all') {
          if (selectedCostCategoryId === 'primary') return !cc.categoryId;
          return cc.categoryId === selectedCostCategoryId;
        }
        return true;
      });
      const costCenterBalances: Record<string, { dr: number, cr: number }> = {};
      filteredCostCenters.forEach(cc => {
        costCenterBalances[cc.id] = { dr: 0, cr: 0 };
      });
      vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to).forEach(v => {
        v.items?.forEach(item => {
          item.costCenterAllocations?.forEach(alloc => {
            if (costCenterBalances[alloc.costCenterId]) {
              let isDr = item.type === 'Dr';
              if (v.mode === 'Invoice') {
                if (['Sales', 'Credit Note', 'Receipt'].includes(v.type)) {
                  isDr = false;
                } else {
                  isDr = true;
                }
              }
              if (isDr) {
                costCenterBalances[alloc.costCenterId].dr += alloc.amount;
              } else {
                costCenterBalances[alloc.costCenterId].cr += alloc.amount;
              }
            }
          });
        });
      });

      costCategories.forEach(cat => {
        const catCenters = filteredCostCenters.filter(cc => cc.categoryId === cat.id);
        if (catCenters.length > 0) {
          const catDr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
          const catCr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
          const catBal = catDr - catCr;
          data.push({
            'Category / Cost Centre': cat.name,
            'Total Debit': catDr,
            'Total Credit': catCr,
            'Net Balance': catBal
          });
          catCenters.forEach(cc => {
            const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
            data.push({
              'Category / Cost Centre': `  ${cc.name}`,
              'Total Debit': costCenterBalances[cc.id]?.dr || 0,
              'Total Credit': costCenterBalances[cc.id]?.cr || 0,
              'Net Balance': bal
            });
          });
        }
      });
      if (filteredCostCenters.filter(cc => !cc.categoryId).length > 0) {
        const noCatCenters = filteredCostCenters.filter(cc => !cc.categoryId);
        const catDr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
        const catCr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
        const catBal = catDr - catCr;
        data.push({
          'Category / Cost Centre': 'Primary Cost Category',
          'Total Debit': catDr,
          'Total Credit': catCr,
          'Net Balance': catBal
        });
        filteredCostCenters.filter(cc => !cc.categoryId).forEach(cc => {
          const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
          data.push({
            'Category / Cost Centre': `  ${cc.name}`,
            'Total Debit': costCenterBalances[cc.id]?.dr || 0,
            'Total Credit': costCenterBalances[cc.id]?.cr || 0,
            'Net Balance': bal
          });
        });
      }
      filename = `Cost_Centre_Report_${dateRange.from}_to_${dateRange.to}.xlsx`;
    } else {
      data = vouchers.map(v => ({
        [t('date')]: v.date,
        [t('type')]: v.type,
        [t('voucher_number')]: v.voucherNumber,
        [t('ledger')]: ledgers.find(l => l.id === v.ledgerId)?.name || t('unknown'),
        [t('amount')]: v.amount,
        [t('gst')]: (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0),
        [t('total')]: v.totalAmount,
        [t('narration')]: v.narration
      }));
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType === 'STOCK' ? "Stock" : "Vouchers");
    XLSX.writeFile(wb, filename);
  };

  const generatePDF = (action: 'download' | 'print' = 'download', printWindow?: Window | null) => {
    const doc = new jsPDF();
    const tEn = (key: string) => i18n.t(key, { lng: 'en' });
    
    if (activeCompany) {
      doc.setFontSize(18);
      doc.text(activeCompany.name, 14, 15);
      doc.setFontSize(10);
      doc.text(`${activeCompany.state}, ${activeCompany.country} | FY: ${activeCompany.financialYear}`, 14, 22);
      
      const title = reportType === 'POS_REGISTER' ? "POS Register" : tEn(reportType === 'STOCK' ? "stock_summary_report" : 
                    reportType === 'GODOWN_SUMMARY' ? "godown_summary" :
                    reportType === 'DAYBOOK' ? "day_book_report" :
                    reportType === 'LEDGER' ? "ledger_report" :
                    reportType === 'TRIAL_BALANCE' ? "trial_balance" :
                    reportType === 'CASH_FLOW' ? "cash_flow_statement" :
                    reportType === 'PL' ? "profit_loss_account" :
                    reportType === 'BS' ? "balance_sheet" :
                    reportType === 'GST' ? "gst_report" :
                    reportType === 'OUTSTANDING' ? "outstanding_report" : "accounting_report");
      doc.setFontSize(14);
      doc.text(title, 14, 32);
      doc.setFontSize(10);
      doc.text(`${tEn('period')}: ${dateRange.from} ${tEn('to')} ${dateRange.to}`, 14, 38);
    } else {
      const title = reportType === 'POS_REGISTER' ? "POS Register" : tEn(reportType === 'STOCK' ? "stock_summary_report" : 
                      reportType === 'GODOWN_SUMMARY' ? "godown_summary" :
                      reportType === 'DAYBOOK' ? "day_book_report" :
                      reportType === 'LEDGER' ? "ledger_report" :
                      reportType === 'TRIAL_BALANCE' ? "trial_balance" :
                      reportType === 'CASH_FLOW' ? "cash_flow_statement" :
                      reportType === 'PL' ? "profit_loss_account" :
                      reportType === 'BS' ? "balance_sheet" :
                      reportType === 'GST' ? "gst_report" :
                      reportType === 'OUTSTANDING' ? "outstanding_report" : "accounting_report");
      doc.text(`${activeCompany?.name || 'Smart Accounting'} - ${title}`, 14, 15);
    }
    
    let head: string[][] = [];
    let body: any[][] = [];

    if (reportType === 'STOCK') {
      head = [[tEn('product'), tEn('hsn_code'), tEn('opening'), tEn('inwards'), tEn('outwards'), tEn('closing'), tEn('value')]];
      body = products.map(p => {
        const { inwards, outwards } = getStockStats(p.id!);
        return [
          p.name,
          p.hsnCode || '-',
          (p.openingStock || 0).toString(),
          inwards.toString(),
          outwards.toString(),
          `${p.stockQuantity} ${p.unit}`,
          formatCurrency(p.stockQuantity * p.purchasePrice)
        ];
      });
    } else if (reportType === 'GODOWN_SUMMARY') {
      head = [['Godown', 'Item Name', 'Available Stock', 'Value']];
      body = [];
      [{ id: 'Main Location', name: 'Main Location' }, ...godowns].filter(g => selectedGodownId === 'all' || g.id === selectedGodownId).forEach(g => {
        const godownProducts = products.filter(p => {
          const stock = calculateGodownStock(p.id!, g.id, vouchers);
          return stock > 0 || (p.openingStock && p.openingStock > 0 && g.id === 'Main Location');
        });
        if (godownProducts.length > 0) {
          body.push([{ content: g.name, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } }]);
          godownProducts.forEach(p => {
            const stock = calculateGodownStock(p.id!, g.id, vouchers) + (g.id === 'Main Location' ? (p.openingStock || 0) : 0);
            body.push([
              '',
              p.name,
              `${stock} ${p.unit}`,
              formatCurrency(stock * p.purchasePrice)
            ]);
          });
        }
      });
    } else if (reportType === 'DAYBOOK') {
      head = [[tEn('date'), tEn('type'), tEn('voucher_number'), tEn('particulars'), tEn('amount')]];
      body = vouchers
        .filter(v => v.date >= dateRange.from && v.date <= dateRange.to)
        .map(v => [
          v.date,
          v.type,
          v.voucherNumber,
          ledgers.find(l => l.id === v.ledgerId)?.name || tEn('unknown'),
          formatCurrency(v.totalAmount)
        ]);
    } else if (reportType === 'LEDGER') {
      const ledger = ledgers.find(l => l.id === selectedLedgerId);
      let balance = ledger?.openingBalance || 0;
      head = [[tEn('date'), tEn('voucher'), tEn('debit'), tEn('credit'), tEn('balance')]];
       body = vouchers
        .filter(v => (v.ledgerId === selectedLedgerId || v.salesPurchaseLedgerId === selectedLedgerId || v.debitLedgerId === selectedLedgerId || v.creditLedgerId === selectedLedgerId || v.items?.some(i => i.ledgerId === selectedLedgerId)) && v.date >= dateRange.from && v.date <= dateRange.to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(v => {
          const ledgerChange = getVoucherLedgerChange(v, selectedLedgerId);
          const debit = ledgerChange > 0 ? ledgerChange : 0;
          const credit = ledgerChange < 0 ? -ledgerChange : 0;
          balance += (debit - credit);
          return [
            v.date,
            `${v.type} #${v.voucherNumber}`,
            debit > 0 ? formatCurrency(debit) : '-',
            credit > 0 ? formatCurrency(credit) : '-',
            formatBalance(balance)
          ];
        });
    } else if (reportType === 'TRIAL_BALANCE') {
      head = [[t('ledger_name'), t('group'), t('debit'), t('credit')]];
      body = reportLedgers.map(l => {
        const balance = getLedgerBalanceAsOf(l.id!, dateRange.to);
        if (balance === 0) return null;
        return [
          l.name,
          l.group,
          balance > 0 ? formatCurrency(balance) : '-',
          balance < 0 ? formatCurrency(Math.abs(balance)) : '-'
        ];
      }).filter(Boolean) as any;
    } else if (reportType === 'CASH_FLOW') {
      head = [[t('date'), t('voucher'), t('particulars'), t('inflow'), t('outflow')]];
      const inflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Receipt' || v.type === 'Sales'));
      const outflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Payment' || v.type === 'Purchase'));
      
      body = [
        ...inflows.map(v => [v.date, `${v.type} #${v.voucherNumber}`, ledgers.find(l => l.id === v.ledgerId)?.name || '', formatCurrency(v.totalAmount), '-']),
        ...outflows.map(v => [v.date, `${v.type} #${v.voucherNumber}`, ledgers.find(l => l.id === v.ledgerId)?.name || '', '-', formatCurrency(v.totalAmount)])
      ];
    } else if (reportType === 'PL') {
      head = [[t('particulars'), t('amount')]];
      
      const totalTradingDr = financialData.openingStockValue + financialData.purchaseTotal + financialData.directExpTotal + financialData.grossProfit;
      const totalTradingCr = financialData.salesTotal + financialData.directIncTotal + financialData.closingStockValue;
      
      const totalPlDr = financialData.indirectExpTotal + (financialData.netProfit > 0 ? financialData.netProfit : 0);
      const totalPlCr = financialData.indirectIncTotal + financialData.grossProfit + (financialData.netProfit < 0 ? Math.abs(financialData.netProfit) : 0);

      body = [
        [t('opening_stock'), formatCurrency(financialData.openingStockValue)],
        [t('purchase_accounts'), formatCurrency(financialData.purchaseTotal)],
        [t('direct_expenses'), formatCurrency(financialData.directExpTotal)],
        [t('gross_profit'), formatCurrency(financialData.grossProfit)],
        [t('total_trading_dr'), formatCurrency(totalTradingDr)],
        ['---', '---'],
        [t('sales_accounts'), formatCurrency(financialData.salesTotal)],
        [t('direct_incomes'), formatCurrency(financialData.directIncTotal)],
        [t('closing_stock'), formatCurrency(financialData.closingStockValue)],
        [t('total_trading_cr'), formatCurrency(totalTradingCr)],
        ['---', '---'],
        [t('indirect_expenses'), formatCurrency(financialData.indirectExpTotal)],
        [t('net_profit'), financialData.netProfit > 0 ? formatCurrency(financialData.netProfit) : '-'],
        [t('total_pl_dr'), formatCurrency(totalPlDr)],
        ['---', '---'],
        [t('indirect_incomes'), formatCurrency(financialData.indirectIncTotal)],
        [t('gross_profit_bf'), formatCurrency(financialData.grossProfit)],
        [t('net_loss'), financialData.netProfit < 0 ? formatCurrency(Math.abs(financialData.netProfit)) : '-'],
        [t('total_pl_cr'), formatCurrency(totalPlCr)]
      ];
    } else if (reportType === 'BS') {
      head = [[t('liabilities'), t('liabilities_amount'), t('assets'), t('assets_amount')]];
      
      const capitalGroups = ['Capital Account', 'Reserves & Surplus'];
      const loanLiabGroups = ['Loans (Liability)', 'Secured Loans', 'Unsecured Loans', 'Bank OCC A/c', 'Bank OD A/c'];
      const currentLiabGroups = ['Current Liabilities', 'Provisions', 'Sundry Creditors', 'Suspense Account', 'Branch / Divisions'];

      const fixedAssetGroups = ['Fixed Assets'];
      const investmentGroups = ['Investments'];
      const currentAssetGroups = ['Current Assets', 'Bank Accounts', 'Cash-in-Hand', 'Sundry Debtors', 'Deposits (Asset)', 'Loans & Advances (Asset)', 'Misc. Expenses (Asset)'];

      const isPL = (name: string) => {
        const n = name.toLowerCase();
        return n === 'profit & loss a/c' || n === 'profit & loss' || n === 'p & l a/c' || n === 'p&l a/c' || n.includes('profit & loss') || n.includes('p & l') || n.includes('p&l');
      };

      const getGroupBalance = (groups: string[]) => {
        return ledgers
          .filter(l => groups.includes(l.group) && !isPL(l.name))
          .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
      };

      const capitalBal = -getGroupBalance(capitalGroups);
      const loansBal = -getGroupBalance(loanLiabGroups);
      const currentLiabBal = -getGroupBalance(currentLiabGroups);

      const fixedAssetsBal = getGroupBalance(fixedAssetGroups);
      const investmentsBal = getGroupBalance(investmentGroups);
      const currentAssetsBal = getGroupBalance(currentAssetGroups);

      const totalDrOpening = ledgers
        .filter(l => !isPL(l.name))
        .reduce((sum, l) => {
          const cat = getGroupCategory(l.group);
          let opening = l.openingBalance || 0;
          if (cat === 'Liabilities' || cat === 'Income') opening = -opening;
          return sum + (opening > 0 ? opening : 0);
        }, 0);
      const totalCrOpening = ledgers
        .filter(l => !isPL(l.name))
        .reduce((sum, l) => {
          const cat = getGroupCategory(l.group);
          let opening = l.openingBalance || 0;
          if (cat === 'Liabilities' || cat === 'Income') opening = -opening;
          return sum + (opening < 0 ? Math.abs(opening) : 0);
        }, 0);
      const diffOpening = totalDrOpening - totalCrOpening;

      const gstOnSales = vouchers
        .filter(v => v.date <= dateRange.to && ['Sales', 'Debit Note'].includes(v.type))
        .reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);
      
      const gstOnPurchases = vouchers
        .filter(v => v.date <= dateRange.to && ['Purchase', 'Credit Note'].includes(v.type))
        .reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);

      const gstTotal = gstOnSales - gstOnPurchases;
      const stockValue = products.reduce((sum, p) => sum + (p.stockQuantity * p.purchasePrice), 0);
      const netProfit = financialData.netProfit;

      const totalLiabilitiesRaw = capitalBal + loansBal + currentLiabBal + 
        (gstTotal > 0 ? gstTotal : 0) + 
        (diffOpening > 0 ? diffOpening : 0) + 
        (netProfit > 0 ? netProfit : 0);

      const totalAssetsRaw = fixedAssetsBal + investmentsBal + currentAssetsBal + stockValue + 
        (gstTotal < 0 ? Math.abs(gstTotal) : 0) + 
        (diffOpening < 0 ? Math.abs(diffOpening) : 0) + 
        (netProfit < 0 ? Math.abs(netProfit) : 0);

      const diffInBooks = totalLiabilitiesRaw - totalAssetsRaw;
      const grandTotal = Math.max(totalLiabilitiesRaw, totalAssetsRaw);

      body = [
        [t('capital_account'), formatCurrency(Math.abs(capitalBal)), t('fixed_assets'), formatCurrency(fixedAssetsBal)],
        [t('loans_liability'), formatCurrency(Math.abs(loansBal)), t('investments'), formatCurrency(investmentsBal)],
        [t('current_liabilities'), formatCurrency(Math.abs(currentLiabBal + gstTotal + diffOpening)), t('current_assets'), formatCurrency(currentAssetsBal)],
        [t('profit_loss_account'), netProfit > 0 ? formatCurrency(netProfit) : '-', t('closing_stock'), formatCurrency(stockValue)],
        [diffInBooks < -0.01 ? 'Capital A/c' : '', diffInBooks < -0.01 ? formatCurrency(Math.abs(diffInBooks)) : '', netProfit < 0 ? t('profit_loss_account_loss') : (diffInBooks > 0.01 ? 'Capital A/c' : ''), netProfit < 0 ? formatCurrency(Math.abs(netProfit)) : (diffInBooks > 0.01 ? formatCurrency(Math.abs(diffInBooks)) : '')],
        [t('total'), formatCurrency(grandTotal), t('total'), formatCurrency(grandTotal)]
      ];
    } else if (reportType === 'GST') {
      head = [[t('date'), t('voucher'), t('type'), t('taxable_value'), t('cgst'), t('sgst'), t('igst'), t('total')]];
      body = vouchers
        .filter(v => v.date >= dateRange.from && v.date <= dateRange.to && v.withTax)
        .map(v => [
          v.date,
          `${v.type} #${v.voucherNumber}`,
          v.type,
          formatCurrency(v.amount),
          formatCurrency(v.cgst),
          formatCurrency(v.sgst),
          formatCurrency(v.igst),
          formatCurrency(v.totalAmount)
        ]);
    } else if (reportType === 'OUTSTANDING') {
      head = [[tEn('ledger'), tEn('group'), tEn('pending_amount')]];
      const targetGroup = outstandingType === 'RECEIVABLES' ? 'Sundry Debtors' : 'Sundry Creditors';
      body = ledgers
        .filter(l => l.group === targetGroup)
        .map(l => {
          const balance = getLedgerBalanceAsOf(l.id!, dateRange.to);
          if (balance === 0) return null;
          return [
            l.name,
            l.group,
            formatBalance(balance)
          ];
        })
        .filter(Boolean) as any;
    } else if (reportType === 'COST_CENTER') {
      head = [['Cost Centre', 'Total Debit', 'Total Credit', 'Net Balance']];
      body = [];
      const filteredCostCenters = costCenters.filter(cc => {
        if (selectedCostCenterId !== 'all') return cc.id === selectedCostCenterId;
        if (selectedCostCategoryId !== 'all') {
          if (selectedCostCategoryId === 'primary') return !cc.categoryId;
          return cc.categoryId === selectedCostCategoryId;
        }
        return true;
      });
      const costCenterBalances: Record<string, { dr: number, cr: number }> = {};
      filteredCostCenters.forEach(cc => {
        costCenterBalances[cc.id] = { dr: 0, cr: 0 };
      });
      vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to).forEach(v => {
        v.items?.forEach(item => {
          item.costCenterAllocations?.forEach(alloc => {
            if (costCenterBalances[alloc.costCenterId]) {
              let isDr = item.type === 'Dr';
              if (v.mode === 'Invoice') {
                if (['Sales', 'Credit Note', 'Receipt'].includes(v.type)) {
                  isDr = false;
                } else {
                  isDr = true;
                }
              }
              if (isDr) {
                costCenterBalances[alloc.costCenterId].dr += alloc.amount;
              } else {
                costCenterBalances[alloc.costCenterId].cr += alloc.amount;
              }
            }
          });
        });
      });
      
      costCategories.forEach(cat => {
        const catCenters = filteredCostCenters.filter(cc => cc.categoryId === cat.id);
        if (catCenters.length > 0) {
          const catDr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
          const catCr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
          const catBal = catDr - catCr;

          body.push([
            { content: cat.name, styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
            { content: formatCurrency(catDr), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
            { content: formatCurrency(catCr), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
            { content: catBal === 0 ? '-' : formatBalance(catBal), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } }
          ]);
          catCenters.forEach(cc => {
            const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
            body.push([
              `  ${cc.name}`,
              formatCurrency(costCenterBalances[cc.id]?.dr || 0),
              formatCurrency(costCenterBalances[cc.id]?.cr || 0),
              bal === 0 ? '-' : formatBalance(bal)
            ]);
          });
        }
      });
      if (filteredCostCenters.filter(cc => !cc.categoryId).length > 0) {
        const noCatCenters = filteredCostCenters.filter(cc => !cc.categoryId);
        const catDr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
        const catCr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
        const catBal = catDr - catCr;

        body.push([
          { content: 'Primary Cost Category', styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
          { content: formatCurrency(catDr), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
          { content: formatCurrency(catCr), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
          { content: catBal === 0 ? '-' : formatBalance(catBal), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } }
        ]);
        filteredCostCenters.filter(cc => !cc.categoryId).forEach(cc => {
          const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
          body.push([
            `  ${cc.name}`,
            formatCurrency(costCenterBalances[cc.id]?.dr || 0),
            formatCurrency(costCenterBalances[cc.id]?.cr || 0),
            bal === 0 ? '-' : formatBalance(bal)
          ]);
        });
      }
    } else if (reportType === 'POS_REGISTER') {
      head = [['Date', 'Invoice No', 'Customer Name', 'Payment Mode', 'Sub Total', 'Tax (GST)', 'Total Amount', 'Cash Amt', 'Card Amt']];
      const posVouchers = vouchers
        .filter(v => v.type === 'Sales' && v.isPos && v.date >= dateRange.from && v.date <= dateRange.to)
        .sort((a, b) => a.date.localeCompare(b.date));
      body = posVouchers.map(v => {
        const cashAmt = v.posPaymentMode === 'Cash' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCashAmount || 0) : 0);
        const cardAmt = v.posPaymentMode === 'Card' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCardAmount || 0) : 0);
        const taxAmount = (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0);
        return [
          v.date,
          v.voucherNumber,
          ledgers.find(l => l.id === v.ledgerId)?.name || 'Walk-in Customer',
          v.posPaymentMode || 'Cash',
          formatCurrency(v.amount || 0),
          formatCurrency(taxAmount),
          formatCurrency(v.totalAmount || 0),
          formatCurrency(cashAmt),
          formatCurrency(cardAmt),
        ];
      });
      
      // Calculate totals for summary bottom row in PDF
      const grandSubTotal = posVouchers.reduce((sum, v) => sum + (v.amount || 0), 0);
      const grandTaxTotal = posVouchers.reduce((sum, v) => sum + ((v.cgst || 0) + (v.sgst || 0) + (v.igst || 0)), 0);
      const grandTotalAmount = posVouchers.reduce((sum, v) => sum + (v.totalAmount || 0), 0);
      const grandCashAmount = posVouchers.reduce((sum, v) => {
        const amt = v.posPaymentMode === 'Cash' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCashAmount || 0) : 0);
        return sum + amt;
      }, 0);
      const grandCardAmount = posVouchers.reduce((sum, v) => {
        const amt = v.posPaymentMode === 'Card' ? (v.totalAmount || 0) : (v.posPaymentMode === 'Multi-Mode' ? (v.posCardAmount || 0) : 0);
        return sum + amt;
      }, 0);
      
      body.push([
        { content: 'Grand Total', styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
        `(${posVouchers.length} Invoices)`,
        '',
        '',
        { content: formatCurrency(grandSubTotal), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
        { content: formatCurrency(grandTaxTotal), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
        { content: formatCurrency(grandTotalAmount), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
        { content: formatCurrency(grandCashAmount), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } },
        { content: formatCurrency(grandCardAmount), styles: { fontStyle: 'bold', fillColor: [238, 243, 238] } }
      ]);
    } else {
      head = [[tEn('date'), tEn('type'), tEn('voucher_number'), tEn('ledger'), tEn('total')]];
      body = vouchers.map(v => [
        v.date,
        v.type,
        v.voucherNumber,
        ledgers.find(l => l.id === v.ledgerId)?.name || tEn('unknown'),
        formatCurrency(v.totalAmount)
      ]);
    }

    autoTable(doc, {
      head: head,
      body: body,
      startY: activeCompany ? 45 : 25,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didParseCell: function(data) {
        if (reportType === 'BS' && data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [15, 23, 42];
        }
        if (reportType === 'PL') {
          const firstCellRaw = data.row.raw[0];
          if (typeof firstCellRaw === 'string' && firstCellRaw.startsWith('Total')) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [15, 23, 42];
          }
        }
      }
    });

    if (action === 'print' && printWindow) {
      doc.autoPrint();
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      printWindow.location.href = blobUrl;
    } else if (action === 'download') {
      doc.save(`${reportType}_Report_${dateRange.from}_to_${dateRange.to}.pdf`);
    }
  };

  const exportToPDF = () => generatePDF('download');
  
  const handleAiInsights = async () => {
    if (!activeCompany) return;
    setIsAiLoading(true);
    try {
      const insights = await getFinancialInsights(financialData, activeCompany.name, reportType);
      setAiInsights(insights);
      setIsAiModalOpen(true);
    } catch (error: any) {
      toast.error("Failed to generate AI insights: " + error.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="report-print-area">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3 no-print">
          <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <h1 className="text-2xl font-bold text-gray-900">{t('reports')}</h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleAiInsights}
            disabled={isAiLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-wait shadow-md"
          >
            {isAiLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            <span>{t('AI Insights')}</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <Printer size={18} />
            <span>{t('print')}</span>
          </button>
          <button
            onClick={exportToPDF}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            <Download size={18} />
            <span>{t('export_pdf')}</span>
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <FileText size={18} />
            <span>{t('export_excel')}</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-[#003c46] no-print overflow-x-auto bg-[#004d5a] p-1 rounded-sm gap-1">
        <button
          onClick={() => { setReportType('DAYBOOK'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'DAYBOOK' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('daybook')}
        </button>
        <button
          onClick={() => { setReportType('LEDGER'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'LEDGER' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('account_book')}
        </button>
        <button
          onClick={() => { setReportType('PL'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'PL' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('profit_and_loss')}
        </button>
        <button
          onClick={() => { setReportType('BS'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'BS' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('balance_sheet')}
        </button>
        <button
          onClick={() => { setReportType('GST'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'GST' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('gst_report')}
        </button>
        <button
          onClick={() => { setReportType('STOCK'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'STOCK' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('stock_summary')}
        </button>
        {activeCompany?.enableGodowns !== false && (
          <button
            onClick={() => { setReportType('GODOWN_SUMMARY'); setSelectedIndex(0); }}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
              reportType === 'GODOWN_SUMMARY' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
            }`}
          >
            Godown Summary
          </button>
        )}
        <button
          onClick={() => { setReportType('TRIAL_BALANCE'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'TRIAL_BALANCE' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('trial_balance')}
        </button>
        <button
          onClick={() => { setReportType('CASH_FLOW'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'CASH_FLOW' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          Cash Flow
        </button>
        <button
          onClick={() => { setReportType('OUTSTANDING'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'OUTSTANDING' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          Outstanding
        </button>
        <button
          onClick={() => { setReportType('BRS'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
            reportType === 'BRS' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          {t('BRS') || 'Bank reconciliation'}
        </button>
        <button
          onClick={() => { setReportType('POS_REGISTER'); setSelectedIndex(0); }}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm shrink-0 ${
            reportType === 'POS_REGISTER' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
          }`}
        >
          POS Register
        </button>
        {activeCompany?.enableCostCenters !== false && (
          <button
            onClick={() => { setReportType('COST_CENTER'); setSelectedIndex(0); }}
            className={`px-4 py-2 text-xs font-mono font-bold uppercase transition-colors rounded-sm ${
              reportType === 'COST_CENTER' ? 'bg-[#ffcb2b] text-[#002f3c]' : 'text-white hover:bg-[#003c46] hover:text-[#ffcb2b]'
            }`}
          >
            Cost Centre
          </button>
        )}
      </div>

      <div className="bg-[#fcfcf0] shadow-md border-2 border-[#003c46]/60 rounded-sm overflow-hidden print:overflow-visible p-6 border-t-[10px] border-t-[#004d5a] font-mono text-[#002f3c]">
        <div className="flex flex-wrap items-end gap-3.5 mb-6 p-3 bg-[#eef3ee] border border-[#004d5a]/20 rounded-none no-print text-xs">
          <div className="space-y-0.5">
            <label className="text-[10px] font-bold text-[#004d5a] uppercase">{t('from')}</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="block w-full px-3 py-1 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] font-bold text-[#004d5a] uppercase">{t('to')}</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="block w-full px-3 py-1 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
            />
          </div>
          {reportType === 'GODOWN_SUMMARY' && (
            <div className="space-y-0.5 flex-1 min-w-[200px] flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-[#004d5a] uppercase">Select Godown</label>
                <select
                  value={selectedGodownId}
                  onChange={(e) => setSelectedGodownId(e.target.value)}
                  className="block w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                >
                  <option value="all">All Godowns</option>
                  <option value="Main Location">Main Location</option>
                  {godowns.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {reportType === 'LEDGER' && (
            <div className="space-y-0.5 flex-1 min-w-[200px] flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-[#004d5a] uppercase">{t('select_ledger')}</label>
                <select
                  value={selectedLedgerId}
                  onChange={(e) => setSelectedLedgerId(e.target.value)}
                  className="block w-full px-3 py-1 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                >
                  <option value="">{t('choose_ledger')}</option>
                  {ledgers.sort((a, b) => a.name.localeCompare(b.name)).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              {selectedLedgerId && ledgers.find(l => l.id === selectedLedgerId)?.phone && (
                <button
                  onClick={() => {
                    const ledger = ledgers.find(l => l.id === selectedLedgerId);
                    if (ledger) {
                      const balance = getLedgerBalanceAsOf(ledger.id!, dateRange.to);
                      const absBalance = Math.abs(balance);
                      const cleanPhone = ledger.phone!.replace(/\D/g, '');
                      const message = `Dear ${ledger.name}, this is a reminder regarding your current balance of ${formatCurrency(absBalance)} (${balance > 0 ? 'Dr' : 'Cr'}). Period: ${dateRange.from} to ${dateRange.to}.`;
                      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                      window.open(url, '_blank');
                    }
                  }}
                  className="px-3 bg-emerald-700 hover:bg-emerald-850 text-white rounded-none border border-emerald-800 text-[11px] font-bold font-mono tracking-wider transition-all flex items-center gap-1.5 h-[26px]"
                  title="Send WhatsApp Reminder"
                >
                  <MessageCircle size={12} />
                  <span>Remind</span>
                </button>
              )}
              {selectedLedgerId && (
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                  <button
                    onClick={() => setShowInterestCalc(!showInterestCalc)}
                    className={`px-3 text-[11px] font-bold font-mono tracking-wider transition-all flex items-center gap-1 h-[26.5px] border ${
                      showInterestCalc 
                        ? 'bg-[#ffcb2b] text-[#002f3c] border-[#ffcb2b]' 
                        : 'bg-[#003c46] hover:bg-[#002f3c] text-[#ffcb2b] border-[#003c46]'
                    }`}
                    title="Toggle automatic Interest Calculation statement"
                  >
                    <span>Interest: {showInterestCalc ? 'ON' : 'OFF'}</span>
                  </button>
                  {showInterestCalc && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-white border border-[#003c46]/30 px-2 h-[26.5px] rounded-sm">
                        <span className="text-[10px] font-extrabold text-[#004d5a] uppercase">Rate:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={interestRate}
                          onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
                          className="w-10 text-xs font-bold font-mono text-[#002f3c] bg-transparent border-none focus:ring-0 p-0 text-center outline-none"
                          title="Annual Interest Rate Percentage"
                        />
                        <span className="text-[10px] font-extrabold text-[#004d5a]">% p.a.</span>
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-[#003c46]/30 px-2 h-[26.5px] rounded-sm">
                        <span className="text-[10px] font-extrabold text-amber-700 uppercase">Grace Days:</span>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          value={interestGraceDays}
                          onChange={(e) => setInterestGraceDays(Math.max(0, Number(e.target.value) || 0))}
                          className="w-10 text-xs font-bold font-mono text-amber-800 bg-transparent border-none focus:ring-0 p-0 text-center outline-none"
                          title="Interest Grace/Concession Days (to subtract)"
                        />
                        <span className="text-[10px] font-extrabold text-amber-700 font-bold">Days</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {reportType === 'OUTSTANDING' && (
            <div className="space-y-0.5 flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold text-[#004d5a] uppercase">{t('type')}</label>
              <select
                value={outstandingType}
                onChange={(e) => setOutstandingType(e.target.value as any)}
                className="block w-full px-3 py-1 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
              >
                <option value="RECEIVABLES">{t('bills_receivable')}</option>
                <option value="PAYABLES">{t('bills_payable')}</option>
              </select>
            </div>
          )}
          {reportType === 'COST_CENTER' && (
            <div className="space-y-0.5 flex-1 min-w-[200px] flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-[#004d5a] uppercase">Select Cost Category</label>
                <select
                  value={selectedCostCategoryId}
                  onChange={(e) => {
                    setSelectedCostCategoryId(e.target.value);
                    if (e.target.value !== 'all') {
                      setSelectedCostCenterId('all');
                    }
                  }}
                  className="block w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                >
                  <option value="all">All Categories</option>
                  <option value="primary">Primary Cost Category</option>
                  {costCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-[#004d5a] uppercase">Select Cost Centre</label>
                <select
                  value={selectedCostCenterId}
                  onChange={(e) => setSelectedCostCenterId(e.target.value)}
                  className="block w-full px-3 py-1.5 bg-white border border-[#003c46]/30 text-[#002f3c] rounded-none text-xs font-bold outline-none focus:border-[#004d5a]"
                >
                  <option value="all">All Cost Centres</option>
                  {costCategories.length > 0 ? (
                    <>
                      {costCategories.map(cat => {
                        const catCenters = costCenters.filter(cc => cc.categoryId === cat.id);
                        if (catCenters.length === 0) return null;
                        if (selectedCostCategoryId !== 'all' && selectedCostCategoryId !== cat.id) return null;
                        return (
                          <optgroup key={cat.id} label={cat.name}>
                            {catCenters.map(cc => (
                              <option key={cc.id} value={cc.id}>{cc.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {costCenters.filter(cc => !cc.categoryId).length > 0 && (
                        (selectedCostCategoryId === 'all' || selectedCostCategoryId === 'primary') && (
                        <optgroup label="Primary Cost Category">
                          {costCenters.filter(cc => !cc.categoryId).map(cc => (
                            <option key={cc.id} value={cc.id}>{cc.name}</option>
                          ))}
                        </optgroup>
                        )
                      )}
                    </>
                  ) : (
                    costCenters.filter(cc => {
                      if (selectedCostCategoryId === 'primary') return !cc.categoryId;
                      if (selectedCostCategoryId !== 'all') return cc.categoryId === selectedCostCategoryId;
                      return true;
                    }).map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          {reportType === 'PL' ? (
            <div className="bg-[#fcfcf0] border border-[#003c46]/40 rounded-sm font-mono text-xs pb-8 text-[#002f3c]">
              {/* Header */}
              <div className="grid grid-cols-2 border-b-2 border-[#003c46] bg-[#004d5a] font-bold text-[#ffcb2b] uppercase text-[11px] tracking-wider font-mono">
                <div className="flex justify-between p-3.5 border-r border-[#003c46]">
                  <span>Particulars</span>
                  <span>Amount</span>
                </div>
                <div className="flex justify-between p-3.5">
                  <span>Particulars</span>
                  <span>Amount</span>
                </div>
              </div>

              {(() => {
                const totalTradingDr = financialData.openingStockValue + financialData.purchaseTotal + financialData.directExpTotal + (financialData.grossProfit > 0 ? financialData.grossProfit : 0);
                const totalTradingCr = financialData.salesTotal + financialData.directIncTotal + financialData.closingStockValue + (financialData.grossProfit < 0 ? Math.abs(financialData.grossProfit) : 0);
                
                const totalPlDr = financialData.indirectExpTotal + (financialData.grossProfit < 0 ? Math.abs(financialData.grossProfit) : 0) + (financialData.netProfit > 0 ? financialData.netProfit : 0);
                const totalPlCr = financialData.indirectIncTotal + (financialData.grossProfit > 0 ? financialData.grossProfit : 0) + (financialData.netProfit < 0 ? Math.abs(financialData.netProfit) : 0);

                return (
                  <div>
                    {/* TRADING ACCOUNT */}
                    <div className="grid grid-cols-2 min-h-[200px]">
                      {/* Debit Side - Expenses */}
                      <div className="border-r border-gray-300 p-3 space-y-1">
                        <div className="flex justify-between text-gray-800">
                          <span>Opening Stock</span>
                          <span className="font-medium">{formatBalance(financialData.openingStockValue)}</span>
                        </div>
                        
                        {financialData.purchaseTotal > 0 && (
                          <div className="pt-2">
                            <span className="font-bold text-gray-800">Purchase Accounts</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Purchase Accounts' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.purchaseTotal)}
                            </div>
                          </div>
                        )}

                        {financialData.directExpTotal > 0 && (
                          <div className="pt-2">
                            <span className="font-bold text-gray-800">Direct Expenses</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Direct Expenses' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.directExpTotal)}
                            </div>
                          </div>
                        )}

                        {financialData.grossProfit > 0 && (
                          <div className="flex justify-between font-bold text-gray-900 pt-3 mt-4 border-t border-dashed border-gray-300">
                            <span>Gross Profit c/o</span>
                            <span>{formatBalance(financialData.grossProfit)}</span>
                          </div>
                        )}
                      </div>

                      {/* Credit Side - Incomes */}
                      <div className="p-3 space-y-1">
                        {financialData.salesTotal > 0 && (
                          <div>
                            <span className="font-bold text-gray-800">Sales Accounts</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Sales Accounts' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(-getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.salesTotal)}
                            </div>
                          </div>
                        )}

                        {financialData.directIncTotal > 0 && (
                          <div className="pt-2">
                            <span className="font-bold text-gray-800">Direct Incomes</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Direct Incomes' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(-getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.directIncTotal)}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between text-gray-800 pt-2">
                          <span>Closing Stock</span>
                          <span className="font-medium">{formatBalance(financialData.closingStockValue)}</span>
                        </div>

                        {financialData.grossProfit < 0 && (
                          <div className="flex justify-between font-bold text-gray-900 pt-3 mt-4 border-t border-dashed border-gray-300">
                            <span>Gross Loss c/o</span>
                            <span>{formatBalance(Math.abs(financialData.grossProfit))}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* TRADING TOTALS */}
                    <div className="grid grid-cols-2 border-t border-b-4 border-double border-[#003c46] font-bold text-[#002f3c] bg-[#eef3ee] font-mono">
                      <div className="flex justify-between p-2.5 border-r border-gray-300">
                        <span>Total</span>
                        <span>{formatBalance(totalTradingDr)}</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Total</span>
                        <span>{formatBalance(totalTradingCr)}</span>
                      </div>
                    </div>

                    {/* PROFIT & LOSS ACCOUNT */}
                    <div className="grid grid-cols-2 min-h-[200px] mt-4">
                      {/* Debit Side - Indirect Expenses */}
                      <div className="border-r border-gray-300 p-3 space-y-1">
                        {financialData.grossProfit < 0 && (
                          <div className="flex justify-between font-medium text-gray-800 mb-2">
                            <span>Gross Loss b/f</span>
                            <span>{formatBalance(Math.abs(financialData.grossProfit))}</span>
                          </div>
                        )}

                        {financialData.indirectExpTotal > 0 && (
                          <div className="pt-2">
                            <span className="font-bold text-gray-800">Indirect Expenses</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Indirect Expenses' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.indirectExpTotal)}
                            </div>
                          </div>
                        )}

                        {financialData.netProfit > 0 && (
                          <div className="flex justify-between font-bold text-blue-800 pt-3 mt-4 border-t border-dashed border-gray-300">
                            <span>Net Profit</span>
                            <span>{formatBalance(financialData.netProfit)}</span>
                          </div>
                        )}
                      </div>

                      {/* Credit Side - Indirect Incomes */}
                      <div className="p-3 space-y-1">
                        {financialData.grossProfit > 0 && (
                          <div className="flex justify-between font-medium text-gray-800 mb-2">
                            <span>Gross Profit b/f</span>
                            <span>{formatBalance(financialData.grossProfit)}</span>
                          </div>
                        )}

                        {financialData.indirectIncTotal > 0 && (
                          <div className="pt-2">
                            <span className="font-bold text-gray-800">Indirect Incomes</span>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1 border-b border-gray-100">
                              {ledgers.filter(l => l.group === 'Indirect Incomes' && getLedgerBalance(l.id!) !== 0).map(l => (
                                <div key={l.id} className="flex justify-between">
                                  <span>{l.name}</span>
                                  <span>{formatBalance(-getLedgerBalance(l.id!))}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end font-medium text-gray-800 mt-1">
                              {formatBalance(financialData.indirectIncTotal)}
                            </div>
                          </div>
                        )}

                        {financialData.netProfit < 0 && (
                          <div className="flex justify-between font-bold text-rose-700 pt-3 mt-4 border-t border-dashed border-gray-300">
                            <span>Net Loss</span>
                            <span>{formatBalance(Math.abs(financialData.netProfit))}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PL TOTALS */}
                    <div className="grid grid-cols-2 border-t border-b-4 border-double border-[#003c46] font-bold text-[#002f3c] bg-[#eef3ee] font-mono">
                      <div className="flex justify-between p-2.5 border-r border-gray-300">
                        <span>Total</span>
                        <span>{formatBalance(totalPlDr)}</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Total</span>
                        <span>{formatBalance(totalPlCr)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : reportType === 'BS' ? (
            <div className="bg-[#fcfcf0] border border-[#003c46]/40 rounded-sm font-mono text-xs pb-8 text-[#002f3c]">
              {/* Header */}
              <div className="grid grid-cols-2 border-b-2 border-[#003c46] bg-[#004d5a] font-bold text-[#ffcb2b] uppercase text-[11px] tracking-wider font-mono">
                <div className="flex justify-between p-3.5 border-r border-[#003c46]">
                  <span>{t('liabilities')}</span>
                  <span>{t('amount')}</span>
                </div>
                <div className="flex justify-between p-3.5">
                  <span>{t('assets')}</span>
                  <span>{t('amount')}</span>
                </div>
              </div>

              {(() => {
                const formatSubItem = (amount: number, isLiabilitySide: boolean) => {
                  if (amount === 0) return formatCurrency(0);
                  if (amount < 0) {
                    return isLiabilitySide 
                      ? `${formatCurrency(Math.abs(amount))} Dr` 
                      : `${formatCurrency(Math.abs(amount))} Cr`;
                  }
                  return formatCurrency(amount);
                };

                const isPL = (name: string) => {
                  const n = (name || '').toLowerCase();
                  return n === 'profit & loss a/c' || n === 'profit & loss' || n === 'p & l a/c' || n === 'p&l a/c' || n.includes('profit & loss') || n.includes('p & l') || n.includes('p&l');
                };

                const plLedger = reportLedgers.find(l => isPL(l.name));
                const plOpenSigned = plLedger?.openingBalance 
                  ? ((plLedger.balanceType === 'Dr' || plLedger.openingBalance < 0) ? -Math.abs(plLedger.openingBalance) : Math.abs(plLedger.openingBalance))
                  : 0;

                // 1. Grouping logic for Balance Sheet Ledgers
                const isCapital = (l: Ledger) => {
                  if (isPL(l.name)) return false;
                  const g = (l.group || '').toLowerCase();
                  return g === 'capital account' || g === 'reserves & surplus' || g.includes('capital') || g.includes('reserve');
                };

                const isLoan = (l: Ledger) => {
                  if (isPL(l.name) || isCapital(l)) return false;
                  const g = (l.group || '').toLowerCase();
                  return g.includes('loan') || g.includes('bank occ') || g.includes('bank od') || g.includes('borrowing');
                };

                const isFixedAsset = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  return g === 'fixed assets' || g.includes('fixed asset');
                };

                const isInvestment = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  return g === 'investments' || g.includes('investment');
                };

                const isStockLedger = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  const n = (l.name || '').toLowerCase();
                  return g === 'stock-in-hand' || g.includes('stock') || n === 'stock-in-hand' || n === 'closing stock';
                };

                const isDutiesTaxes = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  const n = (l.name || '').toLowerCase();
                  return g.includes('duties') || g.includes('tax') || n.includes('cgst') || n.includes('sgst') || n.includes('igst') || n === 'gst';
                };

                // Stock calculations
                const stockLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Assets' && isStockLedger(l));
                const stockLedgersOpening = stockLedgers.reduce((s, l) => s + (Number(l.openingBalance) || 0), 0);
                const stockLedgersBal = stockLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);

                const productsStockValue = products.reduce((sum, p) => sum + ((p.stockQuantity || 0) * (p.purchasePrice || 0)), 0);
                const productsOpeningStock = products.reduce((sum, p) => sum + ((p.openingStock || 0) * (p.purchasePrice || 0)), 0);

                const effectiveClosingStock = productsStockValue > 0 ? productsStockValue : (stockLedgersBal > 0 ? stockLedgersBal : 0);
                const effectiveOpeningStock = stockLedgersOpening > 0 ? stockLedgersOpening : productsOpeningStock;

                // Liabilities side ledgers
                const capitalLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Liabilities' && isCapital(l));
                const loanLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Liabilities' && isLoan(l));
                const allCurrentLiabLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Liabilities' && !isPL(l.name) && !isCapital(l) && !isLoan(l));
                const dutiesLedgers = allCurrentLiabLedgers.filter(isDutiesTaxes);
                const otherCurrentLiabLedgers = allCurrentLiabLedgers.filter(l => !isDutiesTaxes(l));

                // Assets side ledgers (exclude stock ledgers to prevent double counting with effectiveClosingStock)
                const fixedAssetLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Assets' && isFixedAsset(l));
                const investmentLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Assets' && isInvestment(l));
                const currentAssetLedgers = reportLedgers.filter(l => getGroupCategory(l.group) === 'Assets' && !isFixedAsset(l) && !isInvestment(l) && !isStockLedger(l));

                // 2. Net Profit Calculation across ALL P&L Ledgers (as of dateRange.to)
                const isPurchaseLedger = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  const n = (l.name || '').toLowerCase();
                  return g === 'purchase accounts' || g === 'purchase account' || g === 'purchases' || g === 'purchase' || n.includes('purchase');
                };
                const isSalesLedger = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  const n = (l.name || '').toLowerCase();
                  return g === 'sales accounts' || g === 'sales account' || g === 'sales' || n.includes('sales');
                };
                const isDirectExp = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  return (g === 'direct expenses' || g.includes('direct exp')) && !isPurchaseLedger(l);
                };
                const isDirectInc = (l: Ledger) => {
                  const g = (l.group || '').toLowerCase();
                  return (g === 'direct incomes' || g.includes('direct inc')) && !isSalesLedger(l);
                };

                const purchaseTotal = reportLedgers.filter(isPurchaseLedger).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
                const directExpTotal = reportLedgers.filter(isDirectExp).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
                const salesTotal = -reportLedgers.filter(isSalesLedger).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);
                const directIncTotal = -reportLedgers.filter(isDirectInc).reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

                const grossProfit = (salesTotal + directIncTotal + effectiveClosingStock) - (effectiveOpeningStock + purchaseTotal + directExpTotal);

                const indirectExpTotal = reportLedgers
                  .filter(l => getGroupCategory(l.group) === 'Expenses' && !isPurchaseLedger(l) && !isDirectExp(l))
                  .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

                const indirectIncTotal = -reportLedgers
                  .filter(l => getGroupCategory(l.group) === 'Income' && !isSalesLedger(l) && !isDirectInc(l))
                  .reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to, true), 0);

                const currentNetProfit = (grossProfit + indirectIncTotal) - indirectExpTotal;
                const netProfit = currentNetProfit + plOpenSigned;

                // 3. Difference in Opening Balances
                let totalDrOpening = 0;
                let totalCrOpening = 0;

                reportLedgers.forEach(l => {
                  if (isPL(l.name)) return;
                  const rawOpening = Number(l.openingBalance) || 0;
                  if (!rawOpening) return;
                  const cat = getGroupCategory(l.group);
                  const isCr = l.balanceType === 'Cr' || (l.balanceType !== 'Dr' && (cat === 'Liabilities' || cat === 'Income'));
                  if (isCr) {
                    totalCrOpening += Math.abs(rawOpening);
                  } else {
                    totalDrOpening += Math.abs(rawOpening);
                  }
                });

                if (plLedger?.openingBalance) {
                  if (plOpenSigned >= 0) {
                    totalCrOpening += Math.abs(plOpenSigned);
                  } else {
                    totalDrOpening += Math.abs(plOpenSigned);
                  }
                }

                if (stockLedgersOpening === 0 && productsOpeningStock > 0) {
                  totalDrOpening += productsOpeningStock;
                }

                const diffOpening = Math.round((totalDrOpening - totalCrOpening) * 100) / 100;

                // 4. GST balancing from Duties & Taxes
                const otherCurrentLiabBal = -otherCurrentLiabLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
                const dutiesLedgersBal = -dutiesLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);

                const effectiveGstPayable = dutiesLedgersBal > 0 ? dutiesLedgersBal : 0;
                const effectiveGstReceivable = dutiesLedgersBal < 0 ? Math.abs(dutiesLedgersBal) : 0;

                // 5. Group Balances
                const capitalBal = -capitalLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
                const loansBal = -loanLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
                const currentAssetsBal = currentAssetLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
                const fixedAssetsBal = fixedAssetLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);
                const investmentsBal = investmentLedgers.reduce((sum, l) => sum + getLedgerBalanceAsOf(l.id!, dateRange.to), 0);

                const currentLiabTotal = otherCurrentLiabBal + effectiveGstPayable;
                const currentAssetsTotal = currentAssetsBal + effectiveClosingStock + effectiveGstReceivable;

                // 6. Balance Sheet Totals
                const totalLiabilitiesRaw = capitalBal + loansBal + currentLiabTotal + 
                  (diffOpening > 0 ? diffOpening : 0) + 
                  (netProfit >= 0 ? netProfit : 0);

                const totalAssetsRaw = fixedAssetsBal + investmentsBal + currentAssetsTotal + 
                  (diffOpening < 0 ? Math.abs(diffOpening) : 0) + 
                  (netProfit < 0 ? Math.abs(netProfit) : 0);

                const diffInBooks = Math.round((totalLiabilitiesRaw - totalAssetsRaw) * 100) / 100;
                const grandTotal = Math.max(totalLiabilitiesRaw, totalAssetsRaw);

                return (
                  <div>
                    <div className="grid grid-cols-2 min-h-[300px]">
                      {/* Liabilities Side */}
                      <div className="border-r border-gray-300 p-3 space-y-3">
                        {/* Capital Account */}
                        {capitalBal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('capital_account')}</span>
                              <span>{formatCurrency(capitalBal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {capitalLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = -getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, true)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Loans (Liability) */}
                        {loansBal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>Loans (Liability)</span>
                              <span>{formatCurrency(loansBal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {loanLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = -getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, true)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Current Liabilities */}
                        {currentLiabTotal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('current_liabilities')}</span>
                              <span>{formatCurrency(currentLiabTotal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {otherCurrentLiabLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = -getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, true)}</span>
                                  </div>
                                );
                              })}
                              {dutiesLedgers.filter(l => -getLedgerBalanceAsOf(l.id!, dateRange.to) > 0).map(l => {
                                const bal = -getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, true)}</span>
                                  </div>
                                );
                              })}
                              {dutiesLedgers.length === 0 && effectiveGstPayable > 0 && (
                                <div className="flex justify-between">
                                  <span>{t('gst_payable')}</span>
                                  <span>{formatCurrency(effectiveGstPayable)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Profit & Loss Account (Net Profit) */}
                        {netProfit > 0 && (
                          <div className="pt-2 mt-2 border-t border-dashed border-gray-300">
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('profit_loss_account')}</span>
                              <span>{formatCurrency(netProfit)}</span>
                            </div>
                            {plOpenSigned !== 0 && (
                              <div className="pl-4 space-y-0.5 text-[11px] text-gray-500 mt-0.5">
                                <div className="flex justify-between">
                                  <span>Opening Balance</span>
                                  <span>{formatCurrency(Math.abs(plOpenSigned))}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Current Period Net Profit</span>
                                  <span>{formatCurrency(currentNetProfit)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Diff. in Opening Balances */}
                        {diffOpening > 0 && (
                          <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-dashed border-gray-300">
                            <span>{t('diff_opening_balances')}</span>
                            <span>{formatCurrency(diffOpening)}</span>
                          </div>
                        )}

                        {/* Balancing difference (Suspense) */}
                        {diffInBooks < -0.01 && (
                          <div className="flex justify-between font-bold text-amber-700 pt-2 mt-2 border-t border-dashed border-amber-300">
                            <span>Diff. in Balancing (Suspense A/c)</span>
                            <span>{formatCurrency(Math.abs(diffInBooks))}</span>
                          </div>
                        )}
                      </div>

                      {/* Assets Side */}
                      <div className="p-3 space-y-3">
                        {/* Fixed Assets */}
                        {fixedAssetsBal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('fixed_assets')}</span>
                              <span>{formatCurrency(fixedAssetsBal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {fixedAssetLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, false)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Investments */}
                        {investmentsBal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>Investments</span>
                              <span>{formatCurrency(investmentsBal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {investmentLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, false)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Current Assets */}
                        {currentAssetsTotal !== 0 && (
                          <div>
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('current_assets')}</span>
                              <span>{formatCurrency(currentAssetsTotal)}</span>
                            </div>
                            <div className="pl-4 space-y-1 italic text-gray-600 mt-1 pb-1">
                              {currentAssetLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) !== 0).map(l => {
                                const bal = getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, false)}</span>
                                  </div>
                                );
                              })}
                              {effectiveClosingStock > 0 && (
                                <div className="flex justify-between">
                                  <span>{t('closing_stock')}</span>
                                  <span>{formatCurrency(effectiveClosingStock)}</span>
                                </div>
                              )}
                              {dutiesLedgers.filter(l => getLedgerBalanceAsOf(l.id!, dateRange.to) > 0).map(l => {
                                const bal = getLedgerBalanceAsOf(l.id!, dateRange.to);
                                return (
                                  <div key={l.id} className="flex justify-between">
                                    <span>{l.name}</span>
                                    <span>{formatSubItem(bal, false)}</span>
                                  </div>
                                );
                              })}
                              {dutiesLedgers.length === 0 && effectiveGstReceivable > 0 && (
                                <div className="flex justify-between">
                                  <span>{t('gst_receivable')}</span>
                                  <span>{formatCurrency(effectiveGstReceivable)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Profit & Loss Account (Net Loss) */}
                        {netProfit < 0 && (
                          <div className="pt-2 mt-2 border-t border-dashed border-gray-300">
                            <div className="flex justify-between font-bold text-gray-800">
                              <span>{t('profit_loss_account_loss')}</span>
                              <span>{formatCurrency(Math.abs(netProfit))}</span>
                            </div>
                            {plOpenSigned !== 0 && (
                              <div className="pl-4 space-y-0.5 text-[11px] text-gray-500 mt-0.5">
                                <div className="flex justify-between">
                                  <span>Opening Balance</span>
                                  <span>{formatCurrency(Math.abs(plOpenSigned))}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Current Period Net Loss</span>
                                  <span>{formatCurrency(Math.abs(currentNetProfit))}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Diff. in Opening Balances */}
                        {diffOpening < 0 && (
                          <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-dashed border-gray-300">
                            <span>{t('diff_opening_balances')}</span>
                            <span>{formatCurrency(Math.abs(diffOpening))}</span>
                          </div>
                        )}

                        {/* Balancing difference (Suspense) */}
                        {diffInBooks > 0.01 && (
                          <div className="flex justify-between font-bold text-amber-700 pt-2 mt-2 border-t border-dashed border-amber-300">
                            <span>Diff. in Balancing (Suspense A/c)</span>
                            <span>{formatCurrency(diffInBooks)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BS TOTALS */}
                    <div className="grid grid-cols-2 border-t border-b-4 border-double border-[#003c46] font-bold text-[#002f3c] bg-[#eef3ee] font-mono">
                      <div className="flex justify-between p-2.5 border-r border-gray-300">
                        <span>Total</span>
                        <span>{formatCurrency(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between p-2.5">
                        <span>Total</span>
                        <span>{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : reportType === 'GST' ? (
            <div className="space-y-6">
              {/* GST Returns Sub-Tabs */}
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit no-print">
                <button
                  onClick={() => setGstSubTab('OVERVIEW')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                    gstSubTab === 'OVERVIEW'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Overview Summary
                </button>
                <button
                  onClick={() => setGstSubTab('GSTR1')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                    gstSubTab === 'GSTR1'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  GSTR-1 (Outward Supplies)
                </button>
                <button
                  onClick={() => setGstSubTab('GSTR3B')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                    gstSubTab === 'GSTR3B'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  GSTR-3B (Returns)
                </button>
                <button
                  onClick={() => setGstSubTab('OTHER_TAXES')}
                  className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
                    gstSubTab === 'OTHER_TAXES'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Other Taxes (VAT, TDS, etc)
                </button>
              </div>

              {gstSubTab === 'OVERVIEW' && (
                <div className="space-y-8 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(() => {
                      const gstVouchers = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (!v.taxType || v.taxType === 'GST'));
                      const salesGst = gstVouchers.filter(v => ['Sales', 'Debit Note'].includes(v.type));
                      const purchaseGst = gstVouchers.filter(v => ['Purchase', 'Credit Note'].includes(v.type));
                      
                      const totalSalesTaxable = salesGst.reduce((sum, v) => sum + (v.amount || 0), 0);
                      const totalSalesGst = salesGst.reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);
                      
                      const totalPurchaseTaxable = purchaseGst.reduce((sum, v) => sum + (v.amount || 0), 0);
                      const totalPurchaseGst = purchaseGst.reduce((sum, v) => sum + (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0), 0);

                      return (
                        <>
                          <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-emerald-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-emerald-800 uppercase">GST</div>
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">{t('outward_supplies')} (Collected)</p>
                            <h4 className="text-2xl font-bold text-emerald-950">{formatCurrency(totalSalesGst)}</h4>
                            <p className="text-xs text-emerald-700 mt-1">{t('taxable')}: {formatCurrency(totalSalesTaxable)}</p>
                          </div>
                          <div className="bg-rose-50 p-6 rounded-xl border border-rose-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-rose-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-rose-800 uppercase">GST</div>
                            <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">{t('inward_supplies')} (Paid / ITC)</p>
                            <h4 className="text-2xl font-bold text-rose-950">{formatCurrency(totalPurchaseGst)}</h4>
                            <p className="text-xs text-rose-700 mt-1">{t('taxable')}: {formatCurrency(totalPurchaseTaxable)}</p>
                          </div>
                          <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-blue-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-blue-800 uppercase">GST Liability</div>
                            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-0.5">{totalSalesGst >= totalPurchaseGst ? 'Net Payable To Govt' : 'Net Refundable / ITC'}</p>
                            <h4 className="text-2xl font-bold text-blue-950">{formatCurrency(Math.abs(totalSalesGst - totalPurchaseGst))}</h4>
                            <p className="text-xs text-blue-700 mt-1">{t('period')}: {dateRange.from} to {dateRange.to}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden print:overflow-visible">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-4 font-semibold">{t('voucher')}</th>
                          <th className="px-6 py-4 font-semibold">{t('party_name')}</th>
                          <th className="px-6 py-4 font-semibold">{t('gstin')}</th>
                          <th className="px-6 py-4 font-semibold text-right">{t('taxable_value')}</th>
                          <th className="px-6 py-4 font-semibold text-right">{t('cgst')}</th>
                          <th className="px-6 py-4 font-semibold text-right">{t('sgst')}</th>
                          <th className="px-6 py-4 font-semibold text-right">{t('igst')}</th>
                          <th className="px-6 py-4 font-semibold text-right">{t('total_tax')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {vouchers
                          .filter(v => v.date >= dateRange.from && v.date <= dateRange.to && ['Sales', 'Purchase', 'Credit Note', 'Debit Note'].includes(v.type) && (!v.taxType || v.taxType === 'GST'))
                          .map(v => {
                            const party = ledgers.find(l => l.id === v.ledgerId);
                            const totalTax = (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0);
                            return (
                              <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{v.type} #{v.voucherNumber}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{party?.name || 'Unknown'}</td>
                                <td className="px-6 py-4 text-xs font-mono text-gray-500">{party?.gstNumber || '-'}</td>
                                <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">{formatCurrency(v.amount || 0)}</td>
                                <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(v.cgst || 0)}</td>
                                <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(v.sgst || 0)}</td>
                                <td className="px-6 py-4 text-sm text-gray-600 text-right">{formatCurrency(v.igst || 0)}</td>
                                <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">{formatCurrency(totalTax)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {gstSubTab === 'GSTR1' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                    <h4 className="text-sm font-bold text-blue-900">GSTR-1 Outward Supplies Summary</h4>
                    <p className="text-xs text-blue-700 mt-1">
                      Contains details of outward supplies of goods or services made to registered (B2B) and unregistered (B2C) parties.
                    </p>
                  </div>

                  {/* B2B Invoices Section */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                      <h4 className="text-sm font-bold text-gray-800">4A, 4B, 4C, 6B, 6C - B2B Taxable Invoices</h4>
                      <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded">Registered Party Sales</span>
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Party Name</th>
                          <th className="px-6 py-3 font-semibold">GSTIN</th>
                          <th className="px-6 py-3 font-semibold">Invoice No</th>
                          <th className="px-6 py-3 font-semibold">Date</th>
                          <th className="px-6 py-3 font-semibold text-right">Taxable Value</th>
                          <th className="px-6 py-3 font-semibold text-right">CGST</th>
                          <th className="px-6 py-3 font-semibold text-right">SGST</th>
                          <th className="px-6 py-3 font-semibold text-right">IGST</th>
                          <th className="px-6 py-3 font-semibold text-right">Total Invoice</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(() => {
                          const b2bVouchers = vouchers.filter(v => 
                            v.date >= dateRange.from && 
                            v.date <= dateRange.to && 
                            ['Sales', 'Debit Note'].includes(v.type) &&
                            (!v.taxType || v.taxType === 'GST') &&
                            ledgers.find(l => l.id === v.ledgerId)?.gstNumber
                          );

                          if (b2bVouchers.length === 0) {
                            return <tr><td colSpan={9} className="px-6 py-4 text-center text-gray-400">No B2B Invoices Found</td></tr>;
                          }

                          return b2bVouchers.map(v => {
                            const party = ledgers.find(l => l.id === v.ledgerId);
                            return (
                              <tr key={v.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 font-bold text-gray-800">{party?.name}</td>
                                <td className="px-6 py-3 font-mono text-xs">{party?.gstNumber}</td>
                                <td className="px-6 py-3 font-medium">#{v.voucherNumber}</td>
                                <td className="px-6 py-3">{v.date}</td>
                                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(v.amount || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.cgst || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.sgst || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.igst || 0)}</td>
                                <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(v.totalAmount)}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* B2C Invoices Section */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                      <h4 className="text-sm font-bold text-gray-800">7 - B2C (Others) Outward Supplies</h4>
                      <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-1 rounded">Unregistered Sales</span>
                    </div>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Party Name / Category</th>
                          <th className="px-6 py-3 font-semibold">Invoice No</th>
                          <th className="px-6 py-3 font-semibold">Date</th>
                          <th className="px-6 py-3 font-semibold text-right">Taxable Value</th>
                          <th className="px-6 py-3 font-semibold text-right">CGST</th>
                          <th className="px-6 py-3 font-semibold text-right">SGST</th>
                          <th className="px-6 py-3 font-semibold text-right">IGST</th>
                          <th className="px-6 py-3 font-semibold text-right">Total Invoice</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(() => {
                          const b2cVouchers = vouchers.filter(v => 
                            v.date >= dateRange.from && 
                            v.date <= dateRange.to && 
                            ['Sales', 'Debit Note'].includes(v.type) &&
                            (!v.taxType || v.taxType === 'GST') &&
                            !ledgers.find(l => l.id === v.ledgerId)?.gstNumber
                          );

                          if (b2cVouchers.length === 0) {
                            return <tr><td colSpan={8} className="px-6 py-4 text-center text-gray-400">No B2C Invoices Found</td></tr>;
                          }

                          return b2cVouchers.map(v => {
                            const party = ledgers.find(l => l.id === v.ledgerId);
                            return (
                              <tr key={v.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 font-bold text-gray-800">{party?.name || 'Cash Customer'}</td>
                                <td className="px-6 py-3 font-medium">#{v.voucherNumber}</td>
                                <td className="px-6 py-3">{v.date}</td>
                                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(v.amount || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.cgst || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.sgst || 0)}</td>
                                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(v.igst || 0)}</td>
                                <td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(v.totalAmount)}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {gstSubTab === 'GSTR3B' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg">
                    <h4 className="text-sm font-bold text-purple-900">GSTR-3B Self-Declaration return</h4>
                    <p className="text-xs text-purple-700 mt-1">
                      Contains details of outward taxable supplies and eligible input tax credit (ITC) calculated automatically based on your ledger activity.
                    </p>
                  </div>

                  {(() => {
                    const gstVouchers = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (!v.taxType || v.taxType === 'GST'));
                    
                    const salesGst = gstVouchers.filter(v => ['Sales', 'Debit Note'].includes(v.type));
                    const purchaseGst = gstVouchers.filter(v => ['Purchase', 'Credit Note'].includes(v.type));
                    
                    const totalSalesTaxable = salesGst.reduce((sum, v) => sum + (v.amount || 0), 0);
                    const totalSalesCGST = salesGst.reduce((sum, v) => sum + (v.cgst || 0), 0);
                    const totalSalesSGST = salesGst.reduce((sum, v) => sum + (v.sgst || 0), 0);
                    const totalSalesIGST = salesGst.reduce((sum, v) => sum + (v.igst || 0), 0);
                    
                    const totalPurchaseTaxable = purchaseGst.reduce((sum, v) => sum + (v.amount || 0), 0);
                    const totalPurchaseCGST = purchaseGst.reduce((sum, v) => sum + (v.cgst || 0), 0);
                    const totalPurchaseSGST = purchaseGst.reduce((sum, v) => sum + (v.sgst || 0), 0);
                    const totalPurchaseIGST = purchaseGst.reduce((sum, v) => sum + (v.igst || 0), 0);

                    return (
                      <div className="space-y-6">
                        {/* Table 3.1: Details of Outward and Inward Reverse Charge Supplies */}
                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800">3.1 Details of Outward Supplies and Inward Supplies Liable to Reverse Charge</h4>
                          </div>
                          <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase">
                              <tr>
                                <th className="px-6 py-3 font-semibold">Nature of Supplies</th>
                                <th className="px-6 py-3 font-semibold text-right">Total Taxable Value</th>
                                <th className="px-6 py-3 font-semibold text-right">Integrated Tax (IGST)</th>
                                <th className="px-6 py-3 font-semibold text-right">Central Tax (CGST)</th>
                                <th className="px-6 py-3 font-semibold text-right">State/UT Tax (SGST)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              <tr>
                                <td className="px-6 py-3.5 font-bold text-gray-800">(a) Outward Taxable Supplies (other than zero rated, nil rated, deemed export)</td>
                                <td className="px-6 py-3.5 text-right font-medium">{formatCurrency(totalSalesTaxable)}</td>
                                <td className="px-6 py-3.5 text-right text-gray-700">{formatCurrency(totalSalesIGST)}</td>
                                <td className="px-6 py-3.5 text-right text-gray-700">{formatCurrency(totalSalesCGST)}</td>
                                <td className="px-6 py-3.5 text-right text-gray-700">{formatCurrency(totalSalesSGST)}</td>
                              </tr>
                              <tr className="bg-gray-50/30 text-gray-400">
                                <td className="px-6 py-3.5">(b) Outward Taxable Supplies (zero rated)</td>
                                <td className="px-6 py-3.5 text-right">{formatCurrency(0)}</td>
                                <td className="px-6 py-3.5 text-right">{formatCurrency(0)}</td>
                                <td className="px-6 py-3.5 text-right">-</td>
                                <td className="px-6 py-3.5 text-right">-</td>
                              </tr>
                              <tr className="bg-gray-50/30 text-gray-400">
                                <td className="px-6 py-3.5">(c) Other Outward Supplies (nil rated, exempted)</td>
                                <td className="px-6 py-3.5 text-right">{formatCurrency(0)}</td>
                                <td className="px-6 py-3.5 text-right">-</td>
                                <td className="px-6 py-3.5 text-right">-</td>
                                <td className="px-6 py-3.5 text-right">-</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Table 4: Eligible ITC */}
                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800">4. Details of Eligible Input Tax Credit (ITC)</h4>
                          </div>
                          <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50/50 text-gray-500 text-xs uppercase">
                              <tr>
                                <th className="px-6 py-3 font-semibold">Details</th>
                                <th className="px-6 py-3 font-semibold text-right">Taxable Value</th>
                                <th className="px-6 py-3 font-semibold text-right">Integrated Tax (IGST)</th>
                                <th className="px-6 py-3 font-semibold text-right">Central Tax (CGST)</th>
                                <th className="px-6 py-3 font-semibold text-right">State/UT Tax (SGST)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              <tr>
                                <td className="px-6 py-3.5 font-bold text-gray-800">(A) ITC Available (whether in full or part)</td>
                                <td className="px-6 py-3.5 text-right font-medium">{formatCurrency(totalPurchaseTaxable)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-600 font-medium">{formatCurrency(totalPurchaseIGST)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-600 font-medium">{formatCurrency(totalPurchaseCGST)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-600 font-medium">{formatCurrency(totalPurchaseSGST)}</td>
                              </tr>
                              <tr className="bg-gray-50 font-bold">
                                <td className="px-6 py-3.5 text-gray-800">(B) Net ITC Eligible (A)</td>
                                <td className="px-6 py-3.5 text-right">{formatCurrency(totalPurchaseTaxable)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-700">{formatCurrency(totalPurchaseIGST)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-700">{formatCurrency(totalPurchaseCGST)}</td>
                                <td className="px-6 py-3.5 text-right text-emerald-700">{formatCurrency(totalPurchaseSGST)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Net Liability & Tax Settlement */}
                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm p-6 space-y-4">
                          <h4 className="text-sm font-bold text-gray-800 border-b pb-2">6.1 Payment of Tax (Net Settlement Summary)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="border border-blue-100 bg-blue-50/40 p-4 rounded-lg">
                              <p className="text-xs font-bold text-gray-500 uppercase">Gross Tax Liability</p>
                              <h5 className="text-xl font-bold text-gray-950 mt-1">{formatCurrency(totalSalesIGST + totalSalesCGST + totalSalesSGST)}</h5>
                              <div className="text-[10px] text-gray-500 mt-2 space-y-1">
                                <div>CGST: {formatCurrency(totalSalesCGST)}</div>
                                <div>SGST: {formatCurrency(totalSalesSGST)}</div>
                                <div>IGST: {formatCurrency(totalSalesIGST)}</div>
                              </div>
                            </div>
                            <div className="border border-emerald-100 bg-emerald-50/40 p-4 rounded-lg">
                              <p className="text-xs font-bold text-gray-500 uppercase">Input Tax Credit (ITC) Available</p>
                              <h5 className="text-xl font-bold text-emerald-950 mt-1">{formatCurrency(totalPurchaseCGST + totalPurchaseSGST + totalPurchaseIGST)}</h5>
                              <div className="text-[10px] text-emerald-700 mt-2 space-y-1">
                                <div>CGST credit: {formatCurrency(totalPurchaseCGST)}</div>
                                <div>SGST credit: {formatCurrency(totalPurchaseSGST)}</div>
                                <div>IGST credit: {formatCurrency(totalPurchaseIGST)}</div>
                              </div>
                            </div>
                            <div className="border border-purple-100 bg-purple-50/40 p-4 rounded-lg">
                              <p className="text-xs font-bold text-purple-700 uppercase">Net Tax Payable (Cash)</p>
                              {(() => {
                                const netCgst = Math.max(0, totalSalesCGST - totalPurchaseCGST);
                                const netSgst = Math.max(0, totalSalesSGST - totalPurchaseSGST);
                                const netIgst = Math.max(0, totalSalesIGST - totalPurchaseIGST);
                                const sumNet = netCgst + netSgst + netIgst;

                                return (
                                  <>
                                    <h5 className="text-xl font-bold text-purple-950 mt-1">{formatCurrency(sumNet)}</h5>
                                    <div className="text-[10px] text-purple-700 mt-2 space-y-1">
                                      <div>Net CGST: {formatCurrency(netCgst)}</div>
                                      <div>Net SGST: {formatCurrency(netSgst)}</div>
                                      <div>Net IGST: {formatCurrency(netIgst)}</div>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {gstSubTab === 'OTHER_TAXES' && (
                <div className="space-y-6 animate-fade-in font-sans">
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg">
                    <h4 className="text-sm font-bold text-amber-900">VAT, TDS, Excise, & Service Tax Summary</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      Statutory overview for VAT (Value Added Tax), TDS deductions, Excise duty, and Service tax calculated across your transactions.
                    </p>
                  </div>

                  {(() => {
                    const filteredVouchers = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to);
                    
                    const vatSales = filteredVouchers.filter(v => v.taxType === 'VAT' && ['Sales', 'Receipt', 'Journal', 'Debit Note'].includes(v.type));
                    const vatPurchases = filteredVouchers.filter(v => v.taxType === 'VAT' && ['Purchase', 'Payment', 'Contra', 'Credit Note'].includes(v.type));
                    const totalVatSales = vatSales.reduce((sum, v) => sum + ((v as any).vatAmount || 0), 0);
                    const totalVatPurchase = vatPurchases.reduce((sum, v) => sum + ((v as any).vatAmount || 0), 0);

                    const tdsSales = filteredVouchers.filter(v => v.taxType === 'TDS' && ['Sales', 'Receipt'].includes(v.type));
                    const tdsPurchases = filteredVouchers.filter(v => v.taxType === 'TDS' && ['Purchase', 'Payment', 'Journal', 'Debit Note', 'Contra', 'Credit Note'].includes(v.type));
                    const tdsReceivable = tdsSales.reduce((sum, v) => sum + ((v as any).tdsAmount || 0), 0);
                    const tdsPayable = tdsPurchases.reduce((sum, v) => sum + ((v as any).tdsAmount || 0), 0);
                    
                    const exciseSales = filteredVouchers.filter(v => v.taxType === 'Excise' && ['Sales', 'Receipt', 'Journal', 'Debit Note'].includes(v.type));
                    const excisePurchases = filteredVouchers.filter(v => v.taxType === 'Excise' && ['Purchase', 'Payment', 'Contra', 'Credit Note'].includes(v.type));
                    const totalExciseSales = exciseSales.reduce((sum, v) => sum + ((v as any).exciseAmount || 0), 0);
                    const totalExcisePurchase = excisePurchases.reduce((sum, v) => sum + ((v as any).exciseAmount || 0), 0);
                    const netExcisePayable = totalExciseSales - totalExcisePurchase;

                    const serviceTaxSales = filteredVouchers.filter(v => v.taxType === 'Service Tax' && ['Sales', 'Receipt', 'Journal', 'Debit Note'].includes(v.type));
                    const serviceTaxPurchases = filteredVouchers.filter(v => v.taxType === 'Service Tax' && ['Purchase', 'Payment', 'Contra', 'Credit Note'].includes(v.type));
                    const totalServiceTaxSales = serviceTaxSales.reduce((sum, v) => sum + ((v as any).serviceTaxAmount || 0), 0);
                    const totalServiceTaxPurchase = serviceTaxPurchases.reduce((sum, v) => sum + ((v as any).serviceTaxAmount || 0), 0);
                    const netServiceTaxPayable = totalServiceTaxSales - totalServiceTaxPurchase;

                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-emerald-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-emerald-800 uppercase">State Tax</div>
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">VAT Liability</span>
                            <h4 className="text-xl font-bold text-emerald-950 mt-1">
                              {formatCurrency(Math.abs(totalVatSales - totalVatPurchase))}
                            </h4>
                            <div className="text-[11px] font-bold mt-1 mb-2">
                              {totalVatSales >= totalVatPurchase ? (
                                <span className="text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded">Net Payable To Govt</span>
                              ) : (
                                <span className="text-teal-700 bg-teal-100/50 px-1.5 py-0.5 rounded">Net Refundable / ITC</span>
                              )}
                            </div>
                            <div className="text-[10px] text-emerald-800 space-y-0.5 border-t border-emerald-200 pt-2">
                              <div className="flex justify-between"><span>Collected (Sales):</span> <strong>{formatCurrency(totalVatSales)}</strong></div>
                              <div className="flex justify-between"><span>Paid (Purchase):</span> <strong>{formatCurrency(totalVatPurchase)}</strong></div>
                            </div>
                          </div>
                          
                          <div className="bg-red-50 border border-red-100 p-4 rounded-xl shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-red-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-red-800 uppercase">Direct Tax</div>
                            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">TDS Liability</span>
                            <h4 className="text-xl font-bold text-red-950 mt-1">
                              {formatCurrency(Math.abs(tdsPayable))}
                            </h4>
                            <div className="text-[11px] font-bold mt-1 mb-2">
                              {tdsPayable > 0 ? (
                                <span className="text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded">Net Payable To Govt</span>
                              ) : (
                                <span className="text-gray-500 bg-gray-100/50 px-1.5 py-0.5 rounded">No Payable Dues</span>
                              )}
                            </div>
                            <div className="text-[10px] text-red-800 space-y-0.5 border-t border-red-200 pt-2">
                              <div className="flex justify-between" title="TDS Deducted by you"><span>Deducted (Payable):</span> <strong>{formatCurrency(tdsPayable)}</strong></div>
                              <div className="flex justify-between" title="TDS Deducted by others"><span>Receivable (Asset):</span> <strong>{formatCurrency(tdsReceivable)}</strong></div>
                            </div>
                          </div>

                          <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-teal-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-teal-800 uppercase">Central Tax</div>
                            <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider block">Excise Liability</span>
                            <h4 className="text-xl font-bold text-teal-900 mt-1">
                              {formatCurrency(Math.abs(netExcisePayable))}
                            </h4>
                            <div className="text-[11px] font-bold mt-1 mb-2">
                              {netExcisePayable >= 0 ? (
                                <span className="text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded">Net Payable To Govt</span>
                              ) : (
                                <span className="text-teal-700 bg-teal-100/50 px-1.5 py-0.5 rounded">Net Refundable / CENVAT</span>
                              )}
                            </div>
                            <div className="text-[10px] text-teal-800 space-y-0.5 border-t border-teal-200 pt-2">
                              <div className="flex justify-between"><span>Outward Duty:</span> <strong>{formatCurrency(totalExciseSales)}</strong></div>
                              <div className="flex justify-between"><span>Inward Duty:</span> <strong>{formatCurrency(totalExcisePurchase)}</strong></div>
                            </div>
                          </div>

                          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-indigo-200/50 px-2 py-1 rounded-bl-lg text-[9px] font-bold text-indigo-800 uppercase">Indirect Tax</div>
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Service Tax Liability</span>
                            <h4 className="text-xl font-bold text-indigo-950 mt-1">
                              {formatCurrency(Math.abs(netServiceTaxPayable))}
                            </h4>
                            <div className="text-[11px] font-bold mt-1 mb-2">
                              {netServiceTaxPayable >= 0 ? (
                                <span className="text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded">Net Payable To Govt</span>
                              ) : (
                                <span className="text-teal-700 bg-teal-100/50 px-1.5 py-0.5 rounded">Net Refundable</span>
                              )}
                            </div>
                            <div className="text-[10px] text-indigo-800 space-y-0.5 border-t border-indigo-200 pt-2">
                              <div className="flex justify-between"><span>Billed on Sales:</span> <strong>{formatCurrency(totalServiceTaxSales)}</strong></div>
                              <div className="flex justify-between"><span>Paid on Purchase:</span> <strong>{formatCurrency(totalServiceTaxPurchase)}</strong></div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm pt-2">
                          <div className="px-6 py-3 border-b border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800">Tax Wise Transaction Listing (Non-GST)</h4>
                          </div>
                          <table className="w-full text-left text-xs text-gray-700">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wider">
                              <tr>
                                <th className="px-6 py-4 font-semibold">Voucher</th>
                                <th className="px-6 py-4 font-semibold">Date</th>
                                <th className="px-6 py-4 font-semibold">Party Name</th>
                                <th className="px-6 py-4 font-semibold">Tax Type</th>
                                <th className="px-6 py-4 font-semibold text-right">Tax Rate</th>
                                <th className="px-6 py-4 font-semibold text-right">Taxable Amt</th>
                                <th className="px-6 py-4 font-semibold text-right">Tax Amt</th>
                                <th className="px-6 py-4 font-semibold text-right">Total Invoice</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-mono">
                              {(() => {
                                const list = filteredVouchers.filter(v => v.withTax && v.taxType && v.taxType !== 'GST');
                                if (list.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={8} className="px-6 py-8 text-center text-gray-400 font-medium font-sans">
                                        No non-GST statutory transactions recorded in this date range.
                                      </td>
                                    </tr>
                                  );
                                }
                                return list.map(v => {
                                  const party = ledgers.find(l => l.id === v.ledgerId);
                                  let taxAmt = 0;
                                  if (v.taxType === 'VAT' || v.taxType === 'Sales Tax' || v.taxType === 'Tax') taxAmt = (v as any).vatAmount || 0;
                                  else if (v.taxType === 'TDS') taxAmt = (v as any).tdsAmount || 0;
                                  else if (v.taxType === 'Excise') taxAmt = (v as any).exciseAmount || 0;
                                  else if (v.taxType === 'Service Tax') taxAmt = (v as any).serviceTaxAmount || 0;

                                  const prefix = v.taxType === 'TDS' ? '-' : '';

                                  return (
                                    <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                                      <td className="px-6 py-3 font-semibold text-gray-900 font-sans">{v.type} #{v.voucherNumber}</td>
                                      <td className="px-6 py-3">{v.date}</td>
                                      <td className="px-6 py-3 font-medium text-gray-800 font-sans">{party?.name || 'Unknown'}</td>
                                      <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                                          v.taxType === 'VAT' || v.taxType === 'Sales Tax' || v.taxType === 'Tax' ? 'bg-emerald-100 text-emerald-800' :
                                          v.taxType === 'TDS' ? 'bg-red-100 text-red-800' :
                                          v.taxType === 'Excise' ? 'bg-teal-100 text-teal-800' :
                                          'bg-purple-100 text-purple-800'
                                        }`}>
                                          {v.taxType}
                                        </span>
                                      </td>
                                      <td className="px-6 py-3 text-right font-semibold text-gray-600">{v.gstRate || 0}%</td>
                                      <td className="px-6 py-3 text-right text-gray-900 font-medium">{formatCurrency(v.amount || 0)}</td>
                                      <td className={`px-6 py-3 text-right font-bold ${v.taxType === 'TDS' ? 'text-red-700 font-sans' : 'text-gray-900'}`}>{prefix}{formatCurrency(taxAmt)}</td>
                                      <td className="px-6 py-3 text-right font-extrabold text-blue-950">{formatCurrency(v.totalAmount || 0)}</td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ) : reportType === 'TRIAL_BALANCE' ? (
            <div className="space-y-6">
              <div className="bg-[#fcfcf0] border border-[#003c46]/40 rounded-sm overflow-hidden font-mono text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                    <tr>
                      <th className="px-4 py-2 border-r border-[#003c46]/50 last:border-r-0">{t('ledger_name')}</th>
                      <th className="px-4 py-2 border-r border-[#003c46]/50 last:border-r-0">{t('group')}</th>
                      <th className="px-4 py-2 border-r border-[#003c46]/50 last:border-r-0 text-right">{t('debit')}</th>
                      <th className="px-4 py-2 text-right text-right">{t('credit')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(() => {
                      let totalDebit = 0;
                      let totalCredit = 0;
                      const sortedLedgers = [...reportLedgers].sort((a, b) => 
                        (a.group || '').localeCompare(b.group || '') || (a.name || '').localeCompare(b.name || '')
                      );

                      const rows = sortedLedgers.map((l, index) => {
                        const balance = getLedgerBalanceAsOf(l.id!, dateRange.to);
                        if (Math.abs(balance) < 0.005) return null;
                        if (balance > 0) totalDebit += balance;
                        else totalCredit += Math.abs(balance);
                        return (
                          <tr key={l.id} className={`hover:bg-[#ffffcc] transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-teal-900 border-l-4 border-teal-600 pl-2 font-semibold' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedLedgerId(l.id!); setReportType('LEDGER'); }}>
                            <td className="px-4 py-2 font-bold text-[#002f3c]">{l.name}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{l.group}</td>
                            <td className="px-4 py-2 text-rose-700 text-right font-medium">
                              {balance > 0 ? formatCurrency(balance) : '-'}
                            </td>
                            <td className="px-4 py-2 text-emerald-700 text-right font-medium">
                              {balance < 0 ? formatCurrency(Math.abs(balance)) : '-'}
                            </td>
                          </tr>
                        );
                      });

                      const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
                      const grandTotalBal = Math.max(totalDebit, totalCredit);

                      return (
                        <>
                          {rows}
                          {Math.abs(diff) > 0.01 && (
                            <tr className="bg-amber-50 text-amber-900 font-bold border-t border-b border-amber-200">
                              <td className="px-4 py-2 font-bold">{t('diff_opening_balances')}</td>
                              <td className="px-4 py-2 text-xs text-amber-700 italic">Opening Balance Difference</td>
                              <td className="px-4 py-2 text-rose-700 text-right">
                                {diff < 0 ? formatCurrency(Math.abs(diff)) : '-'}
                              </td>
                              <td className="px-4 py-2 text-emerald-700 text-right">
                                {diff > 0 ? formatCurrency(Math.abs(diff)) : '-'}
                              </td>
                            </tr>
                          )}
                          <tr className="bg-[#eef3ee] font-bold border-t border-b-4 border-double border-[#003c46]">
                            <td colSpan={2} className="px-4 py-2 text-[#002f3c]">{t('grand_total')}</td>
                            <td className="px-4 py-2 text-rose-700 text-right">{formatCurrency(grandTotalBal)}</td>
                            <td className="px-4 py-2 text-emerald-700 text-right">{formatCurrency(grandTotalBal)}</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : reportType === 'CASH_FLOW' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-emerald-600 border-b pb-2 flex items-center gap-2">
                    <TrendingUp size={20} />
                    Cash Inflow (Receipts)
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const inflows = vouchers.filter(v => 
                        v.date >= dateRange.from && v.date <= dateRange.to && 
                        (v.type === 'Receipt' || v.type === 'Sales')
                      );
                      const totalInflow = inflows.reduce((sum, v) => sum + v.totalAmount, 0);
                      return (
                        <>
                          {inflows.map(v => (
                            <div key={v.id} className="flex justify-between text-sm py-2 border-b border-gray-50 cursor-pointer hover:bg-gray-100/50 px-2 rounded transition-colors" onClick={() => setSelectedSummaryVoucher(v)}>
                              <div>
                                <span className="text-gray-900 font-bold">{v.type} #{v.voucherNumber}</span>
                                <span className="block text-xs text-gray-500">{v.date} - {ledgers.find(l => l.id === v.ledgerId)?.name}</span>
                              </div>
                              <span className="font-bold text-emerald-600">{formatCurrency(v.totalAmount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-4 font-bold text-gray-900">
                            <span>Total Inflow</span>
                            <span>{formatCurrency(totalInflow)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-rose-600 border-b pb-2 flex items-center gap-2">
                    <TrendingDown size={20} />
                    Cash Outflow (Payments)
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const outflows = vouchers.filter(v => 
                        v.date >= dateRange.from && v.date <= dateRange.to && 
                        (v.type === 'Payment' || v.type === 'Purchase')
                      );
                      const totalOutflow = outflows.reduce((sum, v) => sum + v.totalAmount, 0);
                      return (
                        <>
                          {outflows.map(v => (
                            <div key={v.id} className="flex justify-between text-sm py-2 border-b border-gray-50 cursor-pointer hover:bg-gray-100/50 px-2 rounded transition-colors" onClick={() => setSelectedSummaryVoucher(v)}>
                              <div>
                                <span className="text-gray-900 font-bold">{v.type} #{v.voucherNumber}</span>
                                <span className="block text-xs text-gray-500">{v.date} - {ledgers.find(l => l.id === v.ledgerId)?.name}</span>
                              </div>
                              <span className="font-bold text-rose-600">{formatCurrency(v.totalAmount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-4 font-bold text-gray-900">
                            <span>Total Outflow</span>
                            <span>{formatCurrency(totalOutflow)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-blue-50 rounded-xl flex justify-between items-center">
                {(() => {
                  const inflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Receipt' || v.type === 'Sales')).reduce((sum, v) => sum + v.totalAmount, 0);
                  const outflows = vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to && (v.type === 'Payment' || v.type === 'Purchase')).reduce((sum, v) => sum + v.totalAmount, 0);
                  const netFlow = inflows - outflows;
                  return (
                    <>
                      <div>
                        <p className="text-sm text-blue-600 font-medium uppercase tracking-wider">Net Cash Flow</p>
                        <h2 className="text-3xl font-bold text-blue-900">
                          {formatCurrency(netFlow)}
                        </h2>
                      </div>
                      <div className={`p-4 rounded-full ${netFlow >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {netFlow >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : reportType === 'OUTSTANDING' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    {outstandingType === 'RECEIVABLES' ? t('bills_receivable') : t('bills_payable')}
                  </h3>
                  <button
                    onClick={() => setShowOutstandingAging(!showOutstandingAging)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border ${
                      showOutstandingAging
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {showOutstandingAging ? 'Standard View' : 'Show Aging Analysis'}
                  </button>
                </div>
                <div className="text-sm text-gray-500">
                  {t('total_outstanding')}: <span className="font-bold text-gray-900">
                    {(() => {
                      const group = outstandingType === 'RECEIVABLES' ? 'Sundry Debtors' : 'Sundry Creditors';
                      const total = ledgers
                        .filter(l => l.group === group)
                        .reduce((sum, l) => sum + Math.abs(getLedgerBalanceAsOf(l.id!, dateRange.to)), 0);
                      return formatCurrency(total);
                    })()}
                  </span>
                </div>
              </div>

              {/* Advanced CFO Aging Distribution Chart */}
              {showOutstandingAging && (
                <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {(() => {
                    const group = outstandingType === 'RECEIVABLES' ? 'Sundry Debtors' : 'Sundry Creditors';
                    let currentTotal = 0;
                    let intermediateTotal = 0;
                    let oldTotal = 0;
                    let oldestTotal = 0;

                    ledgers
                      .filter(l => l.group === group)
                      .forEach(l => {
                        const bal = getLedgerBalanceAsOf(l.id!, dateRange.to);
                        if (bal !== 0) {
                          const aging = getLedgerOutstandingAging(l.id!, bal, outstandingType);
                          currentTotal += aging.current;
                          intermediateTotal += aging.intermediate;
                          oldTotal += aging.old;
                          oldestTotal += aging.oldest;
                        }
                      });

                    const grand = currentTotal + intermediateTotal + oldTotal + oldestTotal || 1;

                    return (
                      <>
                        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">0 - 15 Days</p>
                          <h4 className="text-lg font-bold text-blue-900 mt-1">{formatCurrency(currentTotal)}</h4>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(currentTotal / grand) * 100}%` }}></div>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">16 - 30 Days</p>
                          <h4 className="text-lg font-bold text-emerald-900 mt-1">{formatCurrency(intermediateTotal)}</h4>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${(intermediateTotal / grand) * 100}%` }}></div>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">31 - 60 Days</p>
                          <h4 className="text-lg font-bold text-amber-900 mt-1">{formatCurrency(oldTotal)}</h4>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${(oldTotal / grand) * 100}%` }}></div>
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">61+ Days (Overdue)</p>
                          <h4 className="text-lg font-bold text-rose-900 mt-1">{formatCurrency(oldestTotal)}</h4>
                          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                            <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${(oldestTotal / grand) * 100}%` }}></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="bg-[#fcfcf0] border border-[#003c46]/45 rounded-sm overflow-hidden font-mono text-xs shadow-sm pb-8">
                <table className="w-full text-left">
                  <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                    {!showOutstandingAging ? (
                      <tr>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">{t('ledger_name')}</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">{t('group')}</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">{t('opening')}</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">{t('pending_amount')}</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-center">{t('status')}</th>
                        <th className="px-4 py-2.5 text-right">{t('actions')}</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">{t('ledger_name')}</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">0 - 15 Days</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">16 - 30 Days</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">31 - 60 Days</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">61+ Days</th>
                        <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">Total Pending</th>
                        <th className="px-4 py-2.5 text-right">{t('actions')}</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {ledgers
                      .filter(l => l.group === (outstandingType === 'RECEIVABLES' ? 'Sundry Debtors' : 'Sundry Creditors'))
                      .map((l, index) => {
                        const balance = getLedgerBalanceAsOf(l.id!, dateRange.to);
                        if (balance === 0) return null;
                        const absBalance = Math.abs(balance);
                        
                        const handleWhatsApp = (ledger: Ledger, amount: number) => {
                          if (!ledger.phone) {
                            toast.error(t('phone_not_found'));
                            return;
                          }
                          const cleanPhone = ledger.phone.replace(/\D/g, '');
                          const message = `Dear ${ledger.name}, this is a reminder regarding your outstanding balance of ${formatCurrency(amount)}. Please ignore if already paid.`;
                          const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                          window.open(url, '_blank');
                        };

                        if (!showOutstandingAging) {
                          return (
                            <tr key={l.id} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedLedgerId(l.id!); setReportType('LEDGER'); }}>
                              <td className="px-4 py-2 font-bold text-[#002f3c]">{l.name}</td>
                              <td className="px-4 py-2 text-xs text-gray-400">{l.group}</td>
                              <td className="px-4 py-2 text-gray-600 text-right">{formatCurrency(l.openingBalance || 0)}</td>
                              <td className="px-4 py-2 font-bold text-gray-900 text-right">{formatCurrency(absBalance)}</td>
                              <td className="px-4 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase ${balance > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  {balance > 0 ? t('debit_short') : t('credit_short')}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right">
                                {l.phone && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleWhatsApp(l, absBalance); }}
                                    className="p-1 px-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-sm transition-colors flex items-center gap-1 ml-auto inline-flex"
                                    title={t('send_whatsapp_reminder')}
                                  >
                                    <MessageCircle size={12} />
                                    <span className="text-[10px] font-bold">{t('remind')}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        } else {
                          const aging = getLedgerOutstandingAging(l.id!, balance, outstandingType);
                          return (
                            <tr key={l.id} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedLedgerId(l.id!); setReportType('LEDGER'); }}>
                              <td className="px-4 py-2 font-bold text-[#002f3c]">{l.name}</td>
                              <td className="px-4 py-2 text-blue-700 text-right font-medium">{aging.current > 0 ? formatCurrency(aging.current) : '-'}</td>
                              <td className="px-4 py-2 text-emerald-700 text-right font-medium">{aging.intermediate > 0 ? formatCurrency(aging.intermediate) : '-'}</td>
                              <td className="px-4 py-2 text-amber-700 text-right font-medium">{aging.old > 0 ? formatCurrency(aging.old) : '-'}</td>
                              <td className="px-4 py-2 text-rose-700 text-right font-bold">{aging.oldest > 0 ? formatCurrency(aging.oldest) : '-'}</td>
                              <td className="px-4 py-2 font-bold text-[#002f3c] text-right bg-teal-50/20">{formatCurrency(absBalance)}</td>
                              <td className="px-4 py-2 text-right">
                                {l.phone && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleWhatsApp(l, absBalance); }}
                                    className="p-1 px-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-sm transition-colors flex items-center gap-1 ml-auto inline-flex"
                                    title={t('send_whatsapp_reminder')}
                                  >
                                    <MessageCircle size={12} />
                                    <span className="text-[10px] font-bold">{t('remind')}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        }
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : reportType === 'BRS' ? (
            <div className="space-y-6">
              {/* Bank Account Selection & Headers */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-900">Bank Reconciliation Statement (BRS)</h3>
                  <p className="text-xs text-gray-500">Reconcile book balances against your bank statements for the reporting period.</p>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Select Bank Ledger:</label>
                  <select
                    value={selectedBankLedgerId}
                    onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">-- Choose Bank Account --</option>
                    {ledgers
                      .filter(l => ['Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))
                      .map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {(() => {
                const activeBankId = selectedBankLedgerId || ledgers.find(l => ['Bank Accounts', 'Bank OCC A/c', 'Bank OD A/c'].includes(l.group))?.id;
                if (!activeBankId) {
                  return (
                    <div className="bg-amber-50 border border-amber-100 text-amber-800 p-6 rounded-lg text-center font-medium">
                      Please create a Bank Account ledger (under 'Bank Accounts' group) in order to use the Bank Reconciliation Statement.
                    </div>
                  );
                }

                // Gather and parse all transactions that impact this bank account
                const getBankImpact = (v: Voucher) => {
                  if (['Sales Order', 'Purchase Order', 'Delivery Note', 'Receipt Note'].includes(v.type)) return { isBank: false, amount: 0, type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAWAL' };
                  let isBank = false;
                  let amount = 0;
                  let type: 'DEPOSIT' | 'WITHDRAWAL' = 'DEPOSIT';

                  if (v.mode === 'Double Entry') {
                    v.items?.forEach(item => {
                      if (item.ledgerId === activeBankId) {
                        isBank = true;
                        amount += item.amount;
                        type = (item.type === 'Dr' ? 'DEPOSIT' : 'WITHDRAWAL');
                      }
                    });
                  } else if (v.mode === 'Normal') {
                    if (v.ledgerId === activeBankId) {
                      isBank = true;
                      amount = v.totalAmount;
                      type = (v.type === 'Receipt' || v.type === 'Contra' ? 'DEPOSIT' : 'WITHDRAWAL');
                    }
                    v.items?.forEach(item => {
                      if (item.ledgerId === activeBankId) {
                        isBank = true;
                        amount = item.amount;
                        type = (v.type === 'Receipt' ? 'DEPOSIT' : 'WITHDRAWAL');
                      }
                    });
                    if (!v.items || v.items.length === 0) {
                      if (v.debitLedgerId === activeBankId) {
                        isBank = true;
                        amount = v.totalAmount;
                        type = 'DEPOSIT';
                      }
                      if (v.creditLedgerId === activeBankId) {
                        isBank = true;
                        amount = v.totalAmount;
                        type = 'WITHDRAWAL';
                      }
                    }
                  } else if (v.mode === 'Invoice') {
                    if (v.ledgerId === activeBankId) {
                      isBank = true;
                      amount = v.totalAmount;
                      type = (['Sales', 'Debit Note', 'Payment'].includes(v.type) ? 'DEPOSIT' : 'WITHDRAWAL');
                    }
                    if (v.salesPurchaseLedgerId === activeBankId) {
                      isBank = true;
                      amount = v.totalAmount;
                      type = (['Sales', 'Debit Note', 'Payment'].includes(v.type) ? 'WITHDRAWAL' : 'DEPOSIT');
                    }
                  }

                  return { isBank, amount, type };
                };

                const bankTrans = vouchers
                  .map(v => ({ voucher: v, impact: getBankImpact(v) }))
                  .filter(item => item.impact && item.impact.isBank && item.voucher.date <= dateRange.to) as { voucher: Voucher; impact: { isBank: boolean; amount: number; type: 'DEPOSIT' | 'WITHDRAWAL' } }[];

                const bookBalance = getLedgerBalanceAsOf(activeBankId, dateRange.to);

                // Compute uncleared totals based on stored clearing dates
                const unclearedDeposits = bankTrans
                  .filter(item => item.impact.type === 'DEPOSIT' && (!brsClearedDates[item.voucher.id] || brsClearedDates[item.voucher.id] > dateRange.to))
                  .reduce((sum, item) => sum + item.impact.amount, 0);

                const unclearedWithdrawals = bankTrans
                  .filter(item => item.impact.type === 'WITHDRAWAL' && (!brsClearedDates[item.voucher.id] || brsClearedDates[item.voucher.id] > dateRange.to))
                  .reduce((sum, item) => sum + item.impact.amount, 0);

                // Bank Statement Balance formula: Book Balance - Uncleared Deposits + Uncleared Withdrawals
                const bankStatementBalance = bookBalance - unclearedDeposits + unclearedWithdrawals;

                const filteredTrans = bankTrans.filter(item => {
                  const clearingDate = brsClearedDates[item.voucher.id];
                  const isCleared = clearingDate && clearingDate <= dateRange.to;
                  if (brsFilter === 'CLEARED') return isCleared;
                  if (brsFilter === 'UNCLEARED') return !isCleared;
                  return true;
                });

                return (
                  <div className="space-y-6">
                    {/* BRS Calculations Summary Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Balance as per Books</p>
                        <h4 className="text-xl font-bold text-gray-900">{formatCurrency(bookBalance)}</h4>
                        <span className="text-[10px] bg-slate-100 text-slate-800 font-semibold px-2 py-0.5 rounded uppercase mt-2 inline-block">
                          {bookBalance >= 0 ? 'Dr (Company Books)' : 'Cr (Overdraft)'}
                        </span>
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-rose-700">
                        <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1">(-) Uncleared Deposits</p>
                        <h4 className="text-xl font-bold">{formatCurrency(unclearedDeposits)}</h4>
                        <p className="text-[10px] text-gray-400 mt-2">Deposits not yet cleared in bank</p>
                      </div>
                      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-emerald-700">
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">(+) Uncleared Withdrawals</p>
                        <h4 className="text-xl font-bold">{formatCurrency(unclearedWithdrawals)}</h4>
                        <p className="text-[10px] text-gray-400 mt-2">Checks issued but not cleared</p>
                      </div>
                      <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100 shadow-sm">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Balance as per Bank</p>
                        <h4 className="text-xl font-bold text-indigo-950">{formatCurrency(bankStatementBalance)}</h4>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded uppercase mt-2 inline-block">
                          Reconciled Bank Balance
                        </span>
                      </div>
                    </div>

                    {/* Filter and Table Panel */}
                    <div className="bg-[#fcfcf0] border border-[#003c46]/45 rounded-sm overflow-hidden shadow-sm">
                      <div className="bg-[#eef3ee] px-4 py-2.5 border-b border-[#003c46]/40 flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex space-x-1">
                          <button
                            onClick={() => setBrsFilter('ALL')}
                            className={`px-3 py-1 text-xs font-bold font-mono uppercase transition-all ${
                              brsFilter === 'ALL'
                                ? 'bg-[#004d5a] text-[#ffcb2b] rounded-sm'
                                : 'text-teal-900 hover:bg-teal-50 rounded-sm'
                            }`}
                          >
                            All Transactions
                          </button>
                          <button
                            onClick={() => setBrsFilter('UNCLEARED')}
                            className={`px-3 py-1 text-xs font-bold font-mono uppercase transition-all ${
                              brsFilter === 'UNCLEARED'
                                ? 'bg-[#004d5a] text-[#ffcb2b] rounded-sm'
                                : 'text-teal-900 hover:bg-teal-50 rounded-sm'
                            }`}
                          >
                            Uncleared Only ({bankTrans.filter(i => !brsClearedDates[i.voucher.id] || brsClearedDates[i.voucher.id] > dateRange.to).length})
                          </button>
                          <button
                            onClick={() => setBrsFilter('CLEARED')}
                            className={`px-3 py-1 text-xs font-bold font-mono uppercase transition-all ${
                              brsFilter === 'CLEARED'
                                ? 'bg-[#004d5a] text-[#ffcb2b] rounded-sm'
                                : 'text-teal-900 hover:bg-teal-50 rounded-sm'
                            }`}
                          >
                            Cleared Only
                          </button>
                        </div>
                        <span className="text-xs text-teal-800 font-bold font-mono">Showing {filteredTrans.length} transactions</span>
                      </div>

                      <table className="w-full text-left font-mono text-xs">
                        <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                          <tr>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">Voucher Date</th>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">Type / No.</th>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0">Particulars (Opposite party)</th>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">Debit (Deposit)</th>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-right">Credit (Withdrawal)</th>
                            <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-0 text-center">Bank Clearing Date</th>
                            <th className="px-4 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredTrans.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 font-bold font-mono">No matching bank transactions found for reconciliation.</td></tr>
                          ) : (
                            filteredTrans.map(item => {
                              const v = item.voucher;
                              const imp = item.impact;
                              const oppositeParty = ledgers.find(l => l.id === (v.ledgerId === activeBankId ? v.debitLedgerId || v.creditLedgerId : v.ledgerId))?.name || 'Multiple Ledgers';
                              const clearingVal = brsClearedDates[v.id] || '';

                              return (
                                <tr key={v.id} className="hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-150">
                                  <td className="px-4 py-2.5 font-bold text-gray-900">{v.date}</td>
                                  <td className="px-4 py-2.5 text-xs">
                                    <span className="font-bold text-[#002f3c]">{v.type}</span>
                                    <span className="text-gray-400 block">No. {v.voucherNumber}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-teal-900 font-bold">{oppositeParty}</td>
                                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">
                                    {imp.type === 'DEPOSIT' ? formatCurrency(imp.amount) : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-bold text-rose-700">
                                    {imp.type === 'WITHDRAWAL' ? formatCurrency(imp.amount) : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <input
                                      type="date"
                                      value={clearingVal}
                                      onChange={(e) => handleUpdateBrsClearedDate(v.id, e.target.value)}
                                      className="px-2 py-0.5 border border-[#003c46]/45 bg-white rounded-sm text-xs outline-none font-medium focus:ring-1 focus:ring-teal-700"
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    {!clearingVal ? (
                                      <button
                                        onClick={() => handleUpdateBrsClearedDate(v.id, v.date)}
                                        className="text-[10px] bg-teal-50 border border-teal-300 text-teal-850 hover:bg-[#004d5a] hover:text-[#ffcb2b] px-2 py-0.5 rounded-sm transition-colors font-bold uppercase"
                                      >
                                        Clear Today
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleUpdateBrsClearedDate(v.id, '')}
                                        className="text-[10px] text-rose-600 hover:bg-rose-50 border border-rose-300 px-2 py-0.5 rounded-sm transition-colors font-bold uppercase"
                                      >
                                        Unclear
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-[#fcfcf0] border border-[#003c46]/45 rounded-sm overflow-hidden font-mono text-xs shadow-sm pb-8">
              <table className="w-full text-left">
            {reportType === 'STOCK' ? (
              <>
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                  <tr>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('product_name')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('opening')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('inwards')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('outwards')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('closing')}</th>
                    <th className="px-4 py-2.5 text-right">{t('value')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map((p, index) => {
                    const { inwards, outwards } = getStockStats(p.id!);
                    return (
                      <tr key={p.id} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedSummaryProduct(p); }}>
                        <td className="px-4 py-2">
                          <div className="flex items-center space-x-2">
                            <Package size={14} className="text-teal-700" />
                            <div>
                              <span className="text-xs font-bold text-[#002f3c] block">{p.name}</span>
                              <span className="text-[10px] text-gray-500">{p.hsnCode || '-'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {p.openingStock || 0} {p.unit}
                        </td>
                        <td className="px-4 py-2 text-emerald-700 font-medium">
                          +{inwards} {p.unit}
                        </td>
                        <td className="px-4 py-2 text-rose-700 font-medium">
                          -{outwards} {p.unit}
                        </td>
                        <td className="px-4 py-2 text-gray-900 font-bold">
                          {p.stockQuantity} {p.unit}
                        </td>
                        <td className="px-4 py-2 font-bold text-gray-900 text-right">
                          {formatCurrency(p.stockQuantity * p.purchasePrice)}
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                        {t('no_products_found')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {products.length > 0 && (
                  <tfoot className="bg-[#eef3ee] font-bold border-t border-b-4 border-double border-[#003c46]">
                    <tr>
                      <td colSpan={2} className="px-4 py-2.5 text-[#002f3c]">{t('total_value')}</td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5"></td>
                      <td className="px-4 py-2.5 text-right text-teal-800">
                        {formatCurrency(products.reduce((sum, p) => sum + (p.stockQuantity * p.purchasePrice), 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </>
            ) : reportType === 'GODOWN_SUMMARY' ? (
              <>
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                  <tr>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Godown</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Item Name</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Available Stock</th>
                    <th className="px-4 py-2.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[{ id: 'Main Location', name: 'Main Location' }, ...godowns].filter(g => selectedGodownId === 'all' || g.id === selectedGodownId).map((g, gIndex) => {
                    const godownProducts = products.filter(p => {
                      const stock = calculateGodownStock(p.id!, g.id, vouchers);
                      return stock > 0 || (p.openingStock && p.openingStock > 0 && g.id === 'Main Location');
                    });
                    
                    if (godownProducts.length === 0) return null;
                    
                    return (
                      <React.Fragment key={g.id}>
                        <tr className="bg-[#eef3ee] border-b border-gray-200">
                          <td colSpan={4} className="px-4 py-2 font-bold text-[#002f3c] uppercase">
                            {g.name}
                          </td>
                        </tr>
                        {godownProducts.map((p, index) => {
                          const stock = calculateGodownStock(p.id!, g.id, vouchers) + (g.id === 'Main Location' ? (p.openingStock || 0) : 0);
                          return (
                            <tr key={`${g.id}-${p.id}`} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => setSelectedIndex(index)}>
                              <td className="px-4 py-2"></td>
                              <td className="px-4 py-2">
                                <div className="flex items-center space-x-2">
                                  <Package size={14} className="text-teal-700" />
                                  <div>
                                    <span className="text-xs font-bold text-[#002f3c] block">{p.name}</span>
                                    <span className="text-[10px] text-gray-500">{p.hsnCode || '-'}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-gray-900 font-bold text-right">
                                {stock} {p.unit}
                              </td>
                              <td className="px-4 py-2 font-bold text-gray-900 text-right">
                                {formatCurrency(stock * p.purchasePrice)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </>
            ) : reportType === 'COST_CENTER' ? (
              <>
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                  <tr>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Cost Centre</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Total Debit</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Total Credit</th>
                    <th className="px-4 py-2.5 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const filteredCostCenters = costCenters.filter(cc => {
                      if (selectedCostCenterId !== 'all') return cc.id === selectedCostCenterId;
                      if (selectedCostCategoryId !== 'all') {
                        if (selectedCostCategoryId === 'primary') return !cc.categoryId;
                        return cc.categoryId === selectedCostCategoryId;
                      }
                      return true;
                    });
                    if (filteredCostCenters.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                            No Cost Centres found.
                          </td>
                        </tr>
                      );
                    }

                    // First calculate balances for each cost center
                    const costCenterBalances: Record<string, { dr: number, cr: number }> = {};
                    filteredCostCenters.forEach(cc => {
                      costCenterBalances[cc.id] = { dr: 0, cr: 0 };
                    });

                    vouchers.filter(v => v.date >= dateRange.from && v.date <= dateRange.to).forEach(v => {
                      v.items?.forEach(item => {
                        item.costCenterAllocations?.forEach(alloc => {
                          if (costCenterBalances[alloc.costCenterId]) {
                            // If voucher is normal mode or double entry
                            let isDr = item.type === 'Dr';
                            if (v.mode === 'Invoice') {
                              // If sales, item ledger is income (Cr), so allocations are Cr
                              if (['Sales', 'Credit Note', 'Receipt'].includes(v.type)) {
                                isDr = false;
                              } else {
                                isDr = true;
                              }
                            }
                            if (isDr) {
                              costCenterBalances[alloc.costCenterId].dr += alloc.amount;
                            } else {
                              costCenterBalances[alloc.costCenterId].cr += alloc.amount;
                            }
                          }
                        });
                      });
                    });

                    return (
                      <>
                      {/* Group by category */}
                      {costCategories.map(cat => {
                        const catCenters = filteredCostCenters.filter(cc => cc.categoryId === cat.id);
                        if (catCenters.length === 0) return null;

                        const catDr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
                        const catCr = catCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
                        const catBal = catDr - catCr;

                        return (
                          <React.Fragment key={cat.id}>
                            <tr className="bg-[#eef3ee] border-b border-gray-200">
                              <td className="px-4 py-2 font-bold text-[#002f3c] uppercase">
                                {cat.name}
                              </td>
                              <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                {formatCurrency(catDr)}
                              </td>
                              <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                {formatCurrency(catCr)}
                              </td>
                              <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                <span className={catBal > 0 ? "text-red-700" : catBal < 0 ? "text-green-700" : "text-gray-900"}>
                                  {formatBalance(catBal)}
                                </span>
                              </td>
                            </tr>
                            {catCenters.map(cc => {
                              const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
                              return (
                                <tr key={cc.id} className="hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer">
                                  <td className="px-4 py-2 pl-8">
                                    <span className="text-xs font-bold text-[#002f3c]">{cc.name}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {formatCurrency(costCenterBalances[cc.id]?.dr || 0)}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    {formatCurrency(costCenterBalances[cc.id]?.cr || 0)}
                                  </td>
                                  <td className="px-4 py-2 font-bold text-right">
                                    <span className={bal > 0 ? "text-red-700" : bal < 0 ? "text-green-700" : "text-gray-900"}>
                                      {formatBalance(bal)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}

                      {/* Primary Cost Category (no category) */}
                      {filteredCostCenters.filter(cc => !cc.categoryId).length > 0 && (() => {
                        const noCatCenters = filteredCostCenters.filter(cc => !cc.categoryId);
                        const catDr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.dr || 0), 0);
                        const catCr = noCatCenters.reduce((sum, cc) => sum + (costCenterBalances[cc.id]?.cr || 0), 0);
                        const catBal = catDr - catCr;

                        return (
                        <React.Fragment>
                          <tr className="bg-[#eef3ee] border-b border-gray-200">
                            <td className="px-4 py-2 font-bold text-[#002f3c] uppercase">
                              Primary Cost Category
                            </td>
                            <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                {formatCurrency(catDr)}
                            </td>
                            <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                {formatCurrency(catCr)}
                            </td>
                            <td className="px-4 py-2 font-bold text-right text-[#002f3c]">
                                <span className={catBal > 0 ? "text-red-700" : catBal < 0 ? "text-green-700" : "text-gray-900"}>
                                  {formatBalance(catBal)}
                                </span>
                            </td>
                          </tr>
                          {noCatCenters.map(cc => {
                            const bal = (costCenterBalances[cc.id]?.dr || 0) - (costCenterBalances[cc.id]?.cr || 0);
                            return (
                              <tr key={cc.id} className="hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer">
                                <td className="px-4 py-2 pl-8">
                                  <span className="text-xs font-bold text-[#002f3c]">{cc.name}</span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {formatCurrency(costCenterBalances[cc.id]?.dr || 0)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {formatCurrency(costCenterBalances[cc.id]?.cr || 0)}
                                </td>
                                <td className="px-4 py-2 font-bold text-right">
                                  <span className={bal > 0 ? "text-red-700" : bal < 0 ? "text-green-700" : "text-gray-900"}>
                                    {formatBalance(bal)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                        );
                      })()}
                      </>
                    );
                  })()}
                </tbody>
              </>
            ) : reportType === 'LEDGER' ? (
              <>
                {showInterestCalc ? (
                  <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                    <tr>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-left">{t('date')}</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-left">Voucher Particulars</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Debit / (Credit) Principal</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-center">Days Active</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-center">Applied Rate</th>
                      <th className="px-4 py-2.5 text-right">Accrued Interest</th>
                    </tr>
                  </thead>
                ) : (
                  <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                    <tr>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('date')}</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('particulars')}</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('debit')}</th>
                      <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('credit')}</th>
                      <th className="px-4 py-2.5 text-right">{t('balance')}</th>
                    </tr>
                  </thead>
                )}
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const ledger = ledgers.find(l => l.id === selectedLedgerId);
                    if (!selectedLedgerId) {
                      return (
                        <tr>
                          <td colSpan={showInterestCalc ? 6 : 5} className="px-4 py-12 text-center text-gray-400">
                            {t('please_select_ledger')}
                          </td>
                        </tr>
                      );
                    }

                    const ledgerVouchers = vouchers
                      .filter(v => (v.ledgerId === selectedLedgerId || v.salesPurchaseLedgerId === selectedLedgerId || v.debitLedgerId === selectedLedgerId || v.creditLedgerId === selectedLedgerId || v.items?.some(i => i.ledgerId === selectedLedgerId)) && v.date >= dateRange.from && v.date <= dateRange.to)
                      .sort((a, b) => a.date.localeCompare(b.date));

                    if (showInterestCalc) {
                      let totalPrincipal = 0;
                      let totalAccruedInterest = 0;
                      const getDaysBetween = (d1Str: string, d2Str: string) => {
                        const d1 = new Date(d1Str);
                        const d2 = new Date(d2Str);
                        const diff = d2.getTime() - d1.getTime();
                        return isNaN(diff) ? 0 : Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
                      };

                      const openingStockOrBal = ledger?.openingBalance || 0;
                      const daysForOpening = getDaysBetween(dateRange.from, dateRange.to);
                      const effectiveOpeningDays = Math.max(0, daysForOpening - interestGraceDays);
                      const openingInterest = Math.abs(openingStockOrBal) * (interestRate / 100) * (effectiveOpeningDays / 365);
                      
                      totalPrincipal += openingStockOrBal;
                      totalAccruedInterest += openingInterest;

                      return (
                        <>
                          <tr className="bg-[#eef3ee]/60 border-b border-gray-100">
                            <td className="px-4 py-2 text-gray-500">{dateRange.from}</td>
                            <td className="px-4 py-2 font-bold text-[#002f3c]">{t('opening_balance')}</td>
                            <td className="px-4 py-2 text-right font-bold text-[#002f3c]">{formatBalance(openingStockOrBal)}</td>
                            <td className="px-4 py-2 text-center font-bold text-gray-600">
                              <div>{daysForOpening} days</div>
                              {interestGraceDays > 0 && (
                                <span className="block text-[10px] text-amber-700 font-semibold leading-tight">
                                  ({effectiveOpeningDays} post-grace)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center text-xs font-semibold text-teal-700">
                              {interestRate}% Simple
                              {interestGraceDays > 0 && <span className="block text-[9px] text-amber-700">-{interestGraceDays} days grace</span>}
                            </td>
                            <td className="px-4 py-2 font-extrabold text-emerald-800 text-right">{formatCurrency(openingInterest)}</td>
                          </tr>
                          
                          {ledgerVouchers.map((v, index) => {
                            const ledgerChange = getVoucherLedgerChange(v, selectedLedgerId);
                            if (Math.abs(ledgerChange) < 0.01) return null;

                            const daysActive = getDaysBetween(v.date, dateRange.to);
                            const effectiveDaysActive = Math.max(0, daysActive - interestGraceDays);
                            const accruedInterest = Math.abs(ledgerChange) * (interestRate / 100) * (effectiveDaysActive / 365);
                            totalPrincipal += ledgerChange;
                            totalAccruedInterest += accruedInterest;

                            return (
                              <tr key={v.id} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedSummaryVoucher(v); }}>
                                <td className="px-4 py-2 text-gray-900">{v.date}</td>
                                <td className="px-4 py-2 font-bold text-[#002f3c]">
                                  {v.type} #{v.voucherNumber}
                                  {v.status && (
                                    <span className="ml-1.5 text-[8px] bg-teal-100 px-1 py-0.5 rounded text-teal-800 font-bold uppercase">{v.status}</span>
                                  )}
                                  <span className="block text-[11px] text-gray-500 font-normal mt-0.5">{v.narration}</span>
                                </td>
                                <td className={`px-4 py-2 text-right font-bold ${ledgerChange > 0 ? 'text-rose-700' : 'text-emerald-750'}`}>
                                  {formatBalance(ledgerChange)}
                                </td>
                                <td className="px-4 py-2 text-center font-bold text-gray-650">
                                  <div>{daysActive} days</div>
                                  {interestGraceDays > 0 && (
                                    <span className="block text-[10px] text-amber-700 font-semibold leading-tight">
                                      ({effectiveDaysActive} post-grace)
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center text-xs font-bold text-teal-755">
                                  {interestRate}% Simple
                                  {interestGraceDays > 0 && <span className="block text-[9px] text-amber-600">-{interestGraceDays} days grace</span>}
                                </td>
                                <td className="px-4 py-2 font-extrabold text-emerald-800 text-right">
                                  {accruedInterest > 0 ? formatCurrency(accruedInterest) : '-'}
                                </td>
                              </tr>
                            );
                          })}

                          <tr className="bg-[#ffcb2b]/15 font-bold border-t-2 border-b-4 border-double border-[#003c46]">
                            <td colSpan={2} className="px-4 py-3 text-[#003c46] font-extrabold text-xs tracking-wider uppercase">
                              <div>Total Accrued Interest For Period</div>
                              {interestGraceDays > 0 && (
                                <span className="block text-[10px] text-amber-800 font-bold normal-case mt-1 bg-amber-100/50 px-2 py-0.5 rounded-sm inline-block">
                                  (With Concessional Grace / Off Period of {interestGraceDays} days per transaction)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-800 font-extrabold">{formatBalance(totalPrincipal)}</td>
                            <td className="px-4 py-3 text-center text-xs text-gray-500">-</td>
                            <td className="px-4 py-3 text-center text-teal-850 font-bold">{interestRate}% Simple</td>
                            <td className="px-4 py-3 text-emerald-850 text-right font-extrabold text-base">
                              {formatCurrency(totalAccruedInterest)}
                            </td>
                          </tr>
                        </>
                      );
                    }

                    let runningBalance = ledger?.openingBalance || 0;
                    let totalDebit = 0;
                    let totalCredit = 0;

                    return (
                      <>
                        <tr className="bg-[#eef3ee]/60 font-medium border-b border-gray-100">
                          <td className="px-4 py-2 text-gray-500">{dateRange.from}</td>
                          <td className="px-4 py-2 text-[#002f3c] font-bold">{t('opening_balance')}</td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2 font-bold text-[#002f3c] text-right">
                            {formatBalance(runningBalance)}
                          </td>
                        </tr>
                        {ledgerVouchers.map((v, index) => {
                          const ledgerChange = getVoucherLedgerChange(v, selectedLedgerId);
                          const debit = ledgerChange > 0 ? ledgerChange : 0;
                          const credit = ledgerChange < 0 ? -ledgerChange : 0;
                          
                          totalDebit += debit;
                          totalCredit += credit;
                          runningBalance += (debit - credit);
                          
                          return (
                            <tr key={v.id} className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''}`} onClick={() => { setSelectedIndex(index); setSelectedSummaryVoucher(v); }}>
                              <td className="px-4 py-2 text-gray-900">{v.date}</td>
                              <td className="px-4 py-2 font-bold text-[#002f3c]">
                                {v.type} #{v.voucherNumber}
                                {v.status && (
                                  <span className="ml-1.5 text-[8px] bg-teal-100 px-1 py-0.5 rounded text-teal-800 font-bold uppercase">{v.status}</span>
                                )}
                                <span className="block text-[11px] text-gray-500 font-normal mt-0.5">{v.narration}</span>
                              </td>
                              <td className="px-4 py-2 text-rose-700 font-bold">
                                {debit > 0 ? formatCurrency(debit) : '-'}
                              </td>
                              <td className="px-4 py-2 text-emerald-700 font-bold">
                                {credit > 0 ? formatCurrency(credit) : '-'}
                              </td>
                              <td className="px-4 py-2 font-bold text-[#002f3c] text-right">
                                {formatBalance(runningBalance)}
                              </td>
                            </tr>
                          );
                        })}
                        {ledgerVouchers.length > 0 && (
                          <tr className="bg-[#eef3ee] font-bold border-t border-b-4 border-double border-[#003c46]">
                            <td colSpan={2} className="px-4 py-2.5 text-[#002f3c]">
                              {ledger?.group === 'Sales Accounts' ? t('total_sales') : 
                               ledger?.group === 'Purchase Accounts' ? t('total_purchases') : 
                               t('total_for_period')}
                            </td>
                            <td className="px-4 py-2.5 text-rose-700">{formatCurrency(totalDebit)}</td>
                            <td className="px-4 py-2.5 text-emerald-700">{formatCurrency(totalCredit)}</td>
                            <td className="px-4 py-2.5 text-[#002f3c] text-right">
                              {formatBalance(runningBalance)}
                            </td>
                          </tr>
                        )}
                        {ledgerVouchers.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">
                              {t('no_transactions_found')}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </>
            ) : reportType === 'POS_REGISTER' ? (
              <>
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-[11px] uppercase font-mono border-b-2 border-[#003c46]">
                  <tr>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Date</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Invoice No</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Customer Name</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">Payment Mode</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Sub Total</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">CGST SGST IGST</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Total Amount</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0 text-right">Cash Received</th>
                    <th className="px-4 py-2.5 text-right">Card Charged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const posVouchers = vouchers
                      .filter(v => v.type === 'Sales' && v.isPos && v.date >= dateRange.from && v.date <= dateRange.to)
                      .sort((a, b) => a.date.localeCompare(b.date));

                    if (posVouchers.length === 0) {
                      return (
                        <tr>
                          <td colSpan={9} className="px-4 py-12 text-center text-gray-400 italic">
                            No POS transactions found for the specified period.
                          </td>
                        </tr>
                      );
                    }

                    let grandSubTotal = 0;
                    let grandTaxTotal = 0;
                    let grandTotalAmount = 0;
                    let grandCashAmount = 0;
                    let grandCardAmount = 0;

                    return (
                      <>
                        {posVouchers.map((v) => {
                          const taxAmount = (v.cgst || 0) + (v.sgst || 0) + (v.igst || 0);
                          const total = v.totalAmount || 0;
                          const subTotal = v.amount || 0;

                          let cashPortion = 0;
                          let cardPortion = 0;
                          if (v.posPaymentMode === 'Cash') {
                            cashPortion = total;
                          } else if (v.posPaymentMode === 'Card') {
                            cardPortion = total;
                          } else if (v.posPaymentMode === 'Multi-Mode') {
                            cashPortion = v.posCashAmount || 0;
                            cardPortion = v.posCardAmount || 0;
                          }

                          grandSubTotal += subTotal;
                          grandTaxTotal += taxAmount;
                          grandTotalAmount += total;
                          grandCashAmount += cashPortion;
                          grandCardAmount += cardPortion;

                          return (
                            <tr key={v.id} className="hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer" onClick={() => setSelectedSummaryVoucher(v)}>
                              <td className="px-4 py-2 text-slate-800">{v.date}</td>
                              <td className="px-4 py-2 font-bold text-teal-900">{v.voucherNumber}</td>
                              <td className="px-4 py-2 text-slate-900 font-semibold">
                                {ledgers.find(l => l.id === v.ledgerId)?.name || 'Walk-in Customer'}
                              </td>
                              <td className="px-4 py-1.5 uppercase font-bold text-[10px]">
                                <span className={`px-2 py-0.5 rounded ${
                                  v.posPaymentMode === 'Cash' ? 'bg-amber-100 text-amber-805 border border-amber-300/40' :
                                  v.posPaymentMode === 'Card' ? 'bg-blue-100 text-blue-805 border border-blue-300/40' :
                                  'bg-purple-100 text-purple-805 border border-purple-300/40'
                                }`}>
                                  {v.posPaymentMode || 'Cash'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-slate-700">{formatCurrency(subTotal)}</td>
                              <td className="px-4 py-2 text-right text-gray-500">{formatCurrency(taxAmount)}</td>
                              <td className="px-4 py-2 text-right font-extrabold text-[#004d5a]">{formatCurrency(total)}</td>
                              <td className="px-4 py-2 text-right text-emerald-800 font-medium">{cashPortion > 0 ? formatCurrency(cashPortion) : '-'}</td>
                              <td className="px-4 py-2 text-right text-indigo-700 font-medium">{cardPortion > 0 ? formatCurrency(cardPortion) : '-'}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-[#004d5a]/10 font-bold uppercase text-xs border-t-2 border-[#004d5a] font-mono text-slate-900">
                          <td colSpan={4} className="px-4 py-3 text-left font-black tracking-wider">
                            Grand Total ({posVouchers.length} POS Sales)
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(grandSubTotal)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(grandTaxTotal)}</td>
                          <td className="px-4 py-3 text-right text-[#004d5a] font-black">{formatCurrency(grandTotalAmount)}</td>
                          <td className="px-4 py-3 text-right text-emerald-900 font-black">{formatCurrency(grandCashAmount)}</td>
                          <td className="px-4 py-3 text-right text-indigo-900 font-black">{formatCurrency(grandCardAmount)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </>
            ) : (
              <>
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold text-xs uppercase font-mono border-b-2 border-[#003c46]">
                  <tr>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('date')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('voucher')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('ledger')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('amount')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('gst')}</th>
                    <th className="px-4 py-2.5 border-r border-[#003c46]/45 last:border-r-0">{t('total')}</th>
                    <th className="px-4 py-2.5 text-center">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vouchers
                    .filter(v => v.date >= dateRange.from && v.date <= dateRange.to)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((v, index) => {
                      const isCancelled = v.status === 'Cancelled';
                      const isOptional = v.status === 'Optional';
                      return (
                        <tr 
                          key={v.id} 
                          className={`hover:bg-[#ffffcc]/80 transition-colors border-b border-gray-100 cursor-pointer ${
                            selectedIndex === index ? 'bg-[#ffffcc] text-[#002f3c] font-semibold border-l-4 border-teal-600 pl-2' : ''
                          } ${
                            isCancelled ? 'opacity-50 line-through text-gray-500' : 
                            isOptional ? 'bg-orange-50/45 italic' : ''
                          }`} 
                          onClick={() => { setSelectedIndex(index); setSelectedSummaryVoucher(v); }}
                        >
                          <td className="px-4 py-2 text-gray-900">{v.date}</td>
                          <td className="px-4 py-2 font-bold text-[#002f3c]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{v.type} #{v.voucherNumber}</span>
                              {v.status && v.status !== 'Regular' && (
                                <span className={`text-[9px] font-bold px-1 rounded-sm ${
                                  isCancelled ? 'bg-rose-100 text-rose-700 border border-rose-300' :
                                  isOptional ? 'bg-orange-100 text-orange-700 border border-orange-300' :
                                  'bg-indigo-100 text-indigo-700 border border-indigo-300'
                                }`}>
                                  {v.status}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {ledgers.find(l => l.id === v.ledgerId)?.name || t('unknown')}
                          </td>
                          <td className="px-4 py-2 text-gray-900">{isCancelled ? '-' : formatCurrency(v.amount)}</td>
                          <td className="px-4 py-2 text-gray-500">{isCancelled ? '-' : formatCurrency(v.cgst + v.sgst + v.igst)}</td>
                          <td className="px-4 py-2 font-bold text-[#002f3c]">{isCancelled ? formatCurrency(0) : formatCurrency(v.totalAmount)}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteVoucher(v); }}
                              className="text-rose-600 hover:text-rose-800 transition-colors inline-block"
                              title={t('delete_voucher')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {vouchers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        {t('no_transactions_found_criteria')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </>
            )}
          </table>
          </div>
          )}
        </div>
      </div>
      {isAiModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden border border-purple-100">
            <div className="p-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Bot size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">AI Financial Insights</h3>
                  <p className="text-xs text-purple-100 opacity-80">Powered by Gemini AI</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAiModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-8 overflow-y-auto flex-1 prose prose-sm max-w-none">
              {aiInsights ? (
                <div className="markdown-body">
                  <Markdown>{aiInsights}</Markdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                  <Loader2 size={40} className="animate-spin text-purple-600" />
                  <p className="animate-pulse font-medium">Generating financial insights...</p>
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setIsAiModalOpen(false)}
                className="px-6 py-2 bg-white border border-gray-200 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{t('delete_voucher')}</h3>
            <p className="text-gray-600 mb-6">{t('confirm_delete_voucher', { number: voucherToDelete?.voucherNumber })}</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg font-bold text-gray-600 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedSummaryVoucher && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText className="text-teal-700" size={18} />
                Voucher Summary &amp; Bill: {selectedSummaryVoucher.type} #{selectedSummaryVoucher.voucherNumber}
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  onClick={() => setSelectedSummaryVoucher(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-100 flex-1">
              <div className="bg-white shadow border border-slate-200 rounded-lg p-1.5 max-w-3xl mx-auto">
                <VoucherPrint 
                  voucher={selectedSummaryVoucher}
                  ledgers={ledgers}
                  products={products}
                  godowns={godowns}
                  company={activeCompany!}
                />
              </div>
            </div>
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSummaryVoucher(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition-colors text-xs cursor-pointer"
              >
                Close Details
              </button>
            </div>
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
