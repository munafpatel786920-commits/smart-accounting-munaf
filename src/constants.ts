export const TALLY_GROUPS = [
  'Bank Accounts',
  'Bank OCC A/c',
  'Bank OD A/c',
  'Branch / Divisions',
  'Capital Account',
  'Cash-in-Hand',
  'Current Assets',
  'Current Liabilities',
  'Deposits (Asset)',
  'Direct Expenses',
  'Direct Incomes',
  'Duties & Taxes',
  'Fixed Assets',
  'Indirect Expenses',
  'Indirect Incomes',
  'Investments',
  'Loans & Advances (Asset)',
  'Loans (Liability)',
  'Misc. Expenses (Asset)',
  'Provisions',
  'Purchase Accounts',
  'Reserves & Surplus',
  'Sales Accounts',
  'Secured Loans',
  'Stock-in-Hand',
  'Sundry Creditors',
  'Sundry Debtors',
  'Unsecured Loans'
] as const;

export type TallyGroup = typeof TALLY_GROUPS[number];

export const getGroupCategory = (group: string): 'Assets' | 'Liabilities' | 'Income' | 'Expenses' => {
  if (!group) return 'Assets';
  const g = group.trim();
  const lower = g.toLowerCase();

  const assets = ['Bank Accounts', 'Cash-in-Hand', 'Current Assets', 'Deposits (Asset)', 'Fixed Assets', 'Investments', 'Loans & Advances (Asset)', 'Misc. Expenses (Asset)', 'Stock-in-Hand', 'Sundry Debtors'];
  const liabilities = ['Bank OCC A/c', 'Bank OD A/c', 'Branch / Divisions', 'Capital Account', 'Current Liabilities', 'Duties & Taxes', 'Loans (Liability)', 'Provisions', 'Reserves & Surplus', 'Secured Loans', 'Sundry Creditors', 'Unsecured Loans'];
  const income = ['Direct Incomes', 'Indirect Incomes', 'Sales Accounts', 'Direct Income', 'Indirect Income', 'Sales Account', 'Sales', 'Income', 'Incomes', 'Revenue', 'Operating Income', 'Other Income'];
  const expenses = ['Direct Expenses', 'Indirect Expenses', 'Purchase Accounts', 'Direct Expense', 'Indirect Expense', 'Purchase Account', 'Purchase', 'Purchases', 'Expenses', 'Expense', 'Operating Expense'];

  if (income.some(inc => lower === inc.toLowerCase()) || lower.includes('income') || lower === 'sales' || lower.startsWith('sales account')) return 'Income';
  if (expenses.some(exp => lower === exp.toLowerCase()) || lower.includes('expense') || lower === 'purchase' || lower.startsWith('purchase account')) return 'Expenses';
  if (liabilities.some(lia => lower === lia.toLowerCase()) || lower.includes('liabilit') || lower.includes('capital') || lower.includes('loan') || lower.includes('creditor')) return 'Liabilities';
  if (assets.some(ast => lower === ast.toLowerCase()) || lower.includes('asset') || lower.includes('bank') || lower.includes('cash') || lower.includes('debtor') || lower.includes('stock')) return 'Assets';

  if (assets.includes(group)) return 'Assets';
  if (liabilities.includes(group)) return 'Liabilities';
  if (income.includes(group)) return 'Income';
  if (expenses.includes(group)) return 'Expenses';
  
  return 'Assets'; // Default
};

export const COUNTRIES = [
  'India',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Australia',
  'Canada',
  'Singapore',
  'Saudi Arabia',
  'Qatar',
  'Oman',
  'Kuwait',
  'Bahrain',
  'Germany',
  'France',
  'Japan',
  'China',
  'Bangladesh',
  'Nepal',
  'Sri Lanka',
  'Pakistan',
  'South Africa',
  'New Zealand',
  'Malaysia'
] as const;

export type CountryName = typeof COUNTRIES[number] | string;

export interface CountryInfo {
  currencySymbol: string;
  currencyCode: string;
  currencyName: string;
  defaultState: string;
  states: string[];
  taxType: 'GST' | 'VAT' | 'Sales Tax' | 'Tax';
  taxName: string;
  taxLabel: string;
  taxPlaceholder: string;
  defaultTaxRate: number;
  taxRates: number[];
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
] as const;

