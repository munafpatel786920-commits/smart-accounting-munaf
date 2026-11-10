import { doc, updateDoc, increment, Firestore, DocumentReference } from 'firebase/firestore';
import { Voucher, Ledger, Product } from '../types';
import { getGroupCategory } from '../constants';

const safeUpdateDoc = async (docRef: DocumentReference, data: any) => {
  try {
    await updateDoc(docRef, data);
  } catch (err: any) {
    if (err.code === 'not-found' || (err.message && err.message.includes('No document to update'))) {
      console.warn(`safeUpdateDoc: Document ${docRef.path} not found. Skipping.`);
    } else {
      throw err;
    }
  }
};

export const calculateLedgerBalances = (ledgers: Ledger[], vouchers: Voucher[]) => {
  const balances: Record<string, number> = {};
  
  // Initialize with opening balances according to standard Dr (+) / Cr (-) accounting convention
  ledgers.forEach(l => {
    const groupCat = getGroupCategory(l.group);
    let opening = Number(l.openingBalance) || 0;
    if (l.balanceType === 'Cr' || (l.balanceType !== 'Dr' && (groupCat === 'Liabilities' || groupCat === 'Income'))) {
      opening = -Math.abs(opening);
    } else {
      opening = Math.abs(opening);
    }
    balances[l.id!] = opening;
  });

  // Apply vouchers
  vouchers.forEach(v => {
    if (v.status === 'Optional' || v.status === 'Cancelled') return;
    const total = Number(v.totalAmount) || Number(v.amount) || 0;
    
    if (v.mode === 'Double Entry') {
      if (v.items) {
        v.items.forEach(item => {
          if (item.ledgerId && balances[item.ledgerId] !== undefined) {
            let balanceChange = item.amount;
            if (item.type === 'Cr') {
              balanceChange = -item.amount;
            }
            balances[item.ledgerId] += balanceChange;
          }
        });
      }
    } else if (v.mode === 'Normal') {
      if (v.ledgerId && balances[v.ledgerId] !== undefined) {
        let balanceChange = 0;
        if (v.type === 'Payment') {
          balanceChange = -total;
        } else if (v.type === 'Receipt' || v.type === 'Contra') {
          balanceChange = total;
        }
        balances[v.ledgerId] += balanceChange;
      }

      if (v.items) {
        v.items.forEach(item => {
          if (item.ledgerId && balances[item.ledgerId] !== undefined) {
            let itemBalanceChange = 0;
            if (v.type === 'Payment') {
              itemBalanceChange = item.amount;
            } else if (v.type === 'Receipt' || v.type === 'Contra') {
              itemBalanceChange = -item.amount;
            } else if (v.type === 'Journal') {
              itemBalanceChange = item.amount;
            }
            balances[item.ledgerId] += itemBalanceChange;
          }
        });
      }

      // Fallback for old single-ledger Normal mode
      if (!v.items || v.items.length === 0) {
        if (v.debitLedgerId && balances[v.debitLedgerId] !== undefined) {
          balances[v.debitLedgerId] += total;
        }
        if (v.creditLedgerId && balances[v.creditLedgerId] !== undefined) {
          balances[v.creditLedgerId] -= total;
        }
      }
    } else {
      // Invoice Mode
      if (v.ledgerId && balances[v.ledgerId] !== undefined) {
        let balanceChange = 0;
        if (v.type === 'Sales' || v.type === 'Debit Note' || v.type === 'Payment') {
          balanceChange = total;
        } else if (v.type === 'Purchase' || v.type === 'Credit Note' || v.type === 'Receipt') {
          balanceChange = -total;
        }
        balances[v.ledgerId] += balanceChange;
      }

      if (v.salesPurchaseLedgerId && balances[v.salesPurchaseLedgerId] !== undefined) {
        const amountToUpdate = (v.type === 'Payment' || v.type === 'Receipt') 
          ? total 
          : ((v.amount !== undefined && v.amount !== null && !isNaN(Number(v.amount)) && Number(v.amount) > 0) ? Number(v.amount) : total);
          
        let balanceChange = 0;
        if (v.type === 'Sales' || v.type === 'Debit Note' || v.type === 'Payment') {
          balanceChange = amountToUpdate;
        } else if (v.type === 'Purchase' || v.type === 'Credit Note' || v.type === 'Receipt') {
          balanceChange = -amountToUpdate;
        }
        balances[v.salesPurchaseLedgerId] -= balanceChange;
      }

      // Handle GST in Invoice Mode
      const isSalesSide = v.type === 'Sales' || v.type === 'Debit Note';
      const isPurchaseSide = v.type === 'Purchase' || v.type === 'Credit Note';
      if (isSalesSide || isPurchaseSide) {
        const cgst = Number(v.cgst) || 0;
        const sgst = Number(v.sgst) || 0;
        const igst = Number(v.igst) || 0;

        if (cgst > 0) {
          const cgstLedger = ledgers.find(l => 
            (l.companyId === v.companyId || !v.companyId) && 
            (l.id === `default_cgst_${v.companyId}` || (l.name || '').toLowerCase() === 'cgst' || (l.name || '').toLowerCase().includes('cgst'))
          );
          if (cgstLedger && balances[cgstLedger.id!] !== undefined) {
            balances[cgstLedger.id!] += (isSalesSide ? -cgst : cgst);
          }
        }

        if (sgst > 0) {
          const sgstLedger = ledgers.find(l => 
            (l.companyId === v.companyId || !v.companyId) && 
            (l.id === `default_sgst_${v.companyId}` || (l.name || '').toLowerCase() === 'sgst' || (l.name || '').toLowerCase().includes('sgst'))
          );
          if (sgstLedger && balances[sgstLedger.id!] !== undefined) {
            balances[sgstLedger.id!] += (isSalesSide ? -sgst : sgst);
          }
        }

        if (igst > 0) {
          const igstLedger = ledgers.find(l => 
            (l.companyId === v.companyId || !v.companyId) && 
            (l.id === `default_igst_${v.companyId}` || (l.name || '').toLowerCase() === 'igst' || (l.name || '').toLowerCase().includes('igst'))
          );
          if (igstLedger && balances[igstLedger.id!] !== undefined) {
            balances[igstLedger.id!] += (isSalesSide ? -igst : igst);
          }
        }
      }

      // Handle Additional Charges in Invoice Mode
      if (v.additionalCharges && Array.isArray(v.additionalCharges)) {
        v.additionalCharges.forEach(charge => {
          if (charge.ledgerId && balances[charge.ledgerId] !== undefined) {
            const chargeAmt = Number(charge.amount) || 0;
            balances[charge.ledgerId] += (isSalesSide ? -chargeAmt : chargeAmt);
          }
        });
      }
    }
  });

  return balances;
};

