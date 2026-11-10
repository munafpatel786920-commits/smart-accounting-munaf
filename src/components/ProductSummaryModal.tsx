import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Product, Voucher, Godown } from '../types';
import { formatCurrency } from '../lib/utils';
import { X, Search, Calendar, Package, ArrowUpRight, ArrowDownLeft, Layers, Landmark, RefreshCw, Eye, FileSpreadsheet } from 'lucide-react';
import { calculateGodownStock } from '../lib/voucherUtils';
import * as XLSX from 'xlsx';

interface ProductSummaryModalProps {
  product: Product;
  companyId: string;
  onClose: () => void;
}

export default function ProductSummaryModal({ product, companyId, onClose }: ProductSummaryModalProps) {
  const { t } = useTranslation();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  
  // Fetch vouchers, ledgers and godowns for calculations
  useEffect(() => {
    if (!companyId) return;

    setLoading(true);

    // 1. Vouchers Snapshot
    const vouchersQuery = query(
      collection(db, 'vouchers'),
      where('companyId', '==', companyId)
    );
    const unsubVouchers = onSnapshot(vouchersQuery, (snapshot) => {
      const vList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher));
      // Sort by date descending
      vList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setVouchers(vList);
    }, (err) => {
      console.error("Error loading vouchers in ProductSummary:", err);
    });

    // 2. Ledgers Snapshot
    const ledgersQuery = query(
      collection(db, 'ledgers'),
      where('companyId', '==', companyId)
    );
    const unsubLedgers = onSnapshot(ledgersQuery, (snapshot) => {
      setLedgers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Error loading ledgers in ProductSummary:", err);
    });

    // 3. Godowns Snapshot
    const godownsQuery = query(
      collection(db, 'godowns'),
      where('companyId', '==', companyId)
    );
    const unsubGodowns = onSnapshot(godownsQuery, (snapshot) => {
      setGodowns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Godown)));
      setLoading(false);
    }, (err) => {
      console.error("Error loading godowns in ProductSummary:", err);
      setLoading(false);
    });

    return () => {
      unsubVouchers();
      unsubLedgers();
      unsubGodowns();
    };
  }, [companyId]);

  // Calculations for transactions related to this product
  const productTransactions = React.useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      voucherNumber: string;
      type: Voucher['type'];
      partyName: string;
      flowType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';
      godownName: string;
      destinationGodownName?: string;
      quantity: number;
      rate: number;
      amount: number;
      rawVoucher: Voucher;
    }> = [];

    vouchers.forEach(v => {
      if (v.status === 'Optional' || v.status === 'Cancelled') return;

      const vType = v.type || '';
      
      // Determine overall primary ledger party name
      let partyId = v.ledgerId || v.debitLedgerId || v.creditLedgerId || '';
      let partyName = ledgers.find(l => l.id === partyId)?.name || 'Cash/Bank / Auto';

      // Check Manufacturing Journal manufactured output
      if (vType === 'Manufacturing Journal' && v.manufacturedProductId === product.id) {
        const manufacturedQty = Number(v.manufacturedQuantity) || 0;
        const godownName = v.manufacturedGodownId === 'Main Location' || !v.manufacturedGodownId
          ? 'Main Location'
          : godowns.find(g => g.id === v.manufacturedGodownId)?.name || v.manufacturedGodownId;

        list.push({
          id: v.id || '',
          date: v.date,
          voucherNumber: v.voucherNumber,
          type: vType as Voucher['type'],
          partyName: 'Manufactured Output',
          flowType: 'IN',
          godownName,
          quantity: manufacturedQty,
          rate: product.purchasePrice || 0,
          amount: manufacturedQty * (product.purchasePrice || 0),
          rawVoucher: v
        });
      }

      // Check standard items
      if (v.items) {
        v.items.forEach(item => {
          if (item.productId === product.id) {
            const qty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : (Number(item.quantity) || 0);
            const rate = Number(item.rate) || 0;
            const amount = Number(item.amount) || (qty * rate);

            const srcGodownId = item.godownId || 'Main Location';
            const godownName = srcGodownId === 'Main Location'
              ? 'Main Location'
              : godowns.find(g => g.id === srcGodownId)?.name || srcGodownId;

            let flowType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' = 'ADJUSTMENT';

            if (vType === 'Sales' || vType === 'Debit Note' || vType === 'Delivery Note' || vType === 'Rejection Out') {
              flowType = 'OUT';
            } else if (vType === 'Purchase' || vType === 'Credit Note' || vType === 'Receipt Note' || vType === 'Rejection In') {
              flowType = 'IN';
            } else if (vType === 'Stock Journal') {
              flowType = 'TRANSFER';
            } else if (vType === 'Manufacturing Journal') {
              // As a consumed material component
              flowType = 'OUT';
              partyName = 'Manufacturing Raw Material';
            }

            let destinationGodownName = undefined;
            if (item.destinationGodownId) {
              destinationGodownName = item.destinationGodownId === 'Main Location'
                ? 'Main Location'
                : godowns.find(g => g.id === item.destinationGodownId)?.name || item.destinationGodownId;
            }

            list.push({
              id: v.id || '',
              date: v.date,
              voucherNumber: v.voucherNumber,
              type: vType as Voucher['type'],
              partyName,
              flowType,
              godownName,
              destinationGodownName,
              quantity: qty,
              rate,
              amount,
              rawVoucher: v
            });
          }
        });
      }
    });

    return list;
  }, [vouchers, ledgers, godowns, product.id, product.purchasePrice]);

  // Aggregate transaction stats
  const aggregateStats = React.useMemo(() => {
    let inwardQty = 0;
    let inwardVal = 0;
    let outwardQty = 0;
    let outwardVal = 0;

    productTransactions.forEach(tx => {
      if (tx.flowType === 'IN') {
        inwardQty += tx.quantity;
        inwardVal += tx.amount;
      } else if (tx.flowType === 'OUT') {
        outwardQty += tx.quantity;
        outwardVal += tx.amount;
      } else if (tx.flowType === 'TRANSFER') {
        // Transfers don't change net company totals, but we could track them
      }
    });

    const openingStock = product.openingStock || 0;
    const openingValue = openingStock * (product.purchasePrice || 0);

    const closingStock = (product.stockQuantity !== undefined) ? product.stockQuantity : (openingStock + inwardQty - outwardQty);
    const closingValue = closingStock * (product.purchasePrice || 0);

    return {
      openingStock,
      openingValue,
      inwardQty,
      inwardVal,
      outwardQty,
      outwardVal,
      closingStock,
      closingValue
    };
  }, [productTransactions, product]);

  // Godown Breakdown calculations
  const godownStockBreakdown = React.useMemo(() => {
    // Collect all godowns plus Main Location
    const uniqueGodowns = ['Main Location', ...godowns.map(g => g.name || g.id || '')];
    const uniqueDeduped = Array.from(new Set(uniqueGodowns));

    return uniqueDeduped.map(gName => {
      // Find godown id or default to string name
      const gObj = godowns.find(gd => gd.name === gName || gd.id === gName);
      const stock = calculateGodownStock(product.id || '', gObj?.id || gName, vouchers);
      return {
        name: gName,
        stock
      };
    }).filter(item => item.stock !== 0 || item.name === 'Main Location');
  }, [godowns, vouchers, product.id]);

  // Filter Transactions list based on filters
  const filteredTransactions = React.useMemo(() => {
    return productTransactions.filter(tx => {
      // Search text match
      const matchesSearch = 
        tx.voucherNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.partyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.type?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Voucher type match
      const matchesType = voucherTypeFilter === 'ALL' || tx.type === voucherTypeFilter;

      // Date range match
      const matchesFromDate = !dateFrom || new Date(tx.date) >= new Date(dateFrom);
      const matchesToDate = !dateTo || new Date(tx.date) <= new Date(dateTo);

      return matchesSearch && matchesType && matchesFromDate && matchesToDate;
    });
  }, [productTransactions, searchTerm, voucherTypeFilter, dateFrom, dateTo]);

  // Export to Excel helper
  const handleExportExcel = () => {
    const dataToExport = filteredTransactions.map(tx => ({
      'Date': tx.date,
      'Voucher Type': tx.type,
      'Voucher No': tx.voucherNumber,
      'Party Name / Particulars': tx.partyName,
      'Transaction Flow': tx.flowType,
      'Godown Location': tx.godownName + (tx.destinationGodownName ? ` ➔ ${tx.destinationGodownName}` : ''),
      'Quantity': tx.quantity,
      'Rate': tx.rate,
      'Amount': tx.amount
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Ledger");
    XLSX.writeFile(wb, `${product.name.replace(/\s+/g, '_')}_Summary.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#f0f4f2] w-full max-w-5xl rounded-none border-2 border-[#003c46] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden modal-content">
        
        {/* Modal Header */}
        <div className="bg-[#004d5a] text-[#ffcb2b] px-6 py-4 border-b-2 border-[#003c46] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="text-[#ffcb2b] w-6 h-6 animate-pulse" />
            <div>
              <h2 className="text-base font-bold font-mono tracking-wide">{product.name}</h2>
              <p className="text-[10px] uppercase tracking-wider text-slate-300 font-sans mt-0.5">
                {product.hsnCode ? `HSN Code: ${product.hsnCode}` : 'No HSN Code'} | Unit: {product.unit} | GST Rate: {product.gstRate}%
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 px-2.5 text-slate-300 hover:text-[#ffcb2b] bg-black/10 hover:bg-black/20 font-bold font-mono text-sm border border-slate-700/50 transition-all flex items-center gap-1"
          >
            <X size={16} /> [ESC]
          </button>
        </div>

        {/* Modal Content container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Bento-style Row: Stats summary & Godown summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Left/Middle: Flow Totals Bento (2/3 width on desktop) */}
            <div className="md:col-span-2 bg-white border border-[#003c46]/35 p-4 rounded-none shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4">
              
              {/* Opening Stock Card */}
              <div className="border border-[#003c46]/10 p-3 bg-slate-50 font-mono">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Opening Stock</p>
                <p className="text-sm font-bold text-[#002f3c] mt-1.5">
                  {(aggregateStats.openingStock).toFixed(product.decimalPlaces || 0)} <span className="text-xs text-slate-500">{product.unit}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-1 font-sans">
                  Valued: <span className="font-semibold text-slate-700">{formatCurrency(aggregateStats.openingValue)}</span>
                </p>
              </div>

              {/* Inwards (Total Added) */}
              <div className="border border-[#003c46]/10 p-3 bg-emerald-50/50 font-mono">
                <div className="flex items-center gap-1">
                  <ArrowDownLeft size={12} className="text-emerald-700" />
                  <p className="text-[10px] uppercase text-emerald-800 font-bold">Total Inwards</p>
                </div>
                <p className="text-sm font-bold text-emerald-800 mt-1.5">
                  +{(aggregateStats.inwardQty).toFixed(product.decimalPlaces || 0)} <span className="text-xs text-slate-500">{product.unit}</span>
                </p>
                <p className="text-[11px] text-emerald-700 mt-1 font-sans font-medium">
                  Valued: <span>{formatCurrency(aggregateStats.inwardVal)}</span>
                </p>
              </div>

              {/* Outwards (Total Dispatched) */}
              <div className="border border-[#003c46]/10 p-3 bg-rose-50/50 font-mono">
                <div className="flex items-center gap-1">
                  <ArrowUpRight size={12} className="text-rose-700" />
                  <p className="text-[10px] uppercase text-rose-800 font-bold">Total Outwards</p>
                </div>
                <p className="text-sm font-bold text-rose-800 mt-1.5">
                  -{(aggregateStats.outwardQty).toFixed(product.decimalPlaces || 0)} <span className="text-xs text-slate-500">{product.unit}</span>
                </p>
                <p className="text-[11px] text-rose-700 mt-1 font-sans font-medium">
                  Valued: <span>{formatCurrency(aggregateStats.outwardVal)}</span>
                </p>
              </div>

              {/* Closing Stock Card */}
              <div className="border-2 border-teal-600/40 p-3 bg-teal-50/30 font-mono">
                <p className="text-[10px] uppercase text-teal-800 font-bold">Closing Stock</p>
                <p className="text-sm font-bold text-teal-900 mt-1.5">
                  {(aggregateStats.closingStock).toFixed(product.decimalPlaces || 0)} <span className="text-xs text-slate-500">{product.unit}</span>
                </p>
                <p className="text-[11px] text-teal-850 mt-1 font-sans font-bold">
                  Value @ Cost: <span className="text-teal-900">{formatCurrency(aggregateStats.closingValue)}</span>
                </p>
              </div>

            </div>

            {/* Right: Godown stocking breakdown */}
            <div className="bg-white border border-[#003c46]/35 p-4 rounded-none shadow-sm flex flex-col font-mono text-xs">
              <div className="flex items-center gap-1.5 border-b border-gray-100 pb-2 mb-2 font-bold text-[#002f3c]">
                <Layers size={14} className="text-teal-700" />
                <span>Godown Stock Status</span>
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[140px] space-y-1.5 pr-1 divide-y divide-gray-50">
                {godownStockBreakdown.map((Break, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 text-xs first:pt-0">
                    <span className="text-gray-600 font-medium">{Break.name}</span>
                    <span className={`font-bold font-mono ${Break.stock < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                      {Break.stock.toFixed(product.decimalPlaces || 0)} {product.unit}
                    </span>
                  </div>
                ))}
                {godownStockBreakdown.length === 0 && (
                  <p className="text-center text-gray-400 py-4 italic text-xs">No active godown stocks</p>
                )}
              </div>
            </div>

          </div>

          {/* Table Filters & Toolbar */}
          <div className="bg-white border border-[#003c46]/35 p-3 rounded-none shadow-sm space-y-2.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#002f3c]">
                <Landmark size={14} className="text-amber-600" />
                <span>PRODUCT TRANSACTION LEDGER / ITEM HISTORY</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="px-2.5 py-1 text-xs bg-emerald-700 text-white font-mono hover:bg-emerald-800 transition-colors flex items-center gap-1.5 rounded-none"
                >
                  <FileSpreadsheet size={13} /> Export Excel
                </button>
                <div className="text-slate-400 text-[11px] font-mono">
                  Showing {filteredTransactions.length} of {productTransactions.length} entries
                </div>
              </div>
            </div>

            {/* Filters layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              
              {/* Search */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Voucher No, Party name..."
                  className="w-full pl-8 pr-2 py-1.5 bg-[#fefdf5] border border-slate-300 rounded-none text-xs font-mono text-[#002f3c]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Type select */}
              <div>
                <select
                  className="w-full px-2.5 py-1.5 bg-[#fefdf5] border border-slate-300 rounded-none text-xs font-mono text-[#003c46]"
                  value={voucherTypeFilter}
                  onChange={(e) => setVoucherTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Voucher Types</option>
                  <option value="Sales">Sales Vouchers</option>
                  <option value="Purchase">Purchase Vouchers</option>
                  <option value="Credit Note">Credit Note / Sales Return</option>
                  <option value="Debit Note">Debit Note / Purchase Return</option>
                  <option value="Stock Journal">Stock Journal</option>
                  <option value="Delivery Note">Delivery Note</option>
                  <option value="Receipt Note">Receipt Note</option>
                  <option value="Manufacturing Journal">Manufacturing Journal</option>
                </select>
              </div>

              {/* Date From */}
              <div className="relative flex items-center">
                <span className="absolute left-2 text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">From</span>
                <input
                  type="date"
                  className="w-full pl-11 pr-2 py-1.2 bg-[#fefdf5] border border-slate-300 rounded-none text-xs font-mono"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              {/* Date To */}
              <div className="relative flex items-center">
                <span className="absolute left-2 text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">To</span>
                <input
                  type="date"
                  className="w-full pl-9 pr-2 py-1.2 bg-[#fefdf5] border border-slate-300 rounded-none text-xs font-mono"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Reset filter */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setVoucherTypeFilter('ALL');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="w-full bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 py-1.5 text-xs font-mono flex items-center justify-center gap-1 transition-all"
                >
                  <RefreshCw size={12} /> Reset Filters
                </button>
              </div>

            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white border border-[#003c46]/35 rounded-none shadow-sm overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono border-collapse text-xs">
                <thead className="bg-[#004d5a] text-[#ffcb2b] font-bold border-b border-[#003c46]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Voc Type</th>
                    <th className="py-2.5 px-3">Doc No.</th>
                    <th className="py-2.5 px-3">Account / Party</th>
                    <th className="py-2.5 px-3 text-center">Godown</th>
                    <th className="py-2.5 px-3 text-right">Inwards Qty</th>
                    <th className="py-2.5 px-3 text-right">Outwards Qty</th>
                    <th className="py-2.5 px-3 text-right">Rate</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredTransactions.map((tx, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-[#ffffcc]/50 transition-colors border-b border-gray-50 text-slate-800"
                    >
                      {/* Date */}
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600 font-medium">
                        {tx.date}
                      </td>

                      {/* Voc Type */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 font-bold uppercase text-[9px] rounded-none ${
                          tx.flowType === 'IN' 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/50' 
                            : tx.flowType === 'OUT'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200/50'
                            : 'bg-blue-50 text-blue-800 border border-blue-200/50'
                        }`}>
                          {tx.type}
                        </span>
                      </td>

                      {/* Number */}
                      <td className="py-2 px-3 whitespace-nowrap font-bold text-slate-700">
                        {tx.voucherNumber}
                      </td>

                      {/* Party Name */}
                      <td className="py-2 px-3 max-w-[180px] break-words text-slate-900 font-semibold">
                        {tx.partyName}
                      </td>

                      {/* Godown */}
                      <td className="py-2 px-3 text-gray-600 text-center text-[10px]">
                        {tx.destinationGodownName ? (
                          <div className="flex items-center justify-center gap-1 text-slate-500">
                            <span>{tx.godownName}</span>
                            <span className="text-teal-700 font-bold">&#10142;</span>
                            <span className="font-bold text-teal-800">{tx.destinationGodownName}</span>
                          </div>
                        ) : (
                          <span>{tx.godownName}</span>
                        )}
                      </td>

                      {/* In Qty */}
                      <td className="py-2 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">
                        {tx.flowType === 'IN' ? `${tx.quantity.toFixed(product.decimalPlaces || 0)} ${product.unit}` : ''}
                      </td>

                      {/* Out Qty */}
                      <td className="py-2 px-3 text-right font-bold text-rose-700 whitespace-nowrap">
                        {tx.flowType === 'OUT' ? `${tx.quantity.toFixed(product.decimalPlaces || 0)} ${product.unit}` : ''}
                      </td>

                      {/* Rate */}
                      <td className="py-2 px-3 text-right text-slate-600 whitespace-nowrap">
                        {formatCurrency(tx.rate)}
                      </td>

                      {/* Amount */}
                      <td className="py-2 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}

                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400 italic font-mono text-xs">
                        No transactions found for this product matches selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>

                {filteredTransactions.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-[#003c46]/20 font-bold text-slate-900 font-mono text-xs">
                    <tr>
                      <td colSpan={5} className="py-2 px-3">Filtered Totals</td>
                      <td className="py-2 px-3 text-right text-emerald-800">
                        {filteredTransactions
                          .filter(tx => tx.flowType === 'IN')
                          .reduce((sum, tx) => sum + tx.quantity, 0)
                          .toFixed(product.decimalPlaces || 0)} {product.unit}
                      </td>
                      <td className="py-2 px-3 text-right text-rose-800">
                        {filteredTransactions
                          .filter(tx => tx.flowType === 'OUT')
                          .reduce((sum, tx) => sum + tx.quantity, 0)
                          .toFixed(product.decimalPlaces || 0)} {product.unit}
                      </td>
                      <td className="py-2 px-3"></td>
                      <td className="py-2 px-3 text-right text-teal-800">
                        {formatCurrency(
                          filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 text-slate-500 font-sans text-[11px] flex items-center justify-between">
          <span>Tip: Filter by Voucher type or Date to narrow audit records. Use ESC key to close.</span>
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-1.5 bg-[#004d5a] text-[#ffcb2b] hover:bg-[#003c46] border border-[#003c46] font-bold font-mono text-xs transition-colors rounded-none"
          >
            Close Summary
          </button>
        </div>

      </div>
    </div>
  );
}