export const COUNTRY_DATA: Record<string, CountryInfo> = {
  'India': {
    currencySymbol: '₹',
    currencyCode: 'INR',
    currencyName: 'Indian Rupee',
    defaultState: 'Gujarat',
    states: [...INDIAN_STATES],
    taxType: 'GST',
    taxName: 'Goods and Services Tax (GST)',
    taxLabel: 'GSTIN / UIN',
    taxPlaceholder: 'e.g. 24AAAAA0000A1Z5',
    defaultTaxRate: 18,
    taxRates: [0, 5, 12, 18, 28]
  },
  'United Arab Emirates': {
    currencySymbol: 'AED',
    currencyCode: 'AED',
    currencyName: 'UAE Dirham',
    defaultState: 'Dubai',
    states: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (FTA UAE)',
    taxLabel: 'TRN (Tax Registration No)',
    taxPlaceholder: 'e.g. 100XXXXXXXXX003',
    defaultTaxRate: 5,
    taxRates: [0, 5]
  },
  'United Kingdom': {
    currencySymbol: '£',
    currencyCode: 'GBP',
    currencyName: 'British Pound',
    defaultState: 'England',
    states: ['England', 'Scotland', 'Wales', 'Northern Ireland', 'Greater London', 'West Midlands', 'Greater Manchester', 'West Yorkshire'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (HMRC VAT)',
    taxLabel: 'VAT Reg No (GB)',
    taxPlaceholder: 'e.g. GB 123 4567 89',
    defaultTaxRate: 20,
    taxRates: [0, 5, 20]
  },
  'United States': {
    currencySymbol: '$',
    currencyCode: 'USD',
    currencyName: 'US Dollar',
    defaultState: 'California',
    states: [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
      'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
      'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
      'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
      'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
      'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
      'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'
    ],
    taxType: 'Sales Tax',
    taxName: 'State & Local Sales Tax',
    taxLabel: 'EIN / State Tax ID',
    taxPlaceholder: 'e.g. 12-3456789',
    defaultTaxRate: 8,
    taxRates: [0, 4, 6, 7.5, 8, 9.5]
  },
  'Australia': {
    currencySymbol: 'A$',
    currencyCode: 'AUD',
    currencyName: 'Australian Dollar',
    defaultState: 'New South Wales',
    states: [
      'New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia',
      'Tasmania', 'Australian Capital Territory', 'Northern Territory'
    ],
    taxType: 'GST',
    taxName: 'Goods and Services Tax (ATO GST)',
    taxLabel: 'ABN / GST Number',
    taxPlaceholder: 'e.g. 51 824 753 556',
    defaultTaxRate: 10,
    taxRates: [0, 10]
  },
  'Canada': {
    currencySymbol: 'CA$',
    currencyCode: 'CAD',
    currencyName: 'Canadian Dollar',
    defaultState: 'Ontario',
    states: [
      'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan',
      'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island',
      'Northwest Territories', 'Nunavut', 'Yukon'
    ],
    taxType: 'GST',
    taxName: 'Goods & Services Tax (GST / HST)',
    taxLabel: 'CRA Business No (BN / GST)',
    taxPlaceholder: 'e.g. 123456789 RT 0001',
    defaultTaxRate: 13,
    taxRates: [0, 5, 13, 15]
  },
  'Singapore': {
    currencySymbol: 'S$',
    currencyCode: 'SGD',
    currencyName: 'Singapore Dollar',
    defaultState: 'Central Singapore',
    states: ['Central Singapore', 'North East', 'North West', 'South East', 'South West'],
    taxType: 'GST',
    taxName: 'Goods and Services Tax (IRAS GST)',
    taxLabel: 'UEN / GST Reg No',
    taxPlaceholder: 'e.g. 201234567A',
    defaultTaxRate: 9,
    taxRates: [0, 9]
  },
  'Saudi Arabia': {
    currencySymbol: 'SAR',
    currencyCode: 'SAR',
    currencyName: 'Saudi Riyal',
    defaultState: 'Riyadh',
    states: ['Riyadh', 'Makkah', 'Eastern Province', 'Madinah', 'Asir', 'Tabuk', 'Hail', 'Najran', 'Jazan', 'Al Qassim', 'Al Jouf', 'Northern Borders', 'Al Bahah'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (ZATCA VAT 15%)',
    taxLabel: 'TIN / VAT Number (الرقم الضريبي)',
    taxPlaceholder: 'e.g. 300XXXXXXXXX003',
    defaultTaxRate: 15,
    taxRates: [0, 5, 15]
  },
  'Qatar': {
    currencySymbol: 'QAR',
    currencyCode: 'QAR',
    currencyName: 'Qatari Riyal',
    defaultState: 'Doha',
    states: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Daayen', 'Umm Salal', 'Al Khor', 'Al Shamal', 'Al Shahaniya'],
    taxType: 'Tax',
    taxName: 'General Tax Authority (GTA TIN)',
    taxLabel: 'Tax Identification Number (TIN)',
    taxPlaceholder: 'e.g. 0000XXXXXXXXX',
    defaultTaxRate: 0,
    taxRates: [0, 5, 10]
  },
  'Oman': {
    currencySymbol: 'OMR',
    currencyCode: 'OMR',
    currencyName: 'Omani Rial',
    defaultState: 'Muscat',
    states: ['Muscat', 'Dhofar', 'Musandam', 'Al Buraimi', 'Ad Dakhiliyah', 'Al Batinah North', 'Al Batinah South', 'Ash Sharqiyah North', 'Ash Sharqiyah South', 'Ad Dhahirah', 'Al Wusta'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (OTA VAT 5%)',
    taxLabel: 'VAT Identification No (OM-TIN)',
    taxPlaceholder: 'e.g. OM1234567890',
    defaultTaxRate: 5,
    taxRates: [0, 5]
  },
  'Kuwait': {
    currencySymbol: 'KWD',
    currencyCode: 'KWD',
    currencyName: 'Kuwaiti Dinar',
    defaultState: 'Al Asimah (Capital)',
    states: ['Al Asimah (Capital)', 'Hawalli', 'Al Farwaniyah', 'Al Ahmadi', 'Al Jahra', 'Mubarak Al-Kabeer'],
    taxType: 'Tax',
    taxName: 'Ministry of Finance Tax Card',
    taxLabel: 'Tax Card / Commercial Reg No',
    taxPlaceholder: 'e.g. KW-123456',
    defaultTaxRate: 0,
    taxRates: [0, 5, 15]
  },
  'Bahrain': {
    currencySymbol: 'BHD',
    currencyCode: 'BHD',
    currencyName: 'Bahraini Dinar',
    defaultState: 'Capital Governorate',
    states: ['Capital Governorate', 'Muharraq Governorate', 'Northern Governorate', 'Southern Governorate'],
    taxType: 'VAT',
    taxName: 'National Bureau for Revenue (NBR VAT)',
    taxLabel: 'VAT Account Number (NBR-VAT)',
    taxPlaceholder: 'e.g. 20000XXXXXXXX00002',
    defaultTaxRate: 10,
    taxRates: [0, 5, 10]
  },
  'Germany': {
    currencySymbol: '€',
    currencyCode: 'EUR',
    currencyName: 'Euro',
    defaultState: 'Bavaria',
    states: ['Bavaria', 'Baden-Württemberg', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hesse', 'Lower Saxony', 'Mecklenburg-Vorpommern', 'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia'],
    taxType: 'VAT',
    taxName: 'Umsatzsteuer (MwSt / USt 19%)',
    taxLabel: 'USt-IdNr / Steuernummer',
    taxPlaceholder: 'e.g. DE 123456789',
    defaultTaxRate: 19,
    taxRates: [0, 7, 19]
  },
  'France': {
    currencySymbol: '€',
    currencyCode: 'EUR',
    currencyName: 'Euro',
    defaultState: 'Île-de-France',
    states: ['Île-de-France', 'Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Brittany', 'Centre-Val de Loire', 'Corsica', 'Grand Est', 'Hauts-de-France', 'Normandy', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', 'Provence-Alpes-Côte d\'Azur'],
    taxType: 'VAT',
    taxName: 'Taxe sur la Valeur Ajoutée (TVA 20%)',
    taxLabel: 'Numéro de TVA Intracommunautaire',
    taxPlaceholder: 'e.g. FR 12 345678901',
    defaultTaxRate: 20,
    taxRates: [0, 5.5, 10, 20]
  },
  'Japan': {
    currencySymbol: '¥',
    currencyCode: 'JPY',
    currencyName: 'Japanese Yen',
    defaultState: 'Tokyo',
    states: ['Tokyo', 'Osaka', 'Kanagawa', 'Aichi', 'Hokkaido', 'Fukuoka', 'Hyogo', 'Saitama', 'Chiba', 'Kyoto', 'Hiroshima', 'Miyagi'],
    taxType: 'Tax',
    taxName: 'Japanese Consumption Tax (JCT 10%)',
    taxLabel: 'Qualified Invoice No (T+13 digits)',
    taxPlaceholder: 'e.g. T1234567890123',
    defaultTaxRate: 10,
    taxRates: [0, 8, 10]
  },
  'China': {
    currencySymbol: '¥',
    currencyCode: 'CNY',
    currencyName: 'Chinese Yuan',
    defaultState: 'Guangdong',
    states: ['Guangdong', 'Beijing', 'Shanghai', 'Zhejiang', 'Jiangsu', 'Shandong', 'Sichuan', 'Fujian', 'Hubei', 'Hunan', 'Hebei', 'Henan'],
    taxType: 'VAT',
    taxName: 'China Value-Added Tax (增值税)',
    taxLabel: 'Unified Social Credit Code (USCC)',
    taxPlaceholder: 'e.g. 91110000XXXXXXXXXX',
    defaultTaxRate: 13,
    taxRates: [0, 6, 9, 13]
  },
  'Bangladesh': {
    currencySymbol: '৳',
    currencyCode: 'BDT',
    currencyName: 'Bangladeshi Taka',
    defaultState: 'Dhaka',
    states: ['Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Barisal', 'Sylhet', 'Rangpur', 'Mymensingh'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (NBR VAT / BIN)',
    taxLabel: 'Business Identification Number (BIN)',
    taxPlaceholder: 'e.g. 000123456-0101',
    defaultTaxRate: 15,
    taxRates: [0, 5, 7.5, 10, 15]
  },
  'Nepal': {
    currencySymbol: 'NPR',
    currencyCode: 'NPR',
    currencyName: 'Nepalese Rupee',
    defaultState: 'Bagmati',
    states: ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (IRD VAT / PAN)',
    taxLabel: 'PAN / VAT Registration Number',
    taxPlaceholder: 'e.g. 600123456',
    defaultTaxRate: 13,
    taxRates: [0, 13]
  },
  'Sri Lanka': {
    currencySymbol: 'Rs',
    currencyCode: 'LKR',
    currencyName: 'Sri Lankan Rupee',
    defaultState: 'Western Province',
    states: ['Western Province', 'Central Province', 'Southern Province', 'Northern Province', 'Eastern Province', 'North Western Province', 'North Central Province', 'Uva Province', 'Sabaragamuwa Province'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (IRD VAT 18%)',
    taxLabel: 'VAT Registration / TIN',
    taxPlaceholder: 'e.g. 123456789-7000',
    defaultTaxRate: 18,
    taxRates: [0, 8, 18]
  },
  'Pakistan': {
    currencySymbol: 'PKR',
    currencyCode: 'PKR',
    currencyName: 'Pakistani Rupee',
    defaultState: 'Punjab',
    states: ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Jammu and Kashmir'],
    taxType: 'Sales Tax',
    taxName: 'Federal Board of Revenue (STRN / NTN)',
    taxLabel: 'STRN / NTN Number',
    taxPlaceholder: 'e.g. 12-34-5678-901-23',
    defaultTaxRate: 18,
    taxRates: [0, 5, 10, 18]
  },
  'South Africa': {
    currencySymbol: 'R',
    currencyCode: 'ZAR',
    currencyName: 'South African Rand',
    defaultState: 'Gauteng',
    states: ['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape'],
    taxType: 'VAT',
    taxName: 'Value Added Tax (SARS VAT 15%)',
    taxLabel: 'VAT Registration Number',
    taxPlaceholder: 'e.g. 4123456789',
    defaultTaxRate: 15,
    taxRates: [0, 15]
  },
  'New Zealand': {
    currencySymbol: 'NZ$',
    currencyCode: 'NZD',
    currencyName: 'New Zealand Dollar',
    defaultState: 'Auckland',
    states: ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Bay of Plenty', 'Otago', 'Manawatu-Wanganui', 'Hawke\'s Bay', 'Taranaki', 'Northland', 'Southland'],
    taxType: 'GST',
    taxName: 'Goods and Services Tax (IRD GST 15%)',
    taxLabel: 'GST Number (IRD)',
    taxPlaceholder: 'e.g. 123-456-789',
    defaultTaxRate: 15,
    taxRates: [0, 15]
  },
  'Malaysia': {
    currencySymbol: 'RM',
    currencyCode: 'MYR',
    currencyName: 'Malaysian Ringgit',
    defaultState: 'Selangor',
    states: ['Selangor', 'Kuala Lumpur', 'Johor', 'Penang', 'Perak', 'Sarawak', 'Sabah', 'Kedah', 'Pahang', 'Negeri Sembilan', 'Melaka', 'Kelantan', 'Terengganu', 'Perlis', 'Labuan', 'Putrajaya'],
    taxType: 'Sales Tax',
    taxName: 'Sales and Service Tax (SST)',
    taxLabel: 'SST Registration Number',
    taxPlaceholder: 'e.g. W10-1808-12345678',
    defaultTaxRate: 10,
    taxRates: [0, 6, 8, 10]
  }
};

export const getCountryCurrency = (countryName?: string): { symbol: string; code: string; name: string } => {
  if (!countryName) return { symbol: '₹', code: 'INR', name: 'Indian Rupee' };
  const info = COUNTRY_DATA[countryName];
  if (info) {
    return { symbol: info.currencySymbol, code: info.currencyCode, name: info.currencyName };
  }
  return { symbol: '₹', code: 'INR', name: 'Indian Rupee' };
};

export const getCountryStates = (countryName?: string): string[] => {
  if (!countryName) return [...INDIAN_STATES];
  const info = COUNTRY_DATA[countryName];
  if (info && info.states && info.states.length > 0) {
    return info.states;
  }
  return [];
};

export const getCountryDefaultState = (countryName?: string): string => {
  if (!countryName) return 'Gujarat';
  const info = COUNTRY_DATA[countryName];
  if (info) return info.defaultState;
  return '';
};

export interface CountryTaxInfo {
  taxType: 'GST' | 'VAT' | 'Sales Tax' | 'Tax';
  taxName: string;
  taxLabel: string;
  taxPlaceholder: string;
  defaultTaxRate: number;
  taxRates: number[];
}

export const getCountryTaxInfo = (countryName?: string): CountryTaxInfo => {
  if (!countryName) {
    return {
      taxType: 'GST',
      taxName: 'Goods and Services Tax (GST)',
      taxLabel: 'GSTIN / UIN',
      taxPlaceholder: 'e.g. 24AAAAA0000A1Z5',
      defaultTaxRate: 18,
      taxRates: [0, 5, 12, 18, 28]
    };
  }
  const info = COUNTRY_DATA[countryName];
  if (info && info.taxName) {
    return {
      taxType: info.taxType,
      taxName: info.taxName,
      taxLabel: info.taxLabel,
      taxPlaceholder: info.taxPlaceholder,
      defaultTaxRate: info.defaultTaxRate,
      taxRates: info.taxRates || [0, 5, 12, 18, 28]
    };
  }
  return {
    taxType: 'GST',
    taxName: 'Goods and Services Tax (GST)',
    taxLabel: 'GSTIN / Tax ID',
    taxPlaceholder: 'Enter Tax Registration No',
    defaultTaxRate: 18,
    taxRates: [0, 5, 12, 18, 28]
  };
};