export const calculateGodownStock = (productId: string, godownId: string, vouchers: Voucher[]) => {
  let stock = 0;
  if (!productId || !godownId) return 0;

  vouchers.forEach(v => {
    if (v.status === 'Optional' || v.status === 'Cancelled') return;
    
    const type = (v.type || '').trim();
    if (type === 'Manufacturing Journal') {
      if (v.manufacturedProductId === productId) {
        const manufacturedQty = Number(v.manufacturedQuantity) || 0;
        const destGodown = v.manufacturedGodownId || 'Main Location';
        if (destGodown === godownId) stock += manufacturedQty;
      }
      if (v.items) {
        v.items.forEach(item => {
          if (item.productId === productId) {
            const srcGodown = item.godownId || 'Main Location';
            const qty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : (Number(item.quantity) || 0);
            if (srcGodown === godownId) stock -= qty;
          }
        });
      }
      return;
    }

    if (v.mode === 'Invoice' && v.items) {
      v.items.forEach(item => {
        const canSkip = ['Sales', 'Purchase'].includes(type);
        if (item.productId === productId && !(v.skipStockUpdate === true && canSkip)) {
          const srcGodown = item.godownId || 'Main Location';
          
          if (type === 'Stock Journal') {
             const qty = item.actualQuantity !== undefined ? item.actualQuantity : (item.quantity || 0);
             if (srcGodown === godownId) stock -= qty;
             if (item.destinationGodownId === godownId) stock += qty;
          } else {
             if (srcGodown === godownId) {
               const qty = item.actualQuantity !== undefined ? item.actualQuantity : (item.quantity || 0);
               if (type === 'Sales' || type === 'Debit Note' || type === 'Delivery Note' || type === 'Rejection Out') {
                 stock -= qty;
               } else if (type === 'Purchase' || type === 'Credit Note' || type === 'Receipt Note' || type === 'Rejection In') {
                 stock += qty;
               }
             }
          }
        }
      });
    }
  });

  return stock;
};

