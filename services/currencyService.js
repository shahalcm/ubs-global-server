const axios = require('axios')
const ExchangeRate = require('../models/ExchangeRate')

// Supported Currencies & Baseline Default Rates (vs 1 USD)
const DEFAULT_RATES = {
  USD: 1.0,
  INR: 87.0,
  EUR: 0.92,
  GBP: 0.78,
  AED: 3.67,
  CAD: 1.38,
  AUD: 1.54,
  SGD: 1.34,
  JPY: 148.5,
  MYR: 4.45,
  SAR: 3.75,
  QAR: 3.64,
  CNY: 7.22
}

// Currency Symbol & Locale Map
const CURRENCY_METADATA = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  AED: { symbol: 'AED', name: 'UAE Dirham', locale: 'ar-AE' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY' },
  SAR: { symbol: 'SAR', name: 'Saudi Riyal', locale: 'ar-SA' },
  QAR: { symbol: 'QAR', name: 'Qatari Riyal', locale: 'ar-QA' },
  CNY: { symbol: 'CN¥', name: 'Chinese Yuan', locale: 'zh-CN' }
}

let inMemoryRates = { ...DEFAULT_RATES }
let lastFetchTime = null

/**
 * Fetch and cache exchange rates
 */
const fetchLatestRates = async () => {
  try {
    // Check MongoDB for valid unexpired cache (<24 hours old)
    const cached = await ExchangeRate.findOne({ baseCurrency: 'USD' }).sort({ createdAt: -1 })
    if (cached && cached.expiresAt > new Date()) {
      const ratesMap = Object.fromEntries(cached.rates)
      inMemoryRates = { ...DEFAULT_RATES, ...ratesMap }
      lastFetchTime = cached.fetchedAt
      return inMemoryRates
    }

    // Otherwise fetch fresh from API
    console.log('🔄 Fetching live exchange rates from Exchange Rate API...')
    const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 }).catch(async () => {
      return await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 5000 })
    })

    if (res?.data?.rates) {
      const liveRates = res.data.rates
      const mergedRates = { ...DEFAULT_RATES }
      Object.keys(DEFAULT_RATES).forEach(code => {
        if (liveRates[code]) {
          mergedRates[code] = liveRates[code]
        }
      })

      inMemoryRates = mergedRates
      lastFetchTime = new Date()

      // Save to MongoDB with 24-hour expiration
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await ExchangeRate.create({
        baseCurrency: 'USD',
        rates: mergedRates,
        fetchedAt: lastFetchTime,
        expiresAt
      }).catch(err => console.warn('Failed to save exchange rates to DB:', err.message))

      console.log('✅ Exchange rates updated & cached for 24h!')
      return inMemoryRates
    }
  } catch (error) {
    console.warn('⚠️ Exchange rate API fetch warning, using fallback rates:', error.message)
  }

  return inMemoryRates
}

/**
 * Get current rates object
 */
const getExchangeRates = async () => {
  if (!lastFetchTime || (Date.now() - new Date(lastFetchTime).getTime() > 6 * 60 * 60 * 1000)) {
    await fetchLatestRates()
  }
  return inMemoryRates
}

/**
 * Convert USD amount to target currency
 */
const convertAmount = (amountUSD, targetCurrency = 'USD', rates = inMemoryRates) => {
  const num = Number(amountUSD) || 0
  const code = (targetCurrency || 'USD').toUpperCase()
  const rate = rates[code] || DEFAULT_RATES[code] || 1.0
  return Number((num * rate).toFixed(2))
}

/**
 * Format currency amount with symbol & locale
 */
const formatCurrency = (amount, currencyCode = 'USD', rates = inMemoryRates) => {
  const code = (currencyCode || 'USD').toUpperCase()
  const meta = CURRENCY_METADATA[code] || { symbol: code, locale: 'en-US' }
  const convertedAmount = convertAmount(amount, code, rates)

  try {
    return new Intl.NumberFormat(meta.locale || 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'JPY' ? 0 : 2,
      minimumFractionDigits: code === 'JPY' ? 0 : 2
    }).format(convertedAmount)
  } catch (err) {
    return `${meta.symbol}${convertedAmount.toFixed(2)}`
  }
}

module.exports = {
  DEFAULT_RATES,
  CURRENCY_METADATA,
  fetchLatestRates,
  getExchangeRates,
  convertAmount,
  formatCurrency
}
