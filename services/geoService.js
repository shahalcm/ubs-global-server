const axios = require('axios')

// Country Code to Currency & Geo Metadata Mapping
const COUNTRY_GEO_MAP = {
  IN: { countryName: 'India', currencyCode: 'INR', currencySymbol: '₹', timezone: 'Asia/Kolkata', defaultGateway: 'razorpay' },
  US: { countryName: 'United States', currencyCode: 'USD', currencySymbol: '$', timezone: 'America/New_York', defaultGateway: 'stripe' },
  DE: { countryName: 'Germany', currencyCode: 'EUR', currencySymbol: '€', timezone: 'Europe/Berlin', defaultGateway: 'stripe' },
  GB: { countryName: 'United Kingdom', currencyCode: 'GBP', currencySymbol: '£', timezone: 'Europe/London', defaultGateway: 'stripe' },
  AE: { countryName: 'United Arab Emirates', currencyCode: 'AED', currencySymbol: 'AED', timezone: 'Asia/Dubai', defaultGateway: 'stripe' },
  CA: { countryName: 'Canada', currencyCode: 'CAD', currencySymbol: 'CA$', timezone: 'America/Toronto', defaultGateway: 'stripe' },
  AU: { countryName: 'Australia', currencyCode: 'AUD', currencySymbol: 'A$', timezone: 'Australia/Sydney', defaultGateway: 'stripe' },
  SG: { countryName: 'Singapore', currencyCode: 'SGD', currencySymbol: 'S$', timezone: 'Asia/Singapore', defaultGateway: 'stripe' },
  JP: { countryName: 'Japan', currencyCode: 'JPY', currencySymbol: '¥', timezone: 'Asia/Tokyo', defaultGateway: 'stripe' },
  MY: { countryName: 'Malaysia', currencyCode: 'MYR', currencySymbol: 'RM', timezone: 'Asia/Kuala_Lumpur', defaultGateway: 'stripe' },
  SA: { countryName: 'Saudi Arabia', currencyCode: 'SAR', currencySymbol: 'SAR', timezone: 'Asia/Riyadh', defaultGateway: 'stripe' },
  QA: { countryName: 'Qatar', currencyCode: 'QAR', currencySymbol: 'QAR', timezone: 'Asia/Qatar', defaultGateway: 'stripe' },
  CN: { countryName: 'China', currencyCode: 'CNY', currencySymbol: 'CN¥', timezone: 'Asia/Shanghai', defaultGateway: 'stripe' }
}

const DEFAULT_GEO = COUNTRY_GEO_MAP['US']

/**
 * Get Geo metadata for a country code
 */
const getGeoByCountryCode = (countryCode) => {
  const code = (countryCode || 'US').toUpperCase()
  return COUNTRY_GEO_MAP[code] || {
    countryName: countryCode || 'United States',
    currencyCode: 'USD',
    currencySymbol: '$',
    timezone: 'UTC',
    defaultGateway: 'stripe'
  }
}

/**
 * Detect location from IP address using free IP Geolocation APIs
 */
const detectLocationFromIP = async (ipAddress) => {
  try {
    const cleanIP = (ipAddress || '').replace('::ffff:', '').trim()
    if (!cleanIP || cleanIP === '127.0.0.1' || cleanIP === 'localhost') {
      return { ...DEFAULT_GEO, countryCode: 'US', ip: cleanIP || '127.0.0.1' }
    }

    const res = await axios.get(`http://ip-api.com/json/${cleanIP}`, { timeout: 3000 }).catch(async () => {
      return await axios.get(`https://ipapi.co/${cleanIP}/json/`, { timeout: 3000 })
    })

    if (res?.data) {
      const countryCode = (res.data.countryCode || res.data.country_code || 'US').toUpperCase()
      const geoMeta = getGeoByCountryCode(countryCode)
      return {
        countryCode,
        countryName: res.data.country || res.data.country_name || geoMeta.countryName,
        currencyCode: res.data.currency || geoMeta.currencyCode,
        currencySymbol: geoMeta.currencySymbol,
        timezone: res.data.timezone || geoMeta.timezone,
        lat: res.data.lat || res.data.latitude || 0,
        lng: res.data.lon || res.data.longitude || 0,
        ip: cleanIP
      }
    }
  } catch (error) {
    console.warn('⚠️ IP Geolocation fallback triggered:', error.message)
  }

  return { ...DEFAULT_GEO, countryCode: 'US' }
}

module.exports = {
  COUNTRY_GEO_MAP,
  DEFAULT_GEO,
  getGeoByCountryCode,
  detectLocationFromIP
}