export const calculateProductStocks = (products: Product[], vouchers: Voucher[]) => {
  const stocks: Record<string, number> = {};
  
  // Initialize with opening stocks
  products.forEach(p => {
    stocks[p.id!] = Number(p.openingStock) || 0;
  });

  // Apply vouchers
  vouchers.forEach(v => {
    if (v.status === 'Optional' || v.status === 'Cancelled') return;
    
    const type = (v.type || '').trim();
    if (type === 'Manufacturing Journal') {
      if (v.manufacturedProductId && stocks[v.manufacturedProductId] !== undefined) {
        const manufacturedQty = Number(v.manufacturedQuantity) || 0;
        stocks[v.manufacturedProductId] += manufacturedQty;
      }
      if (v.items) {
        v.items.forEach(item => {
          if (item.productId && stocks[item.productId] !== undefined) {
            const qty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : (Number(item.quantity) || 0);
            stocks[item.productId] -= qty;
          }
        });
      }
      return;
    }

    if (v.mode === 'Invoice' && v.items) {
      v.items.forEach(item => {
        const canSkip = ['Sales', 'Purchase'].includes(type);
        if (item.productId && stocks[item.productId] !== undefined && !(v.skipStockUpdate === true && canSkip)) {
          const qty = item.actualQuantity !== undefined ? item.actualQuantity : (item.quantity || 0);
          let stockChange = 0;
          if (type === 'Sales' || type === 'Debit Note' || type === 'Delivery Note' || type === 'Rejection Out') {
            stockChange = -qty;
          } else if (type === 'Purchase' || type === 'Credit Note' || type === 'Receipt Note' || type === 'Rejection In') {
            stockChange = qty;
          }
          stocks[item.productId] += stockChange;
        }
      });
    }
  });

  return stocks;
};

