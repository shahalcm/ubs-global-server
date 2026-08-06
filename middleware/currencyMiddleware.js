const currencyService = require('../services/currencyService')
const geoService = require('../services/geoService')

const currencyMiddleware = async (req, res, next) => {
  try {
    const rates = await currencyService.getExchangeRates()
    req.exchangeRates = rates

    // Extract currency & country from headers or user profile
    const headerCurrency = req.headers['x-currency']
    const headerCountry = req.headers['x-country']

    if (headerCurrency) {
      req.currency = headerCurrency.toUpperCase()
    } else if (req.user?.currencyCode) {
      req.currency = req.user.currencyCode.toUpperCase()
    } else {
      req.currency = 'USD'
    }

    if (headerCountry) {
      req.country = headerCountry.toUpperCase()
    } else if (req.user?.countryCode) {
      req.country = req.user.countryCode.toUpperCase()
    } else {
      req.country = 'US'
    }

  } catch (error) {
    req.exchangeRates = currencyService.DEFAULT_RATES
    req.currency = 'USD'
    req.country = 'US'
  }

  next()
}

module.exports = currencyMiddleware
