import { TallyGroup } from './constants';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'staff';
  createdAt: string;
  suspended?: boolean;
}

export interface Ledger {
  id?: string;
  name: string;
  alias?: string;
  group: TallyGroup | string;
  openingBalance: number;
  balanceType?: 'Dr' | 'Cr';
  currentBalance: number;
  gstNumber?: string;
  address?: string;
  state?: string;
  country?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  billByBill?: boolean;
  creditPeriod?: number;
  checkCreditDays?: boolean;
  bankDetailsProvided?: boolean;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankName?: string;
  panNumber?: string;
  registrationType?: 'Regular' | 'Composition' | 'Unregistered' | 'Consumer';
  companyId: string;
  createdBy: string;
  createdAt: string;
  costCentersEnabled?: boolean;
}

export interface GroupMaster {
  id?: string;
  name: string;
  alias?: string;
  parentGroup: string;
  natureOfGroup?: 'Assets' | 'Liabilities' | 'Income' | 'Expenses';
  isSubLedger?: boolean;
  netDebitCreditBalReporting?: boolean;
  usedForCalculation?: boolean;
  allocationMethod?: 'Not Applicable' | 'Appropriate by Qty' | 'Appropriate by Value';
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface UnitMaster {
  id?: string;
  symbol: string;
  formalName: string;
  uqc?: string;
  decimalPlaces: number;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface CostCategory {
  id?: string;
  name: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface CostCenter {
  id?: string;
  name: string;
  categoryId?: string;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface CostCenterAllocation {
  categoryId?: string;
  costCenterId: string;
  amount: number;
}

export interface Godown {
  id?: string;
  name: string;
  alias?: string;
  parentGodown?: string;
  address?: string;
  allowStorage?: boolean;
  ourStockWithThirdParty?: boolean;
  thirdPartyStockWithUs?: boolean;
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface VoucherItem {
  productId?: string;
  ledgerId?: string; // For Normal mode (multiple particulars)
  productName?: string;
  godownId?: string;
  destinationGodownId?: string; // For Material Transfer / Stock Journal
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  quantity?: number;
  actualQuantity?: number; // Tally Prime separate Actual quantity
  billedQuantity?: number; // Tally Prime separate Billed quantity
  rate?: number;
  discount?: number; // Discount percentage or flat discount amount
  amount: number;
  type?: 'Dr' | 'Cr'; // For Double Entry mode
  costCenterAllocations?: CostCenterAllocation[];
}

export interface Voucher {
  id?: string;
  type: 'Sales' | 'Purchase' | 'Payment' | 'Receipt' | 'Journal' | 'Contra' | 'Credit Note' | 'Debit Note' | 'Stock Journal' | 'Sales Order' | 'Purchase Order' | 'Delivery Note' | 'Receipt Note' | 'Rejection In' | 'Rejection Out' | 'Manufacturing Journal';
  mode: 'Normal' | 'Invoice' | 'Double Entry';
  date: string;
  voucherNumber: string;
  orderNumber?: string; // For Sales/Purchase Order
  referenceVoucherId?: string; // To link RN to PO, DN to SO, Invoice to RN/DN
  referenceOrderNo?: string; // To link RN to PO, DN to SO
  skipStockUpdate?: boolean; // To prevent double-counting when linked to tracking notes
  ledgerId: string; // Primary ledger (Party in Invoice mode)
  salesPurchaseLedgerId?: string; // For Invoice mode (Sales/Purchase ledger)
  debitLedgerId?: string; // For Normal mode
  creditLedgerId?: string; // For Normal mode
  ledgerName?: string;
  amount: number;
  gstRate: number;
  withTax?: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  taxType?: 'GST' | 'VAT' | 'Sales Tax' | 'Tax' | 'TDS' | 'Excise' | 'Service Tax';
  vatAmount?: number;
  tdsAmount?: number;
  exciseAmount?: number;
  serviceTaxAmount?: number;
  totalAmount : number;
  narration: string;
  status?: 'Regular' | 'Optional' | 'Post-Dated' | 'Cancelled';
  items?: VoucherItem[];
  isInterState?: boolean;
  useSeparateQtyColumns?: boolean;
  isPos?: boolean;
  posPaymentMode?: 'Cash' | 'Card' | 'Multi-Mode';
  posCashReceived?: number;
  posCashReturned?: number;
  posCardAmount?: number;
  posCashAmount?: number;
  companyId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  manufacturedProductId?: string;
  manufacturedQuantity?: number;
  manufacturedGodownId?: string;
  additionalCharges?: { ledgerId: string; amount: number }[];
}

export interface VoucherTemplate {
  id?: string;
  name: string;
  type: Voucher['type'];
  mode: Voucher['mode'];
  ledgerId: string;
  salesPurchaseLedgerId?: string;
  debitLedgerId?: string;
  creditLedgerId?: string;
  amount: number;
  gstRate: number;
  withTax?: boolean;
  narration: string;
  items?: VoucherItem[];
  companyId: string;
  createdBy: string;
  createdAt: string;
}

export interface BomItem {
  productId: string;
  quantity: number;
}

export interface Product {
  id?: string;
  name: string;
  alias?: string;
  group?: string;
  hsnCode?: string;
  unit: string;
  openingStock: number;
  openingValue?: number;
  stockQuantity: number;
  purchasePrice: number;
  salesPrice: number;
  standardCost?: number;
  gstRate: number;
  gstApplicable?: boolean;
  taxability?: 'Taxable' | 'Exempt' | 'Nil Rated';
  costingMethod?: 'FIFO' | 'Weighted Average' | 'Average Cost' | 'Last Purchase Cost';
  decimalPlaces?: number;
  minStockLevel?: number;
  companyId: string;
  createdBy: string;
  createdAt: string;
  enableBom?: boolean;
  bom?: BomItem[];
}

export interface VoucherSettings {
  prefix?: string;
  suffix?: string;
  padding?: number;
  startingNumber?: number;
}

export interface Company {
  id?: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  gstNumber: string;
  country: string;
  state: string;
  currencySymbol?: string;
  currencyCode?: string;
  taxType?: 'GST' | 'VAT' | 'Sales Tax' | 'Tax';
  taxName?: string;
  taxLabel?: string;
  defaultTaxRate?: number;
  financialYear: string;
  logoUrl?: string;
  voucherSettings?: {
    [key: string]: VoucherSettings;
  };
  useSeparateQtyColumns?: boolean;
  enableGst?: boolean;
  enableDiscount?: boolean;
  enableGodowns?: boolean;
  enableBatches?: boolean;
  enableCostCenters?: boolean;
  enablePayroll?: boolean;
  enablePosInvoice?: boolean;
  enableBOM?: boolean;
  useSecurity?: boolean;
  securityUsername?: string;
  securityPassword?: string;
  createdBy: string;
  createdAt: string;
}
