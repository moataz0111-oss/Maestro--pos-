// Currency formatting utilities for Maestro EGP
// هذا الملف للتوافق مع الكود القديم - استخدم useCurrency() من CurrencyContext للتطبيقات الجديدة

// العملات المدعومة
export const CURRENCIES = {
  IQD: { code: 'IQD', name: 'دينار عراقي', symbol: 'د.ع', rate: 1, decimals: 0 },
  USD: { code: 'USD', name: 'دولار أمريكي', symbol: '$', rate: 1460, decimals: 2 },
  SAR: { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س', rate: 389, decimals: 2 },
  AED: { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ', rate: 398, decimals: 2 },
  EGP: { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م', rate: 30, decimals: 2 },
  JOD: { code: 'JOD', name: 'دينار أردني', symbol: 'د.أ', rate: 2060, decimals: 3 },
  KWD: { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك', rate: 4750, decimals: 3 },
  EUR: { code: 'EUR', name: 'يورو', symbol: '€', rate: 1580, decimals: 2 },
};

// جلب العملة من localStorage (للتوافق)
const getCurrentCurrency = () => {
  try {
    const saved = localStorage.getItem('app_currency');
    if (saved && CURRENCIES[saved]) {
      return CURRENCIES[saved];
    }
  } catch (e) {}
  return CURRENCIES.IQD;
};

/**
 * Format price with current system currency
 * @param {number} amount - Amount
 * @param {boolean} showSymbol - Whether to show currency symbol
 * @returns {string} Formatted price
 */
export const formatPrice = (amount, showSymbol = true) => {
  if (amount === null || amount === undefined || isNaN(amount)) return showSymbol ? '0 د.ع' : '0';
  
  const currency = getCurrentCurrency();
  
  const formatted = new Intl.NumberFormat('ar-IQ', {
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
 * Set the current currency (saves to localStorage)
 * @param {string} currencyCode - Currency code (IQD, USD, etc.)
 */
export const setCurrency = (currencyCode) => {
  if (CURRENCIES[currencyCode]) {
    localStorage.setItem('app_currency', currencyCode);
  }
};

export default {
  formatPrice,
  formatPriceCompact,
  convertCurrency,
  parsePrice,
  setCurrency,
  CURRENCIES,
};