export const updateBalances = async (db: Firestore, voucher: Partial<Voucher>, multiplier: number = 1) => {
  if (voucher.status === 'Optional' || voucher.status === 'Cancelled') {
    console.log(`Balance update skipped for voucher ${voucher.id} with status ${voucher.status}`);
    return;
  }
  const total = Number(voucher.totalAmount) || 0;
  if (isNaN(total)) {
    console.warn('updateBalances: totalAmount is NaN, using 0');
  }
  
  console.log(`updateBalances: multiplier=${multiplier}, total=${total}, voucherId=${voucher.id}`);

  try {
    // Update Ledger Balance for Double Entry / Single Entry
    if (voucher.mode === 'Double Entry') {
      if (voucher.items) {
        for (const item of voucher.items) {
          if (item.ledgerId && item.ledgerId.trim() !== '') {
            const ledgerRef = doc(db, 'ledgers', item.ledgerId);
            let balanceChange = item.amount;
            if (item.type === 'Cr') {
              balanceChange = -item.amount;
            }
            await safeUpdateDoc(ledgerRef, { currentBalance: increment(balanceChange * multiplier) });
          }
        }
      }
    } else if (voucher.mode === 'Normal') {
      // Single Entry Style: Account at top, multiple particulars in items
      if (voucher.ledgerId && voucher.ledgerId.trim() !== '') {
        const ledgerRef = doc(db, 'ledgers', voucher.ledgerId);
        let balanceChange = 0;
        if (voucher.type === 'Payment') {
          balanceChange = -total;
        } else if (voucher.type === 'Receipt' || voucher.type === 'Contra') {
          balanceChange = total;
        }
        await safeUpdateDoc(ledgerRef, { currentBalance: increment(balanceChange * multiplier) });
      }

      // Update Particulars (items)
      if (voucher.items) {
        for (const item of voucher.items) {
          if (item.ledgerId && item.ledgerId.trim() !== '') {
            const itemLedgerRef = doc(db, 'ledgers', item.ledgerId);
            let itemBalanceChange = 0;
            if (voucher.type === 'Payment') {
              itemBalanceChange = item.amount;
            } else if (voucher.type === 'Receipt' || voucher.type === 'Contra') {
              itemBalanceChange = -item.amount;
            } else if (voucher.type === 'Journal') {
              itemBalanceChange = item.amount; // Default to debit
            }
            await safeUpdateDoc(itemLedgerRef, { currentBalance: increment(itemBalanceChange * multiplier) });
          }
        }
      }

      // Fallback for old single-ledger Normal mode
      if (!voucher.items || voucher.items.length === 0) {
        if (voucher.debitLedgerId && voucher.debitLedgerId.trim() !== '') {
          const debitRef = doc(db, 'ledgers', voucher.debitLedgerId);
          await safeUpdateDoc(debitRef, { currentBalance: increment(total * multiplier) });
        }
        if (voucher.creditLedgerId && voucher.creditLedgerId.trim() !== '') {
          const creditRef = doc(db, 'ledgers', voucher.creditLedgerId);
          await safeUpdateDoc(creditRef, { currentBalance: increment(-total * multiplier) });
        }
      }
    } else {
      // Invoice Mode: Party is primary ledger
      if (voucher.ledgerId && voucher.ledgerId.trim() !== '') {
        const ledgerRef = doc(db, 'ledgers', voucher.ledgerId);
        let balanceChange = 0;
        if (voucher.type === 'Sales' || voucher.type === 'Debit Note' || voucher.type === 'Payment') {
          balanceChange = total;
        } else if (voucher.type === 'Purchase' || voucher.type === 'Credit Note' || voucher.type === 'Receipt') {
          balanceChange = -total;
        }
        
        await safeUpdateDoc(ledgerRef, {
          currentBalance: increment(balanceChange * multiplier)
        });
      }

      // Update Sales/Purchase Ledger
      if (voucher.salesPurchaseLedgerId && voucher.salesPurchaseLedgerId.trim() !== '') {
        const spLedgerRef = doc(db, 'ledgers', voucher.salesPurchaseLedgerId);
        const amountToUpdate = (voucher.type === 'Payment' || voucher.type === 'Receipt') 
          ? total 
          : (Number(voucher.amount) || 0);
          
        let balanceChange = 0;
        if (voucher.type === 'Sales' || voucher.type === 'Debit Note' || voucher.type === 'Payment') {
          balanceChange = amountToUpdate;
        } else if (voucher.type === 'Purchase' || voucher.type === 'Credit Note' || voucher.type === 'Receipt') {
          balanceChange = -amountToUpdate;
        }
        
        await safeUpdateDoc(spLedgerRef, {
          currentBalance: increment(-balanceChange * multiplier)
        });
      }

      // Update Additional Charges Ledgers in Invoice mode
      if (voucher.additionalCharges && Array.isArray(voucher.additionalCharges)) {
        for (const charge of voucher.additionalCharges) {
          if (charge.ledgerId && charge.ledgerId.trim() !== '') {
            const chargeRef = doc(db, 'ledgers', charge.ledgerId);
            const amt = Number(charge.amount) || 0;
            const chargeChange = (voucher.type === 'Sales' || voucher.type === 'Debit Note') ? -amt : amt;
            await safeUpdateDoc(chargeRef, {
              currentBalance: increment(chargeChange * multiplier)
            });
          }
        }
      }

      // Update GST Ledgers if present for active company
      if (voucher.companyId) {
        const isSalesSide = voucher.type === 'Sales' || voucher.type === 'Debit Note';
        const isPurchaseSide = voucher.type === 'Purchase' || voucher.type === 'Credit Note';
        if (isSalesSide || isPurchaseSide) {
          const cgst = Number(voucher.cgst) || 0;
          const sgst = Number(voucher.sgst) || 0;
          const igst = Number(voucher.igst) || 0;

          if (cgst > 0) {
            const cgstRef = doc(db, 'ledgers', `default_cgst_${voucher.companyId}`);
            const cgstChange = isSalesSide ? -cgst : cgst;
            await safeUpdateDoc(cgstRef, { currentBalance: increment(cgstChange * multiplier) });
          }
          if (sgst > 0) {
            const sgstRef = doc(db, 'ledgers', `default_sgst_${voucher.companyId}`);
            const sgstChange = isSalesSide ? -sgst : sgst;
            await safeUpdateDoc(sgstRef, { currentBalance: increment(sgstChange * multiplier) });
          }
          if (igst > 0) {
            const igstRef = doc(db, 'ledgers', `default_igst_${voucher.companyId}`);
            const igstChange = isSalesSide ? -igst : igst;
            await safeUpdateDoc(igstRef, { currentBalance: increment(igstChange * multiplier) });
          }
        }
      }

      // Update Product Stocks if Invoice mode
      const type = (voucher.type || '').trim();
      const canSkip = ['Sales', 'Purchase'].includes(type);

      if (type === 'Manufacturing Journal') {
        // 1. Finished Product Produced
        if (voucher.manufacturedProductId && voucher.manufacturedProductId.trim() !== '') {
          const productRef = doc(db, 'products', voucher.manufacturedProductId);
          const manufacturedQty = Number(voucher.manufacturedQuantity) || 0;
          const updateData: any = {
            stockQuantity: increment(manufacturedQty * multiplier)
          };
          if (multiplier === 1 && manufacturedQty > 0 && voucher.totalAmount) {
            updateData.purchasePrice = Number(voucher.totalAmount) / manufacturedQty;
          }
          await safeUpdateDoc(productRef, updateData);
        }
        // 2. Components Consumed
        if (voucher.items) {
          for (const item of voucher.items) {
            if (item.productId && item.productId.trim() !== '') {
              const productRef = doc(db, 'products', item.productId);
              const qty = item.actualQuantity !== undefined ? Number(item.actualQuantity) : (Number(item.quantity) || 0);
              await safeUpdateDoc(productRef, {
                stockQuantity: increment(-qty * multiplier)
              });
            }
          }
        }
        // 3. Additional Charges Ledgers (Credit the expense linked to manufacturing)
        if (voucher.additionalCharges) {
          for (const charge of voucher.additionalCharges) {
            if (charge.ledgerId && charge.ledgerId.trim() !== '') {
              const expenseLedgerRef = doc(db, 'ledgers', charge.ledgerId);
              // We credit the expense ledger because its value is transferred to inventory
              await safeUpdateDoc(expenseLedgerRef, {
                currentBalance: increment(-(Number(charge.amount) || 0) * multiplier)
              });
            }
          }
        }
      } else if (voucher.mode === 'Invoice' && voucher.items && !(voucher.skipStockUpdate === true && canSkip)) {
        for (const item of voucher.items) {
          if (item.productId && item.productId.trim() !== '') {
            const productRef = doc(db, 'products', item.productId);
            const qty = item.actualQuantity !== undefined ? item.actualQuantity : (item.quantity || 0);
            let stockChange = 0;
            if (type === 'Sales' || type === 'Debit Note' || type === 'Delivery Note' || type === 'Rejection Out') {
              stockChange = -qty;
            } else if (type === 'Purchase' || type === 'Credit Note' || type === 'Receipt Note' || type === 'Rejection In') {
              stockChange = qty;
            }
            
            const updateData: any = {
              stockQuantity: increment(stockChange * multiplier)
            };
            // Update purchase price on Purchase or Receipt Note to keep valuation accurate
            if (multiplier === 1 && (type === 'Purchase' || type === 'Receipt Note') && qty > 0 && item.rate) {
              updateData.purchasePrice = Number(item.rate);
            }
            
            await safeUpdateDoc(productRef, updateData);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error updating balances:', error);
    throw error;
  }
};
