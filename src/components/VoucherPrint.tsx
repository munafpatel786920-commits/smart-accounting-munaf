import React from 'react';
import { Voucher, Ledger, Product, Company, Godown } from '../types';
import { formatCurrency as formatCurrencyUtil } from '../lib/utils';
import { getCountryCurrency, getCountryTaxInfo } from '../constants';

interface VoucherPrintProps {
  voucher: Voucher;
  ledgers: Ledger[];
  products: Product[];
  godowns?: Godown[];
  company?: Company;
}

export default function VoucherPrint({ voucher, ledgers, products, godowns = [], company }: VoucherPrintProps) {
  const currencySymbol = company?.currencySymbol || (company?.country ? getCountryCurrency(company.country).symbol : '₹');
  const formatCurrency = (amount: number) => formatCurrencyUtil(amount, currencySymbol);
  const companyTaxLabel = company?.taxLabel || (company?.country ? getCountryTaxInfo(company.country).taxLabel : 'GSTIN');

  const ledger = ledgers.find(l => l.id === voucher.ledgerId);
  const salesPurchaseLedger = ledgers.find(l => l.id === voucher.salesPurchaseLedgerId);
  const debitLedger = ledgers.find(l => l.id === voucher.debitLedgerId);
  const creditLedger = ledgers.find(l => l.id === voucher.creditLedgerId);

  const printSeqQty = voucher.useSeparateQtyColumns !== undefined ? voucher.useSeparateQtyColumns : !!company?.useSeparateQtyColumns;

  if (voucher.isPos) {
    const totalQty = voucher.items?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 0;
    return (
      <div className="p-4 bg-white text-black font-mono max-w-[80mm] mx-auto border-2 border-dashed border-gray-300 rounded shadow-sm text-xs print:border-0 print:shadow-none print:p-0">
        {/* Store Info */}
        <div className="text-center space-y-1 mb-3">
          {company?.logoUrl && (
            <div className="w-12 h-12 mx-auto mb-1 border border-gray-200 rounded overflow-hidden">
              <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          <h2 className="text-sm font-black uppercase text-gray-900 tracking-wide">{company?.name}</h2>
          <p className="text-[10px] leading-tight text-gray-700">{company?.address}</p>
          <p className="text-[10px] text-gray-700">{company?.state}{company?.country ? `, ${company.country}` : ''}</p>
          {company?.gstNumber && <p className="text-[10px] font-bold text-gray-950">{companyTaxLabel}: {company.gstNumber}</p>}
          {company?.phone && <p className="text-[10px] text-gray-700">Tel: {company.phone}</p>}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Receipt Meta */}
        <div className="space-y-0.5 text-[10px] text-gray-800">
          <div className="flex justify-between">
            <span>RECEIPT NO:</span>
            <span className="font-bold">{voucher.voucherNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>DATE:</span>
            <span>{voucher.date}</span>
          </div>
          <div className="flex justify-between">
            <span>CUSTOMER:</span>
            <span className="font-bold uppercase">{ledger?.name || 'CASH CUSTOMER'}</span>
          </div>
          <div className="flex justify-between">
            <span>PAY MODE:</span>
            <span className="font-bold uppercase text-teal-900">{voucher.posPaymentMode || 'CASH'}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Items list */}
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-bold text-gray-900">
            <span className="w-2/5">ITEM</span>
            <span className="w-1/5 text-center">QTY</span>
            <span className="w-1/5 text-right">RATE</span>
            <span className="w-1/5 text-right">AMT</span>
          </div>
          <div className="border-t border-dashed border-gray-300 my-1"></div>
          {voucher.items?.map((item, index) => {
            const product = products.find(p => p.id === item.productId);
            return (
              <div key={index} className="text-[10px] text-gray-800 leading-tight">
                <div className="font-bold uppercase">{item.productName || product?.name || 'Unknown Item'}</div>
                <div className="flex justify-between">
                  <span className="text-[9px] text-gray-500">{product?.hsnCode ? `HSN:${product?.hsnCode}` : ''}</span>
                  <span className="w-1/5 text-center font-bold">{item.quantity} {product?.unit || 'Nos'}</span>
                  <span className="w-1/5 text-right">{formatCurrency(item.rate)}</span>
                  <span className="w-1/5 text-right font-bold">{formatCurrency(item.amount)}</span>
                </div>
                {item.discount !== undefined && item.discount > 0 && (
                  <div className="text-[9px] text-emerald-705 font-bold pl-2">
                    - Discount {item.discount}% applied
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Totals Breakdown */}
        <div className="space-y-1 text-[10px] text-gray-800">
          <div className="flex justify-between">
            <span>SUB TOTAL:</span>
            <span>{formatCurrency(voucher.amount)}</span>
          </div>
          {voucher.withTax !== false && (
            <>
              {voucher.igst !== undefined && voucher.igst > 0 ? (
                <div className="flex justify-between">
                  <span>IGST ({voucher.gstRate}%):</span>
                  <span>{formatCurrency(voucher.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>CGST ({(voucher.gstRate || 18)/2}%):</span>
                    <span>{formatCurrency(voucher.cgst || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST ({(voucher.gstRate || 18)/2}%):</span>
                    <span>{formatCurrency(voucher.sgst || 0)}</span>
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex justify-between text-xs font-black text-gray-950 border-t border-dashed border-gray-300 pt-1">
            <span>NET AMOUNT:</span>
            <span>{formatCurrency(voucher.totalAmount)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-400 my-2"></div>

        {/* Payments breakdown */}
        <div className="space-y-0.5 text-[10px] text-gray-800 font-bold">
          {voucher.posPaymentMode === 'Cash' && (
            <>
              <div className="flex justify-between">
                <span>CASH RECEIVED:</span>
                <span>{formatCurrency(voucher.posCashReceived || 0)}</span>
              </div>
              <div className="flex justify-between text-emerald-800">
                <span>CHANGE RETURNED:</span>
                <span>{formatCurrency(voucher.posCashReturned || 0)}</span>
              </div>
            </>
          )}
          {voucher.posPaymentMode === 'Card' && (
            <div className="flex justify-between text-blue-900">
              <span>CARD CHARGED:</span>
              <span>{formatCurrency(voucher.posCardAmount || voucher.totalAmount)}</span>
            </div>
          )}
          {voucher.posPaymentMode === 'Multi-Mode' && (
            <>
              <div className="flex justify-between">
                <span>CASH RECEIVED:</span>
                <span>{formatCurrency(voucher.posCashAmount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>CARD CHARGED:</span>
                <span>{formatCurrency(voucher.posCardAmount || 0)}</span>
              </div>
            </>
          )}
        </div>

        {voucher.narration && (
          <>
            <div className="border-t border-dashed border-gray-300 my-2"></div>
            <div className="text-[9px] text-gray-600 italic">
              <span className="font-bold">Memo:</span> {voucher.narration}
            </div>
          </>
        )}

        <div className="border-t border-dashed border-gray-400 my-3"></div>

        {/* Receipt Footer Greetings */}
        <div className="text-center space-y-1 select-none">
          <p className="text-[10px] font-bold text-gray-950 tracking-wider">★ THANK YOU & VISIT AGAIN ★</p>
          <div className="flex flex-col items-center pt-1.5 opacity-80">
            <div className="h-6 w-4/5 bg-gray-900 flex justify-around p-0.5 items-stretch">
              <div className="w-1 bg-white"></div>
              <div className="w-0.5 bg-white"></div>
              <div className="w-2 bg-white"></div>
              <div className="w-1 bg-white"></div>
              <div className="w-0.5 bg-white"></div>
              <div className="w-1.5 bg-white"></div>
            </div>
            <span className="text-[8px] font-mono tracking-widest text-gray-500 mt-0.5 font-bold">POS-{voucher.voucherNumber}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#ffffff] text-[#000000] font-sans max-w-[210mm] mx-auto border border-[#e5e7eb] shadow-sm print:border-0 print:shadow-none print:p-0">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-[#000000] pb-4 mb-6">
        <div className="flex items-start space-x-4">
          {company?.logoUrl && (
            <div className="w-20 h-20 border border-[#e5e7eb] rounded overflow-hidden flex-shrink-0">
              <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            </div>
          )}
          <div className="text-left">
            <h1 className="text-2xl font-bold uppercase leading-tight">{company?.name}</h1>
            <p className="text-xs mt-1 max-w-xs">{company?.address}</p>
            <p className="text-xs">{company?.state}{company?.country ? `, ${company.country}` : ''}</p>
            <p className="text-xs font-bold mt-1">{company?.gstNumber ? `${companyTaxLabel}: ${company.gstNumber}` : ''}</p>
            <p className="text-xs">
              {company?.phone ? `Phone: ${company.phone}` : ''} 
              {company?.phone && company?.email ? ' | ' : ''} 
              {company?.email ? `Email: ${company.email}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="border-2 border-[#000000] px-4 py-1 font-bold uppercase tracking-widest text-sm mb-2">
            {voucher.type} VOUCHER
          </div>
          <p className="text-xs font-bold">Financial Year: {company?.financialYear}</p>
        </div>
      </div>

      {/* Voucher Info */}
      <div className="flex justify-between mb-6 text-sm">
        <div>
          <p><span className="font-bold">Voucher No:</span> {voucher.voucherNumber}</p>
          {voucher.type === 'Manufacturing Journal' ? (
            <>
              <p><span className="font-bold">Assembled Item:</span> {products.find(p => p.id === voucher.manufacturedProductId)?.name || 'Unknown Product'}</p>
              <p><span className="font-bold">Quantity Produced:</span> {voucher.manufacturedQuantity} {products.find(p => p.id === voucher.manufacturedProductId)?.unit || 'Pcs'}</p>
            </>
          ) : (
            <>
              <p><span className="font-bold">Party:</span> {ledger?.name || debitLedger?.name || creditLedger?.name || 'Cash'}</p>
              {salesPurchaseLedger && (
                <p><span className="font-bold">{voucher.type?.includes('Sales') ? 'Sales A/c' : 'Purchase A/c'}:</span> {salesPurchaseLedger.name}</p>
              )}
            </>
          )}
        </div>
        <div className="text-right flex flex-col items-end">
          <p><span className="font-bold">Date:</span> {voucher.date}</p>
          {voucher.type === 'Manufacturing Journal' && (
            <div className="mt-2 bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs text-left rounded-sm font-mono shadow-sm">
              <span className="font-bold text-teal-800 text-[10px] block uppercase tracking-wider">Cost of 1 {products.find(p => p.id === voucher.manufacturedProductId)?.unit || 'Pc'}:</span>
              <p className="text-sm font-black text-rose-600 mt-0.5">
                {formatCurrency((voucher.totalAmount || 0) / (Number(voucher.manufacturedQuantity) || 1))} / {products.find(p => p.id === voucher.manufacturedProductId)?.unit || 'Pc'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="border border-[#000000] min-h-[300px] flex flex-col">
        {voucher.mode === 'Invoice' ? (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#000000] bg-[#f9fafb]">
                <th className="border-r border-[#000000] p-2 text-left">Particulars</th>
                <th className="border-r border-[#000000] p-2 text-center w-20">HSN/SAC</th>
                {printSeqQty ? (
                  <>
                    <th className="border-r border-[#000000] p-2 text-right w-20">Actual Qty</th>
                    <th className="border-r border-[#000000] p-2 text-right w-20">Billed Qty</th>
                  </>
                ) : (
                  <th className="border-r border-[#000000] p-2 text-right w-20">Quantity</th>
                )}
                <th className="border-r border-[#000000] p-2 text-right w-24">Rate</th>
                <th className="border-r border-[#000000] p-2 text-right w-24">Discount</th>
                <th className="p-2 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {voucher.items?.map((item, index) => {
                const product = products.find(p => p.id === item.productId);
                const godown = godowns.find(g => g.id === item.godownId);
                return (
                  <tr key={index} className="border-b border-[#f3f4f6] last:border-b-0">
                    <td className="border-r border-[#000000] p-2">
                      <div>{item.productName || product?.name || 'Unknown Item'}</div>
                      {item.batchNumber && (
                        <div className="text-[10px] text-gray-500 italic mt-0.5 ml-2">
                          Batch: {item.batchNumber}
                          {item.manufacturingDate && <span className="ml-2">Mfg: {item.manufacturingDate}</span>}
                          {item.expiryDate && <span className="ml-2">Exp: {item.expiryDate}</span>}
                        </div>
                      )}
                      {item.godownId && <div className="text-[10px] text-gray-500 italic mt-0.5 ml-2">Src: {godowns.find(g => g.id === item.godownId)?.name || item.godownId}</div>}
                      {item.destinationGodownId && <div className="text-[10px] text-gray-500 italic mt-0.5 ml-2">Dst: {godowns.find(g => g.id === item.destinationGodownId)?.name || item.destinationGodownId}</div>}
                    </td>
                    <td className="border-r border-[#000000] p-2 text-center">{product?.hsnCode || '-'}</td>
                    {printSeqQty ? (
                      <>
                        <td className="border-r border-[#000000] p-2 text-right">{item.actualQuantity !== undefined ? item.actualQuantity : item.quantity}</td>
                        <td className="border-r border-[#000000] p-2 text-right">{item.billedQuantity !== undefined ? item.billedQuantity : item.quantity}</td>
                      </>
                    ) : (
                      <td className="border-r border-[#000000] p-2 text-right">{item.quantity}</td>
                    )}
                    <td className="border-r border-[#000000] p-2 text-right">{formatCurrency(item.rate)}</td>
                    <td className="border-r border-[#000000] p-2 text-right">{item.discount !== undefined && item.discount > 0 ? `${item.discount}%` : '-'}</td>
                    <td className="p-2 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                );
              })}

              {/* Manufacturing Journal Additional Charges */}
              {voucher.type === 'Manufacturing Journal' && voucher.additionalCharges && voucher.additionalCharges.length > 0 && (
                <>
                  <tr className="border-t border-[#000000] bg-gray-100">
                    <td className="border-r border-[#000000] p-1.5 font-bold px-2 uppercase text-xs" colSpan={printSeqQty ? 6 : 5}>
                      Additional Costs
                    </td>
                    <td className="p-1.5 text-right font-bold text-xs">
                      {formatCurrency(voucher.additionalCharges.reduce((s, c) => s + (c.amount || 0), 0))}
                    </td>
                  </tr>
                  {voucher.additionalCharges.map((charge, idx) => (
                    <tr key={`charge-${idx}`} className="border-b border-[#f3f4f6]">
                      <td className="border-r border-[#000000] p-2 italic text-gray-700" colSpan={printSeqQty ? 6 : 5}>
                        {ledgers.find(l => l.id === charge.ledgerId)?.name || 'Additional Charge'}
                      </td>
                      <td className="p-2 text-right text-gray-800">{formatCurrency(charge.amount || 0)}</td>
                    </tr>
                  ))}
                </>
              )}

              {/* Fill empty space */}
              {[...Array(Math.max(0, 8 - (voucher.items?.length || 0)))].map((_, i) => (
                <tr key={`empty-${i}`} className="h-8">
                  <td className="border-r border-[#000000] p-2"></td>
                  <td className="border-r border-[#000000] p-2"></td>
                  {printSeqQty ? (
                    <>
                      <td className="border-r border-[#000000] p-2"></td>
                      <td className="border-r border-[#000000] p-2"></td>
                    </>
                  ) : (
                    <td className="border-r border-[#000000] p-2"></td>
                  )}
                  <td className="border-r border-[#000000] p-2"></td>
                  <td className="border-r border-[#000000] p-2"></td>
                  <td className="p-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-0 flex-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#000000] bg-[#f9fafb]">
                  <th className="border-r border-[#000000] p-2 text-left">Particulars</th>
                  <th className="p-2 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody>
                {voucher.items && voucher.items.length > 0 ? (
                  voucher.items.map((item, index) => {
                    const itemLedger = ledgers.find(l => l.id === item.ledgerId);
                    return (
                      <tr key={index} className="border-b border-[#f3f4f6] last:border-b-0">
                        <td className="border-r border-[#000000] p-2">
                          {item.type ? `${item.type}. ` : ''}{itemLedger?.name || 'Unknown Ledger'}
                        </td>
                        <td className="p-2 text-right">{formatCurrency(item.amount)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <>
                    {voucher.debitLedgerId && (
                      <tr className="border-b border-[#f3f4f6]">
                        <td className="border-r border-[#000000] p-2">Dr. {debitLedger?.name}</td>
                        <td className="p-2 text-right">{formatCurrency(voucher.amount)}</td>
                      </tr>
                    )}
                    {voucher.creditLedgerId && (
                      <tr className="border-b border-[#f3f4f6]">
                        <td className="border-r border-[#000000] p-2">Cr. {creditLedger?.name}</td>
                        <td className="p-2 text-right">{formatCurrency(voucher.amount)}</td>
                      </tr>
                    )}
                  </>
                )}
                {/* Fill empty space */}
                {[...Array(Math.max(0, 8 - (voucher.items?.length || (voucher.debitLedgerId ? 1 : 0) + (voucher.creditLedgerId ? 1 : 0))))].map((_, i) => (
                  <tr key={`empty-${i}`} className="h-8">
                    <td className="border-r border-[#000000] p-2"></td>
                    <td className="p-2"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="mt-auto border-t border-[#000000]">
          <div className="flex justify-end border-b border-[#000000]">
            <div className="w-1/2 border-l border-[#000000] p-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>{voucher.mode === 'Double Entry' ? 'Total Amount:' : 'Sub Total:'}</span>
                <span>{formatCurrency(voucher.amount)}</span>
              </div>
              {voucher.mode !== 'Double Entry' && voucher.withTax !== false && (
                <>
                  {(!voucher.taxType || voucher.taxType === 'GST') && (
                    <>
                      {voucher.igst && voucher.igst > 0 ? (
                        <div className="flex justify-between">
                          <span>IGST ({voucher.gstRate}%):</span>
                          <span>{formatCurrency(voucher.igst)}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span>CGST ({(voucher.gstRate || 18)/2}%):</span>
                            <span>{formatCurrency(voucher.cgst)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SGST ({(voucher.gstRate || 18)/2}%):</span>
                            <span>{formatCurrency(voucher.sgst)}</span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {voucher.taxType === 'VAT' && (
                    <div className="flex justify-between">
                      <span>VAT ({voucher.gstRate || 18}%):</span>
                      <span>{formatCurrency((voucher as any).vatAmount || 0)}</span>
                    </div>
                  )}
                  {voucher.taxType === 'TDS' && (
                    <div className="flex justify-between text-red-700 font-medium">
                      <span>TDS Deduction (-{(voucher as any).gstRate || 18}%):</span>
                      <span>-{formatCurrency((voucher as any).tdsAmount || 0)}</span>
                    </div>
                  )}
                  {voucher.taxType === 'Excise' && (
                    <div className="flex justify-between">
                      <span>Excise Duty ({voucher.gstRate || 18}%):</span>
                      <span>{formatCurrency((voucher as any).exciseAmount || 0)}</span>
                    </div>
                  )}
                  {voucher.taxType === 'Service Tax' && (
                    <div className="flex justify-between">
                      <span>Service Tax ({voucher.gstRate || 18}%):</span>
                      <span>{formatCurrency((voucher as any).serviceTaxAmount || 0)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-[#e5e7eb]">
                <span>{voucher.mode === 'Double Entry' ? 'Grand Total:' : 'Total:'}</span>
                <span>{formatCurrency(voucher.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 text-sm">
        <p><span className="font-bold italic">Amount in words:</span> <span className="capitalize">Rupees {voucher.totalAmount.toLocaleString('en-IN')} only</span></p>
        <div className="mt-4">
          <p><span className="font-bold">Narration:</span> {voucher.narration}</p>
        </div>
      </div>

      <div className="mt-12 flex justify-between">
        <div className="text-center w-48">
          <div className="border-t border-[#000000] pt-1">Receiver's Signature</div>
        </div>
        <div className="text-center w-48">
          <div className="border-t border-[#000000] pt-1">Authorised Signatory</div>
        </div>
      </div>
    </div>
  );
}
