// Currency formatting utilities for Maestro EGP
// يعمل هذا الملف مع CurrencyContext لتطبيق العملة بشكل ديناميكي

// العملات المدعومة مع عدد الأرقام العشرية الصحيحة
// IQD: الدينار العراقي - بدون فواصل عشرية (1,000 = ألف دينار)
// USD/EUR/SAR/AED/EGP: فاصلتان عشريتان (1.00 = واحد دولار)
// JOD/KWD: 3 فواصل عشرية (0.001 = فلس)
export const CURRENCIES = {
  IQD: { code: 'IQD', name: 'Iraqi Dinar', symbol: 'IQD', rate: 1, decimals: 0, minUnit: 250 },
  USD: { code: 'USD', name: 'US Dollar', symbol: 'USD', rate: 1460, decimals: 2, minUnit: 0.01 },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', rate: 389, decimals: 2, minUnit: 0.01 },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rate: 398, decimals: 2, minUnit: 0.01 },
  EGP: { code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', rate: 30, decimals: 2, minUnit: 0.01 },
  JOD: { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JOD', rate: 2060, decimals: 3, minUnit: 0.001 },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KWD', rate: 4750, decimals: 3, minUnit: 0.001 },
  EUR: { code: 'EUR', name: 'Euro', symbol: 'EUR', rate: 1580, decimals: 2, minUnit: 0.01 },
};

// متغير لتخزين العملة الحالية
let cachedCurrency = null;

// جلب العملة من localStorage مع تخزين مؤقت
const getCurrentCurrency = () => {
  try {
    const saved = localStorage.getItem('app_currency');
    if (saved && CURRENCIES[saved]) {
      cachedCurrency = CURRENCIES[saved];
      return cachedCurrency;
    }
  } catch (e) {
    console.error('Error reading currency from localStorage:', e);
  }
  return CURRENCIES.IQD;
};

// دالة لتحديث العملة المخزنة مؤقتاً (تستدعى من CurrencyContext)
export const refreshCurrencyCache = () => {
  cachedCurrency = null;
  getCurrentCurrency();
};

// الاستماع لتغييرات localStorage من نوافذ أخرى
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'app_currency') {
      refreshCurrencyCache();
    }
  });
}

/**
 * Format price with current system currency
 * Always uses English numerals for better readability
 * @param {number} amount - Amount
 * @param {boolean} showSymbol - Whether to show currency symbol
 * @returns {string} Formatted price
 */
export const formatPrice = (amount, showSymbol = true) => {
  const currency = getCurrentCurrency();
  
  if (amount === null || amount === undefined || isNaN(amount)) {
    return showSymbol ? `0 ${currency.symbol}` : '0';
  }
  
  // Always use English numerals (en-US locale)
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: currency.decimals || 0,
    maximumFractionDigits: currency.decimals || 0,
  }).format(amount);
  
  return showSymbol ? `${formatted} ${currency.symbol}` : formatted;
};

/**
 * Format price with compact notation for large numbers
 * @param {number} amount - Amount
 * @returns {string} Formatted price
 */
export const formatPriceCompact = (amount) => {
  const currency = getCurrentCurrency();
  
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M ${currency.symbol}`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K ${currency.symbol}`;
  }
  return formatPrice(amount);
};

/**
 * Convert between currencies
 * @param {number} amount - Amount to convert
 * @param {string} from - Source currency code
 * @param {string} to - Target currency code
 * @returns {number} Converted amount
 */
export const convertCurrency = (amount, from = 'IQD', to = 'USD') => {
  const fromCurrency = CURRENCIES[from];
  const toCurrency = CURRENCIES[to];
  
  if (!fromCurrency || !toCurrency) return amount;
  
  // Convert to IQD first, then to target currency
  const inIQD = amount * fromCurrency.rate;
  return inIQD / toCurrency.rate;
};

/**
 * Parse price string to number
 * @param {string} priceString - Price string to parse
 * @returns {number} Parsed number
 */
export const parsePrice = (priceString) => {
  if (typeof priceString === 'number') return priceString;
  if (!priceString) return 0;
  
  // Remove currency symbols and spaces
  const cleaned = priceString.replace(/[^\d.-]/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Set the current currency (saves to localStorage and refreshes cache)
 * @param {string} currencyCode - Currency code (IQD, USD, etc.)
 */
export const setCurrency = (currencyCode) => {
  if (CURRENCIES[currencyCode]) {
    localStorage.setItem('app_currency', currencyCode);
    refreshCurrencyCache();
    // إرسال حدث مخصص لإعلام المكونات بتغيير العملة
    window.dispatchEvent(new CustomEvent('currencyChanged', { detail: currencyCode }));
  }
};

/**
 * Get current currency code
 * @returns {string} Currency code
 */
export const getCurrencyCode = () => {
  return getCurrentCurrency().code;
};

/**
 * Get current currency info
 * @returns {object} Currency object with code, name, symbol, rate, decimals
 */
export const getCurrencyInfo = () => {
  return getCurrentCurrency();
};

export default {
  formatPrice,
  formatPriceCompact,
  convertCurrency,
  parsePrice,
  setCurrency,
  getCurrencyCode,
  getCurrencyInfo,
  refreshCurrencyCache,
  CURRENCIES,
};
