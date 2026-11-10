import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, query, onSnapshot, orderBy, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Voucher, Product, Ledger } from '../types';
import { formatCurrency as formatCurrencyUtil, formatBalance as formatBalanceUtil } from '../lib/utils';
import { getGroupCategory } from '../constants';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  Package,
  Building2,
  FileText,
  Plus,
  Calculator,
  Zap,
  Users,
  MapPin,
  Calendar,
  Printer,
  X,
  Eye,
  LayoutGrid,
  Landmark,
  Percent,
  BookOpen,
  Database,
  ShoppingBag,
  ShoppingCart,
  PieChart as PieChartIcon,
  Award,
  UserCheck,
  ShieldCheck,
  Bell,
  BookMarked,
  Shield,
  HardDrive,
  Settings,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Layers,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { 
  LineChart,
  Line,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { useCompany } from '../contexts/CompanyContext';
import { calculateLedgerBalances, calculateProductStocks } from '../lib/voucherUtils';
import { dataService } from '../services/dataService';
import ProductSummaryModal from '../components/ProductSummaryModal';
import VoucherPrint from '../components/VoucherPrint';

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedSummaryProduct, setSelectedSummaryProduct] = useState<Product | null>(null);
  const [selectedSummaryVoucher, setSelectedSummaryVoucher] = useState<Voucher | null>(null);
  const [activeDetailModal, setActiveDetailModal] = useState<'income' | 'expenses' | 'profit_loss' | 'cash_bank' | 'receivables' | 'payables' | 'stock_value' | 'gross_profit' | 'cash_in_hand' | 'bank_balance' | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    income: 0,
    expenses: 0,
    profit: 0,
    grossProfit: 0,
    stockValue: 0,
    receivables: 0,
    payables: 0,
    totalSales: 0,
    totalPurchases: 0,
    cashInHand: 0,
    bankBalance: 0,
    cashBankBalance: 0
  });

  const currencySymbol = activeCompany?.currencySymbol || (activeCompany?.country === 'India' ? '₹' : (activeCompany?.country ? '' : '₹'));

  const formatCurrency = (amount: number) => {
    return formatCurrencyUtil(amount, currencySymbol);
  };

  const formatBalance = (amount: number) => {
    return formatBalanceUtil(amount, currencySymbol);
  };

  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [productSalesData, setProductSalesData] = useState<any[]>([]);
  const [topCustomersData, setTopCustomersData] = useState<any[]>([]);
  const [productStocks, setProductStocks] = useState<Record<string, number>>({});
  const [expenseBreakdownData, setExpenseBreakdownData] = useState<any[]>([]);
  const [cashFlowTrendData, setCashFlowTrendData] = useState<any[]>([]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const ledgerBalances = React.useMemo(() => {
    return calculateLedgerBalances(ledgers, vouchers);
  }, [ledgers, vouchers]);

  const sundryDebtors = React.useMemo(() => {
    return ledgers
      .filter(l => l.group === 'Sundry Debtors')
      .map(l => ({ ...l, balance: Number(ledgerBalances[l.id!]) || 0 }))
      .sort((a, b) => b.balance - a.balance);
  }, [ledgers, ledgerBalances]);

  const sundryCreditors = React.useMemo(() => {
    return ledgers
      .filter(l => l.group === 'Sundry Creditors')
      .map(l => ({ ...l, balance: Number(ledgerBalances[l.id!]) || 0 }))
      .sort((a, b) => b.balance - a.balance);
  }, [ledgers, ledgerBalances]);

  useEffect(() => {
    if (!ledgers.length && !vouchers.length) return;

    const ledgerBalances = calculateLedgerBalances(ledgers, vouchers);
    const calculatedStocks = calculateProductStocks(products, vouchers);
    setProductStocks(calculatedStocks);

    const openingStockValue = products.reduce((sum, p) => sum + ((p.openingStock || 0) * (p.purchasePrice || 0)), 0);
    const closingStockValue = products.reduce((sum, p) => sum + ((calculatedStocks[p.id!] || 0) * (p.purchasePrice || 0)), 0);

    const getGroupCurrentBalance = (groupNames: string[], includeCashByName: boolean = false) => {
      return ledgers
        .filter(l => 
          groupNames.some(g => l.group?.trim().toLowerCase() === g.toLowerCase()) || 
          (includeCashByName && (l.name.toLowerCase() === 'cash' || l.name.toLowerCase() === 'cash a/c'))
        )
        .reduce((sum, l) => sum + (Number(ledgerBalances[l.id!]) || 0), 0);
    };

    // 1. Sales from Ledgers (Normal Cr balance is negative in Dr-positive signed balances, so negate)
    const salesFromLedgers = -getGroupCurrentBalance(['Sales Accounts', 'Sales Account', 'Sales']);
    
    // 2. Direct Incomes from Ledgers
    const directIncFromLedgers = -getGroupCurrentBalance(['Direct Incomes', 'Direct Income']);
    
    // 3. Indirect Incomes from Ledgers
    const indirectIncFromLedgers = -getGroupCurrentBalance(['Indirect Incomes', 'Indirect Income', 'Income', 'Incomes', 'Revenue', 'Operating Income', 'Other Income']);

    // 4. All Income-categorized Ledgers sum
    const allIncomeLedgers = ledgers.filter(l => getGroupCategory(l.group) === 'Income');
    const incomeFromAllIncomeLedgers = allIncomeLedgers.reduce((sum, l) => {
      const bal = Number(ledgerBalances[l.id!]) || 0;
      // In double-entry convention, income credit balance is negative -> turn to positive revenue
      return sum + (bal < 0 ? -bal : Math.abs(bal));
    }, 0);

    // 5. Total Sales from Vouchers
    const salesVouchersTotal = vouchers
      .filter(v => (v.type === 'Sales' || v.type === 'Sales Order') && v.status !== 'Cancelled' && v.status !== 'Optional')
      .reduce((sum, v) => sum + (Number(v.totalAmount) || Number(v.amount) || 0), 0);

    // 6. Purchases
    const purchaseFromLedgers = getGroupCurrentBalance(['Purchase Accounts', 'Purchase Account', 'Purchase', 'Purchases']);
    const purchaseVouchersTotal = vouchers
      .filter(v => (v.type === 'Purchase' || v.type === 'Purchase Order') && v.status !== 'Cancelled' && v.status !== 'Optional')
      .reduce((sum, v) => sum + (Number(v.totalAmount) || Number(v.amount) || 0), 0);

    const directExpTotal = getGroupCurrentBalance(['Direct Expenses', 'Direct Expense']);
    const indirectExpTotal = getGroupCurrentBalance(['Indirect Expenses', 'Indirect Expense']);

    const salesTotal = Math.max(salesFromLedgers > 0 ? salesFromLedgers : 0, salesVouchersTotal);
    const purchaseTotal = Math.max(purchaseFromLedgers > 0 ? purchaseFromLedgers : 0, purchaseVouchersTotal);
    const directIncTotal = Math.max(0, directIncFromLedgers);
    const indirectIncTotal = Math.max(0, indirectIncFromLedgers);

    const grossProfit = (salesTotal + directIncTotal + closingStockValue) - (openingStockValue + purchaseTotal + directExpTotal);
    const netProfit = (grossProfit + indirectIncTotal) - indirectExpTotal;

    const income = Math.max(
      salesTotal + directIncTotal + indirectIncTotal,
      incomeFromAllIncomeLedgers
    );
    const expenses = purchaseTotal + directExpTotal + indirectExpTotal;

    const receivables = getGroupCurrentBalance(['Sundry Debtors']);
    const payables = Math.abs(getGroupCurrentBalance(['Sundry Creditors']));
    const cashInHand = getGroupCurrentBalance(['Cash-in-Hand', 'Cash in Hand'], true);
    const bankBalance = getGroupCurrentBalance(['Bank Accounts', 'Bank Account']);
    const cashBankBalance = cashInHand + bankBalance;

    setStats({
      income,
      expenses,
      profit: netProfit,
      grossProfit,
      receivables,
      payables,
      stockValue: closingStockValue,
      totalSales: salesTotal,
      totalPurchases: purchaseTotal,
      cashInHand,
      bankBalance,
      cashBankBalance
    });
  }, [vouchers, ledgers, products]);

  const lowStockProducts = products
    .map(p => ({ ...p, stock: productStocks[p.id!] || 0 }))
    .filter(p => p.stock < (p.minStockLevel || 10))
    .sort((a, b) => a.stock - b.stock);

  const topDebtors = ledgers
    .filter(l => l.group === 'Sundry Debtors')
    .map(l => ({ ...l, balance: Number(calculateLedgerBalances(ledgers, vouchers)[l.id!]) || 0 }))
    .filter(l => l.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  useEffect(() => {
    if (!activeCompany?.id) return;

    const conditions = [{ field: 'companyId' as const, operator: '==' as const, value: activeCompany.id }];

    const unsubscribeV = dataService.onSnapshotCollection<Voucher>(
      'vouchers',
      conditions,
      (voucherData) => {
        const sorted = [...voucherData].sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());
        setVouchers(sorted);
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
        console.error('Dashboard: Error fetching vouchers:', error);
        setError(error.message);
      }
    );

    const unsubscribeL = dataService.onSnapshotCollection<Ledger>(
      'ledgers',
      conditions,
      (ledgerData) => {
        setLedgers(ledgerData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) {
          return;
        }
        console.error('Dashboard: Error fetching ledgers:', error);
      }
    );

    const unsubscribeP = dataService.onSnapshotCollection<Product>(
      'products',
      conditions,
      (productData) => {
        setProducts(productData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) {
          return;
        }
        console.error('Dashboard: Error fetching products:', error);
      }
    );

    const unsubscribeG = dataService.onSnapshotCollection<any>(
      'godowns',
      conditions,
      (godownData) => {
        setGodowns(godownData);
      },
      (error: any) => {
        if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) {
          console.warn('Dashboard: Godowns query deferred until session verification.');
          return;
        }
        console.error('Dashboard: Error fetching godowns:', error);
      }
    );

    return () => {
      unsubscribeV();
      unsubscribeL();
      unsubscribeP();
      unsubscribeG();
    };
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!vouchers.length) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(month => ({ name: month, income: 0, expenses: 0 }));
    
    const productSales: Record<string, number> = {};
    const customerSales: Record<string, number> = {};

    vouchers.forEach(v => {
      const date = new Date(v.date);
      const monthIdx = date.getMonth();
      if (v.type === 'Sales' || v.type === 'Receipt') data[monthIdx].income += (v.amount || v.totalAmount);
      if (v.type === 'Purchase' || v.type === 'Payment') data[monthIdx].expenses += (v.amount || v.totalAmount);

      if (v.type === 'Sales') {
        // Product Sales
        if (v.items) {
          v.items.forEach(item => {
            if (item.productId) {
              const product = products.find(p => p.id === item.productId);
              const name = product?.name || 'Unknown';
              productSales[name] = (productSales[name] || 0) + (item.amount || (item.quantity * item.rate));
            }
          });
        }

        // Customer Sales
        if (v.ledgerId) {
          const ledger = ledgers.find(l => l.id === v.ledgerId);
          if (ledger && ledger.group === 'Sundry Debtors') {
            customerSales[ledger.name] = (customerSales[ledger.name] || 0) + v.totalAmount;
          }
        }
      }
    });

    setMonthlyData(data);

    const sortedProductSales = Object.entries(productSales)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setProductSalesData(sortedProductSales);

    const sortedCustomerSales = Object.entries(customerSales)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setTopCustomersData(sortedCustomerSales);

    // Expense Breakdown
    const expenseBreakdown: Record<string, number> = {};
    vouchers.forEach(v => {
      if (v.type === 'Payment' || v.type === 'Purchase') {
        const ledger = ledgers.find(l => l.id === v.ledgerId);
        if (ledger) {
          const group = ledger.group;
          expenseBreakdown[group] = (expenseBreakdown[group] || 0) + v.totalAmount;
        }
      }
    });
    setExpenseBreakdownData(Object.entries(expenseBreakdown).map(([name, value]) => ({ name, value })));

    // Cash Flow Trend
    const cashFlowTrend = months.map((month, idx) => {
      const monthVouchers = vouchers.filter(v => new Date(v.date).getMonth() === idx);
      const inflows = monthVouchers.filter(v => v.type === 'Receipt' || v.type === 'Sales').reduce((sum, v) => sum + v.totalAmount, 0);
      const outflows = monthVouchers.filter(v => v.type === 'Payment' || v.type === 'Purchase').reduce((sum, v) => sum + v.totalAmount, 0);
      return { name: month, balance: inflows - outflows };
    });
    setCashFlowTrendData(cashFlowTrend);
  }, [vouchers, products, ledgers]);

  const StatCard = ({ title, value, icon: Icon, trend, trendValue, onClick }: any) => (
    <div 
      onClick={onClick}
      className={`bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col font-sans text-xs overflow-hidden transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-[#146e85] hover:shadow-md hover:scale-[1.01]' : ''
      }`}
    >
      <div className="bg-[#f4f7f8] text-[#146e85] px-3 py-1.5 font-bold text-[12px] uppercase border-b border-slate-200 flex justify-between items-center">
        <span>{title}</span>
        <Icon size={14} className="text-[#146e85]/70" />
      </div>
      <div className="p-4 flex flex-col justify-between flex-1">
        <div className="text-xl font-bold text-slate-800 tracking-tight">{value}</div>
        {trend && (
          <div className={`mt-2 flex items-center gap-1 font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className="text-[10px]">{trendValue}</span>
            {trend === 'up' ? <SmallTrendingUp size={10} /> : <SmallTrendingDown size={10} />}
          </div>
        )}
      </div>
    </div>
  );

  const InsightsSection = ({ debtors }: { debtors: any[] }) => {
    if (debtors.length === 0) return null;

    return (
      <div className="grid grid-cols-1 gap-4">
        {debtors.length > 0 && (
          <div className="bg-[#f2fbff] border border-blue-100 rounded-sm overflow-hidden text-xs">
            <div className="bg-[#146e85] text-white font-bold text-[11px] uppercase px-4 py-2 flex items-center gap-2">
              <TrendingUp size={14} />
              <span>Top Pending Receivables</span>
            </div>
            <div className="p-3 space-y-2">
              {debtors.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-white p-2 border border-blue-50 rounded-sm">
                  <span className="font-bold text-slate-800">{d.name}</span>
                  <span className="text-blue-700 font-extrabold">{formatBalance(d.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const SmallTrendingUp = ({ size }: { size: number }) => <TrendingUp size={size} />;
  const SmallTrendingDown = ({ size }: { size: number }) => <TrendingDown size={size} />;

  if (!activeCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] space-y-4 font-sans no-print">
        <div className="w-20 h-20 bg-[#f4f7f8] rounded-full flex items-center justify-center border-2 border-dashed border-[#146e85]/30">
          <Building2 size={40} className="text-[#146e85]/40" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">No Active Company</h2>
          <p className="text-xs text-slate-500 mt-1">Please select or create a company to view the dashboard.</p>
        </div>
        <button
          onClick={() => navigate('/company')}
          className="bg-[#146e85] hover:bg-[#105a6e] text-white px-6 py-2 rounded-sm font-bold text-xs uppercase transition-all shadow-md flex items-center gap-2"
        >
          <Building2 size={14} />
          Go to Company Hub
        </button>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-5 space-y-5 font-sans">
      {/* ==================== 1. TOP HEADER & QUICK ACTIONS ==================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4 w-full md:w-auto">
          {activeCompany?.logoUrl ? (
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-1 shadow-md shadow-slate-200/50 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={activeCompany.logoUrl}
                alt={activeCompany.name}
                className="w-full h-full object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-[#00875a] text-white flex items-center justify-center shadow-md shadow-emerald-700/20 shrink-0 font-black text-xl">
              <LayoutGrid size={28} />
            </div>
          )}
          <div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00875a]"></span>
              <span>LIVE DASHBOARD</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              {activeCompany.name}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Financial Overview &amp; Real-time Operations
            </p>
          </div>
        </div>

        {/* Right Financial Year & Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-2 px-3.5 flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/15 text-emerald-800 flex items-center justify-center shrink-0">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-[9px] uppercase font-black tracking-wider text-emerald-800">
                FINANCIAL YEAR
              </p>
              <p className="text-xs font-black text-emerald-950 font-mono">
                {activeCompany.financialYear ? `FY ${activeCompany.financialYear}` : 'FY 2026-27'}
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/vouchers', { state: { viewMode: 'entry' } })}
            className="px-3.5 py-2 rounded-xl bg-[#00875a] hover:bg-[#00704a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>New Voucher</span>
          </button>

          <button
            onClick={() => navigate('/reports')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
          >
            <BarChart3 size={15} />
            <span>All Reports</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-3 no-print">
          <Zap className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold mb-1">Database Error</p>
            {error.includes('https://console.firebase.google.com') ? (
              <p className="text-sm">
                This page requires a composite index to display data. 
                <a 
                  href={error.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block mt-2 font-bold underline hover:text-rose-800"
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

      {/* ==================== 2. PRIMARY EXECUTIVE KPI METRIC CARDS ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => { setActiveDetailModal('income'); setModalSearchTerm(''); }}
          className="bg-white border border-slate-200/90 hover:border-emerald-500 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Total Income</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.income)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700 font-bold">
              <ArrowUpRight size={14} />
              <span>Active Turnover &bull; Click to Audit</span>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setActiveDetailModal('expenses'); setModalSearchTerm(''); }}
          className="bg-white border border-slate-200/90 hover:border-rose-400 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Total Expenses</span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatCurrency(stats.expenses)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-rose-600 font-bold">
              <ArrowDownRight size={14} />
              <span>Direct + Indirect &bull; Click to Audit</span>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setActiveDetailModal('profit_loss'); setModalSearchTerm(''); }}
          className="bg-white border border-slate-200/90 hover:border-teal-500 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Net Profit / Loss</span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${
              stats.profit >= 0 ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700'
            }`}>
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-black tracking-tight ${
              stats.profit >= 0 ? 'text-teal-700' : 'text-rose-600'
            }`}>
              {formatBalance(stats.profit)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-bold">
              <span>{stats.profit >= 0 ? 'Net Profit Margin' : 'Operating Deficit'} &bull; Click to Audit</span>
            </div>
          </div>
        </div>

        <div 
          onClick={() => { setActiveDetailModal('cash_bank'); setModalSearchTerm(''); }}
          className="bg-white border border-slate-200/90 hover:border-sky-500 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Cash &amp; Bank Balance</span>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Building2 size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatBalance(stats.cashBankBalance)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-sky-700 font-bold">
              <span>Liquid Assets &bull; Click to Audit</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 3. FINANCIAL HEALTH METRIC TILE BAR ==================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="bg-slate-50/80 border-b border-slate-200/90 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator size={15} className="text-[#00875a]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Financial Health &amp; Position Breakdown</span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">Click any metric for deep audit trail</span>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div 
            onClick={() => { setActiveDetailModal('receivables'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-emerald-50/50 hover:border-emerald-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Receivables (Debtors)</div>
            <div className="text-sm font-black text-slate-800">{formatBalance(stats.receivables)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('payables'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-rose-50/50 hover:border-rose-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Payables (Creditors)</div>
            <div className="text-sm font-black text-slate-800">{formatBalance(stats.payables)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('stock_value'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-amber-50/50 hover:border-amber-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Closing Stock Value</div>
            <div className="text-sm font-black text-slate-800">{formatCurrency(stats.stockValue)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('gross_profit'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-emerald-50/50 hover:border-emerald-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Gross Profit</div>
            <div className="text-sm font-black text-emerald-700">{formatCurrency(stats.grossProfit)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('profit_loss'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-teal-50/50 hover:border-teal-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Net P&amp;L Balance</div>
            <div className="text-sm font-black text-teal-700">{formatBalance(stats.profit)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('cash_in_hand'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-sky-50/50 hover:border-sky-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Cash in Hand</div>
            <div className="text-sm font-black text-slate-800">{formatBalance(stats.cashInHand)}</div>
          </div>
          <div 
            onClick={() => { setActiveDetailModal('bank_balance'); setModalSearchTerm(''); }}
            className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-indigo-50/50 hover:border-indigo-300 cursor-pointer transition-all hover:scale-[1.02]"
          >
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Bank Accounts</div>
            <div className="text-sm font-black text-slate-800">{formatBalance(stats.bankBalance)}</div>
          </div>
        </div>
      </div>

      {/* ==================== 4. INTERACTIVE FINANCIAL CHARTS SECTION ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly Income vs Expenses Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Monthly Revenue vs Expenses</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Annual comparison across all accounting vouchers</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00875a]"></span> Income
              </span>
              <span className="flex items-center gap-1.5 font-bold text-rose-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Expenses
              </span>
            </div>
          </div>
          <div className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currencySymbol}${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value)), '']}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                />
                <Bar dataKey="income" fill="#00875a" radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Flow Trend Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Net Cash Flow Trend</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Net cash generation (Inflows - Outflows) per month</p>
            </div>
            <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
              Cash Liquidity
            </span>
          </div>
          <div className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowTrendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currencySymbol}${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                <Tooltip 
                  formatter={(value: any) => [formatCurrency(Number(value)), 'Net Flow']}
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="balance" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3, fill: '#0284c7' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ==================== 5. EXPENSE BREAKDOWN & TOP PRODUCTS SECTION ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Expense Category Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Expense Breakdown by Group</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Distribution of operational &amp; purchase costs</p>
            </div>
            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              Audit Split
            </span>
          </div>
          <div className="h-60 pt-2 flex flex-col sm:flex-row items-center justify-center">
            {expenseBreakdownData.length > 0 ? (
              <>
                <div className="w-full sm:w-1/2 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseBreakdownData}
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {expenseBreakdownData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/2 space-y-1.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {expenseBreakdownData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                        <span className="text-slate-700 font-medium truncate">{item.name}</span>
                      </div>
                      <span className="font-bold text-slate-900 shrink-0 ml-2">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                No expense vouchers recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Top Selling Products</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Highest grossing inventory items</p>
            </div>
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              View Inventory &rarr;
            </button>
          </div>
          <div className="pt-3 space-y-2.5">
            {productSalesData.length > 0 ? (
              productSalesData.map((prod, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/70 hover:bg-emerald-50/40 rounded-xl border border-slate-200/80 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800">{prod.name}</span>
                  </div>
                  <span className="text-xs font-black text-emerald-800">
                    {formatCurrency(prod.value)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                No product sales vouchers recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== 6. OPERATIONAL ALERTS & ACTION LISTS ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Pending Receivables (Sundry Debtors) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <TrendingUp size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Top Pending Receivables</h3>
                <p className="text-[11px] text-slate-500">Debtors with highest outstanding balances</p>
              </div>
            </div>
            <button
              onClick={() => { setActiveDetailModal('receivables'); setModalSearchTerm(''); }}
              className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
            >
              Audit All
            </button>
          </div>
          <div className="pt-3 space-y-2">
            {topDebtors.length > 0 ? (
              topDebtors.map(debtor => (
                <div 
                  key={debtor.id} 
                  onClick={() => navigate('/ledgers')}
                  className="flex items-center justify-between p-2.5 bg-slate-50/60 hover:bg-amber-50/40 rounded-xl border border-slate-200/80 cursor-pointer transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800">{debtor.name}</span>
                  <span className="text-xs font-black text-amber-700">{formatBalance(debtor.balance)}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs">
                No outstanding debtor receivables.
              </div>
            )}
          </div>
        </div>

        {/* Low Stock & Critical Inventory Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
                <Package size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Critical Low Stock Alerts</h3>
                <p className="text-[11px] text-slate-500">Inventory items below minimum reorder level</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/inventory')}
              className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
            >
              Manage Stock
            </button>
          </div>
          <div className="pt-3 space-y-2">
            {lowStockProducts.length > 0 ? (
              lowStockProducts.slice(0, 5).map(prod => (
                <div 
                  key={prod.id} 
                  onClick={() => setSelectedSummaryProduct(prod)}
                  className="flex items-center justify-between p-2.5 bg-rose-50/30 hover:bg-rose-50/60 rounded-xl border border-rose-200/80 cursor-pointer transition-colors"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-800">{prod.name}</span>
                    <span className="text-[10px] text-slate-500 ml-2">Min Reorder: {prod.minStockLevel || 10}</span>
                  </div>
                  <span className="text-xs font-black text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full">
                    {prod.stock} in stock
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-emerald-700 text-xs font-medium bg-emerald-50/50 rounded-xl border border-emerald-100">
                All inventory levels are healthy. No reorder alerts.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== 7. RECENT TRANSACTIONS ACTIVITY LOG ==================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">Recent Transactions</h3>
            <p className="text-xs text-slate-500 mt-0.5">Live feed of the latest accounting entries</p>
          </div>
          <button
            onClick={() => navigate('/vouchers')}
            className="text-xs font-bold text-[#00875a] hover:text-[#006b47] hover:underline cursor-pointer"
          >
            View All Vouchers &rarr;
          </button>
        </div>

        <div className="overflow-x-auto pt-2">
          {vouchers.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Voucher #</th>
                  <th className="py-3 px-3">Party / Ledger</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vouchers.slice(0, 8).map(voucher => {
                  const party = ledgers.find(l => l.id === voucher.ledgerId)?.name || 'Direct / Cash';
                  return (
                    <tr 
                      key={voucher.id} 
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-3 font-medium text-slate-600 whitespace-nowrap">{voucher.date}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          voucher.type === 'Sales' ? 'bg-pink-100 text-pink-700' :
                          voucher.type === 'Purchase' ? 'bg-amber-100 text-amber-700' :
                          voucher.type === 'Receipt' ? 'bg-emerald-100 text-emerald-800' :
                          voucher.type === 'Payment' ? 'bg-rose-100 text-rose-700' :
                          voucher.type === 'Contra' ? 'bg-sky-100 text-sky-700' :
                          'bg-teal-100 text-teal-800'
                        }`}>
                          {voucher.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">#{voucher.voucherNumber}</td>
                      <td className="py-3 px-3 font-medium text-slate-800">{party}</td>
                      <td className="py-3 px-3 text-right font-black text-slate-900">{formatCurrency(voucher.totalAmount || voucher.amount)}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedSummaryVoucher(voucher)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          View / Print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              No transactions recorded yet. Click &quot;New Voucher&quot; to begin.
            </div>
          )}
        </div>
      </div>

      {/* ==================== ACTIVE DRILL DOWN AUDIT SHEET ==================== */}
      {activeDetailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-800 to-[#146e85] px-6 py-4 border-b border-teal-900 flex items-center justify-between text-white flex-shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Eye size={20} className="text-yellow-300 animate-pulse" />
                  {activeDetailModal === 'income' && "Total Income Audit Trail"}
                  {activeDetailModal === 'expenses' && "Total Expenses Audit Trail"}
                  {activeDetailModal === 'profit_loss' && "Profit & Loss Account - Year to Date"}
                  {activeDetailModal === 'cash_bank' && "Cash & Bank Balances"}
                  {activeDetailModal === 'receivables' && "Sundry Debtors Outstanding (Receivables)"}
                  {activeDetailModal === 'payables' && "Sundry Creditors Outstanding (Payables)"}
                  {activeDetailModal === 'stock_value' && "Detailed Closing Inventory Stocks"}
                  {activeDetailModal === 'gross_profit' && "Trading Account (Gross Profit Computation)"}
                  {activeDetailModal === 'cash_in_hand' && "Cash-in-Hand Petty Details"}
                  {activeDetailModal === 'bank_balance' && "Bank Account Ledger Balances"}
                </h3>
                <p className="text-[10px] opacity-90 tracking-wide mt-0.5 uppercase font-semibold">
                  {activeCompany?.name} &bull; {activeCompany?.financialYear}
                </p>
              </div>
              <button
                onClick={() => { setActiveDetailModal(null); setModalSearchTerm(''); }}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer text-white"
              >
                <X size={22} />
              </button>
            </div>

            {/* Filter Search Bar */}
            {['income', 'expenses', 'receivables', 'payables', 'stock_value', 'cash_bank', 'cash_in_hand', 'bank_balance'].includes(activeDetailModal) && (
              <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center gap-2 flex-shrink-0">
                <input
                  type="text"
                  placeholder="Search by name, voucher type/number, date, state or amount..."
                  value={modalSearchTerm}
                  onChange={(e) => setModalSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded text-sm text-slate-800"
                  autoFocus
                />
                {modalSearchTerm && (
                  <button 
                    onClick={() => setModalSearchTerm('')} 
                    className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-300 bg-white rounded shadow-sm hover:bg-slate-105 cursor-pointer font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Modal Body Container with customized content layout */}
            <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
              {/* === 1 & 2: Income / Expenses (vouchers list) === */}
              {['income', 'expenses'].includes(activeDetailModal) && (() => {
                const targetTypes = activeDetailModal === 'income' ? ['Sales', 'Receipt'] : ['Purchase', 'Payment'];
                const filteredVouchers = vouchers
                  .filter(v => targetTypes.includes(v.type))
                  .filter(v => {
                    const party = ledgers.find(l => l.id === v.ledgerId)?.name || 'Cash/Bank';
                    const term = modalSearchTerm.toLowerCase();
                    return (
                      v.voucherNumber?.toString().includes(term) ||
                      v.date?.includes(term) ||
                      v.type?.toLowerCase().includes(term) ||
                      party.toLowerCase().includes(term) ||
                      v.totalAmount?.toString().includes(term)
                    );
                  });

                const totalSum = filteredVouchers.reduce((sum, v) => sum + v.totalAmount, 0);

                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-white p-3 border border-slate-205 rounded shadow-sm font-sans">
                      <span className="text-slate-500 text-xs uppercase font-bold">Total Highlighted Amount</span>
                      <span className={activeDetailModal === 'income' ? "text-xl font-bold text-emerald-700" : "text-xl font-bold text-rose-700" }>
                        {formatCurrency(totalSum)}
                      </span>
                    </div>

                    <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Date</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Voucher Typ/No</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Party Ledger</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">Amount</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVouchers.map(v => {
                            const party = ledgers.find(l => l.id === v.ledgerId)?.name || 'Cash/Bank';
                            return (
                              <tr 
                                key={v.id} 
                                onClick={() => setSelectedSummaryVoucher(v)}
                                className="border-b border-slate-100 hover:bg-teal-50/50 cursor-pointer transition-colors"
                              >
                                <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">{v.date}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase mr-1.5 ${
                                    v.type === 'Sales' ? 'bg-amber-100 text-amber-500' :
                                    v.type === 'Purchase' ? 'bg-blue-100 text-blue-500' :
                                    v.type === 'Payment' ? 'bg-emerald-100 text-emerald-500' :
                                    'bg-indigo-100 text-indigo-500'
                                  }`}>
                                    {v.type}
                                  </span>
                                  <span className="font-bold text-slate-800">#{v.voucherNumber}</span>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-700">{party}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(v.totalAmount)}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedSummaryVoucher(v); }} className="text-teal-600 hover:text-teal-800 font-bold text-[11px] underline">
                                    Print Bill
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredVouchers.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-slate-400 italic">No vouchers match the search filters.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* === 3: Profit & Loss Sheet === */}
              {activeDetailModal === 'profit_loss' && (() => {
                const indirectIncomes = ledgers.filter(l => l.group === 'Indirect Incomes');
                const indirectExpenses = ledgers.filter(l => l.group === 'Indirect Expenses');

                const totalIndIncomes = indirectIncomes.reduce((sum, l) => sum + Math.abs(Number(ledgerBalances[l.id!]) || 0), 0);
                const totalIndExpenses = indirectExpenses.reduce((sum, l) => sum + (Number(ledgerBalances[l.id!]) || 0), 0);
                const netProfitLoss = stats.grossProfit + totalIndIncomes - totalIndExpenses;

                return (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center bg-white p-4 border border-slate-200 rounded shadow-sm">
                      <div>
                        <div className="text-xs text-slate-500 font-bold uppercase">Net Profit Margin</div>
                        <div className={`text-2xl font-extrabold mt-1 ${netProfitLoss >= 0 ? 'text-teal-700':'text-rose-600'}`}>
                          {formatBalance(netProfitLoss)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500 font-bold uppercase">Trading Gross Profit</div>
                        <div className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(stats.grossProfit)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Expenses Left */}
                      <div className="bg-white rounded border border-slate-200 overflow-hidden font-sans text-xs shadow-sm">
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-bold uppercase text-[#002f3c] flex justify-between">
                          <span>Operating &amp; Indirect Expenses</span>
                          <span>Dr Balance</span>
                        </div>
                        <div className="p-3 space-y-2">
                          {indirectExpenses.map(l => (
                            <div key={l.id} className="flex justify-between border-b border-slate-100 py-1">
                              <span className="text-slate-700 font-medium">{l.name}</span>
                              <span className="font-bold text-slate-900">{formatCurrency(Number(ledgerBalances[l.id!]) || 0)}</span>
                            </div>
                          ))}
                          {indirectExpenses.length === 0 && <div className="text-slate-400 italic py-2">No indirect expense ledger records found.</div>}
                        </div>
                        <div className="bg-rose-50/55 p-2.5 border-t border-slate-200 flex justify-between font-extrabold text-rose-800">
                          <span>Total Indirect Expenses</span>
                          <span>{formatCurrency(totalIndExpenses)}</span>
                        </div>
                      </div>

                      {/* Incomes Right */}
                      <div className="bg-white rounded border border-slate-200 overflow-hidden font-sans text-xs shadow-sm">
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-bold uppercase text-[#002f3c] flex justify-between">
                          <span>Operating &amp; Indirect Incomes</span>
                          <span>Cr Balance</span>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex justify-between border-b border-slate-100 py-1 bg-emerald-50/40 px-1 rounded">
                            <span className="text-teal-905 font-bold">Gross Profit (from trading)</span>
                            <span className="font-bold text-teal-800">{formatCurrency(stats.grossProfit)}</span>
                          </div>
                          {indirectIncomes.map(l => (
                            <div key={l.id} className="flex justify-between border-b border-slate-100 py-1">
                              <span className="text-slate-700 font-medium">{l.name}</span>
                              <span className="font-bold text-slate-900">{formatCurrency(Math.abs(Number(ledgerBalances[l.id!]) || 0))}</span>
                            </div>
                          ))}
                          {indirectIncomes.length === 0 && <div className="text-slate-400 italic py-2">No indirect income ledger records found.</div>}
                        </div>
                        <div className="bg-emerald-50/55 p-2.5 border-t border-slate-200 flex justify-between font-extrabold text-emerald-800">
                          <span>Total Indirect Incomes</span>
                          <span>{formatCurrency(totalIndIncomes + stats.grossProfit)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* === 4 & 9 & 10: Cash / Bank Balances === */}
              {['cash_bank', 'cash_in_hand', 'bank_balance'].includes(activeDetailModal) && (() => {
                const groups = activeDetailModal === 'cash_in_hand' ? ['Cash-in-Hand'] :
                               activeDetailModal === 'bank_balance' ? ['Bank Accounts'] :
                               ['Cash-in-Hand', 'Bank Accounts'];

                const accountsList = ledgers
                  .filter(l => groups.includes(l.group))
                  .map(l => ({ ...l, balance: Number(ledgerBalances[l.id!]) || 0 }))
                  .filter(l => {
                    const term = modalSearchTerm.toLowerCase();
                    return l.name?.toLowerCase().includes(term) || l.group?.toLowerCase().includes(term);
                  });

                const totalAgg = accountsList.reduce((sum, item) => sum + item.balance, 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-3 border border-slate-200 rounded shadow-sm flex justify-between items-center">
                      <span className="text-xs uppercase font-bold text-slate-550">Total Ledger Cash/Bank Worth</span>
                      <span className="text-xl font-extrabold text-[#146e85]">{formatBalance(totalAgg)}</span>
                    </div>

                    <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Ledger Name</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Group Category</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">Current Ledger Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountsList.map(l => (
                            <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-[#002f3c]">{l.name}</td>
                              <td className="py-2.5 px-3 text-slate-600 font-semibold">{l.group}</td>
                              <td className={`py-2.5 px-3 text-right font-extrabold ${l.balance >= 0 ? "text-slate-850" : "text-rose-600"}`}>
                                {formatBalance(l.balance)}
                              </td>
                            </tr>
                          ))}
                          {accountsList.length === 0 && (
                            <tr>
                              <td colSpan={3} className="py-8 text-center text-slate-400 italic">No cash/bank accounts matched this criteria.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* === 5 & 6: Receivables / Payables (Sundry Debtors / Creditors) === */}
              {['receivables', 'payables'].includes(activeDetailModal) && (() => {
                const rawList = activeDetailModal === 'receivables' ? sundryDebtors : sundryCreditors;
                const filteredList = rawList.filter(item => {
                  const term = modalSearchTerm.toLowerCase();
                  return item.name?.toLowerCase().includes(term) || (item as any).state?.toLowerCase().includes(term);
                });

                const totalOutstanding = filteredList.reduce((sum, item) => sum + Math.abs(item.balance), 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-3 border border-slate-200 rounded shadow-sm flex justify-between items-center font-sans text-xs">
                      <span className="uppercase font-bold text-slate-500">Cumulative Outstanding Balance</span>
                      <span className="text-xl font-bold text-indigo-700">{formatBalance(totalOutstanding)}</span>
                    </div>

                    <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Party Account Name</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">State Location</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">Outstanding Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredList.map(item => (
                            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-slate-800">{item.name}</td>
                              <td className="py-2.5 px-3 text-slate-500 font-semibold">{(item as any).state || 'Local Zone'}</td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-[#146e85]">
                                {formatBalance(Math.abs(item.balance))}
                              </td>
                            </tr>
                          ))}
                          {filteredList.length === 0 && (
                            <tr>
                              <td colSpan={3} className="py-10 text-center text-slate-400 italic">No outstanding ledger balances matching criteria.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* === 7: stock_value (Inventory Closing) === */}
              {activeDetailModal === 'stock_value' && (() => {
                const stockList = products
                  .map(p => {
                    const stock = productStocks[p.id!] || 0;
                    return { ...p, stock, valValue: stock * p.purchasePrice };
                  })
                  .filter(p => {
                    const term = modalSearchTerm.toLowerCase();
                    return p.name?.toLowerCase().includes(term) || p.unit?.toLowerCase().includes(term);
                  })
                  .sort((a, b) => b.valValue - a.valValue);

                const totalValuation = stockList.reduce((sum, item) => sum + item.valValue, 0);

                return (
                  <div className="space-y-4">
                    <div className="bg-white p-3 border border-slate-200 rounded shadow-sm flex justify-between items-center">
                      <span className="text-xs uppercase font-bold text-slate-500">Valuation at Cost (YTD)</span>
                      <span className="text-xl font-extrabold text-emerald-800">{formatCurrency(totalValuation)}</span>
                    </div>

                    <div className="bg-white shadow rounded border border-slate-200 overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase">Product Details</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">Inward Rate</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">In-Stock Qty</th>
                            <th className="py-2.5 px-3 font-bold text-slate-600 uppercase text-right">Cumulative Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockList.map(p => (
                            <tr 
                              key={p.id} 
                              onClick={() => setSelectedSummaryProduct(p)}
                              className="border-b border-slate-100 hover:bg-teal-50/50 cursor-pointer transition-colors"
                            >
                              <td className="py-2.5 px-3 font-bold text-[#002f3c]">{p.name}</td>
                              <td className="py-2.5 px-3 text-right text-slate-600 font-semibold">{formatCurrency(p.purchasePrice)}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-indigo-605">{p.stock} <span className="text-[10px] text-slate-400 font-normal">{p.unit}</span></td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-emerald-800">{formatCurrency(p.valValue)}</td>
                            </tr>
                          ))}
                          {stockList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-10 text-center text-slate-450 italic">No inventory products matching filters found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* === 8: gross_profit (Trading Calculation Account) === */}
              {activeDetailModal === 'gross_profit' && (() => {
                const openingStockValue = products.reduce((sum, p) => sum + ((p.openingStock || 0) * p.purchasePrice), 0);
                const purchasesTotalValue = stats.totalPurchases;
                
                // Direct ledger groupings
                const directIncLedgers = ledgers.filter(l => l.group === 'Direct Incomes');
                const directExpLedgers = ledgers.filter(l => l.group === 'Direct Expenses');

                const totalDirIncExSales = directIncLedgers.reduce((sum, l) => sum + Math.abs(Number(ledgerBalances[l.id!]) || 0), 0);
                const totalDirExpExPurch = directExpLedgers.reduce((sum, l) => sum + (Number(ledgerBalances[l.id!]) || 0), 0);

                const totalLeftDebitTrading = openingStockValue + purchasesTotalValue + totalDirExpExPurch;
                const totalRightCreditTrading = stats.totalSales + totalDirIncExSales + stats.stockValue;

                return (
                  <div className="space-y-6">
                    <div className="bg-white p-4 border border-slate-200 rounded shadow flex justify-between items-center text-xs">
                      <div>
                        <div className="text-slate-500 font-bold uppercase">Calculated Gross Margin</div>
                        <div className="text-2xl font-extrabold text-emerald-800 mt-1">{formatCurrency(stats.grossProfit)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500 font-bold uppercase">Margin Profitability %</div>
                        <div className="text-lg font-bold text-teal-700 mt-1">
                          {stats.totalSales > 0 ? `${((stats.grossProfit / stats.totalSales) * 100).toFixed(2)}%` : "0.00%"}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                      {/* Debit Column (Trading Expenses) */}
                      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-bold uppercase text-slate-800 flex justify-between">
                          <span>Debit - Cost Elements</span>
                          <span>Value</span>
                        </div>
                        <div className="p-3 space-y-2.5">
                          <div className="flex justify-between border-b pb-1">
                            <span className="text-slate-600">Opening Inventory Value</span>
                            <span className="font-semibold text-slate-850">{formatCurrency(openingStockValue)}</span>
                          </div>
                          <div className="flex justify-between border-b pb-1">
                            <span className="text-slate-600">Purchase Accounts</span>
                            <span className="font-semibold text-slate-850">{formatCurrency(purchasesTotalValue)}</span>
                          </div>
                          {directExpLedgers.map(l => (
                            <div key={l.id} className="flex justify-between border-b pb-1">
                              <span className="text-slate-600 pl-2">{l.name} (Direct Exp)</span>
                              <span className="font-semibold text-slate-800">{formatCurrency(Number(ledgerBalances[l.id!]) || 0)}</span>
                            </div>
                          ))}
                          {directExpLedgers.length === 0 && <div className="text-slate-400 italic pl-2">No other direct expenses.</div>}
                        </div>
                        <div className="bg-slate-50/70 p-2.5 border-t border-slate-200 flex justify-between font-bold text-slate-805">
                          <span>Total Costs</span>
                          <span>{formatCurrency(totalLeftDebitTrading)}</span>
                        </div>
                      </div>

                      {/* Credit Column (Trading Incomes) */}
                      <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 font-bold uppercase text-slate-800 flex justify-between">
                          <span>Credit - Revenue Elements</span>
                          <span>Value</span>
                        </div>
                        <div className="p-3 space-y-2.5">
                          <div className="flex justify-between border-b pb-1">
                            <span className="text-slate-600">Sales Accounts Turnover</span>
                            <span className="font-extrabold text-[#146e85]">{formatCurrency(stats.totalSales)}</span>
                          </div>
                          {directIncLedgers.map(l => (
                            <div key={l.id} className="flex justify-between border-b pb-1">
                              <span className="text-slate-600 pl-2">{l.name} (Direct Inc)</span>
                              <span className="font-semibold text-slate-800">{formatCurrency(Math.abs(Number(ledgerBalances[l.id!]) || 0))}</span>
                            </div>
                          ))}
                          {directIncLedgers.length === 0 && <div className="text-slate-400 italic pl-2">No other direct incomes.</div>}
                          <div className="flex justify-between border-b pb-1">
                            <span className="text-slate-600">Valued Closing Stock</span>
                            <span className="font-extrabold text-slate-800">{formatCurrency(stats.stockValue)}</span>
                          </div>
                        </div>
                        <div className="bg-slate-50/70 p-2.5 border-t border-slate-200 flex justify-between font-bold text-slate-805">
                          <span>Total Revenues</span>
                          <span>{formatCurrency(totalRightCreditTrading)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-emerald-50 text-emerald-800 p-3 border border-emerald-200 rounded text-center font-bold">
                      Revenues ({formatCurrency(totalRightCreditTrading)}) - Cost Elements ({formatCurrency(totalLeftDebitTrading)}) = {formatCurrency(stats.grossProfit)} Gross Profit
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Close Footer Button */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => { setActiveDetailModal(null); setModalSearchTerm(''); }}
                className="px-4 py-2 bg-[#146e85] hover:bg-[#105a6e] text-white rounded font-bold transition-all text-xs cursor-pointer uppercase tracking-wider"
              >
                Close Audit Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VOUCHER PRINT PREVIEW OVERLAY ==================== */}
      {selectedSummaryVoucher && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[95vh] flex flex-col my-4">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <FileText className="text-teal-700" size={18} />
                Voucher Summary &amp; Bill Invoice: {selectedSummaryVoucher.type} #{selectedSummaryVoucher.voucherNumber}
              </h3>
              <div className="flex items-center space-x-2 animate-fade-in">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer uppercase"
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
              <div className="bg-white shadow-md border border-slate-200 rounded-lg p-3 max-w-3xl mx-auto">
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
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 transition-colors text-xs cursor-pointer uppercase tracking-wider"
              >
                Close Bill Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PRODUCT AUDIT TRAIL POPUP ==================== */}
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
