const Country = require('../models/Country')
const RegionalPricingRule = require('../models/RegionalPricingRule')
const PromoCode = require('../models/PromoCode')

const seedPricingData = async () => {
  try {
    // 1. Seed Pricing Rules
    const existingRules = await RegionalPricingRule.countDocuments()
    if (existingRules === 0) {
      console.log('🌱 Seeding Regional Pricing Rules...')
      
      const rules = [
        {
          name: 'High Cost Countries',
          regionCode: 'HIGH_COST',
          countries: ['US', 'GB', 'DE', 'CA', 'AU', 'SG', 'JP', 'FR', 'ES'],
          baseAmount: 200,
          currency: 'USD',
          discountType: 'percentage',
          discountValue: 0,
          isActive: true
        },
        {
          name: 'Middle Cost Countries',
          regionCode: 'MIDDLE_COST',
          countries: ['AE', 'SA', 'QA', 'MY', 'CN'],
          baseAmount: 200,
          currency: 'USD',
          discountType: 'percentage',
          discountValue: 40,
          isActive: true
        },
        {
          name: 'Low Cost Countries',
          regionCode: 'LOW_COST',
          countries: ['IN', 'PK', 'BD'],
          baseAmount: 200,
          currency: 'USD',
          discountType: 'percentage',
          discountValue: 60,
          isActive: true
        }
      ]
      
      await RegionalPricingRule.insertMany(rules)
      console.log('✅ Regional Pricing Rules seeded successfully!')
    }

    // 2. Seed Promo Codes
    const existingPromos = await PromoCode.countDocuments()
    if (existingPromos === 0) {
      console.log('🌱 Seeding Promo Codes...')
      
      // Get the rules to assign promoCodeId
      const middleRule = await RegionalPricingRule.findOne({ regionCode: 'MIDDLE_COST' })
      const lowRule = await RegionalPricingRule.findOne({ regionCode: 'LOW_COST' })

      const promoMiddle = await PromoCode.create({
        code: 'UBSMIDDLE40',
        discountType: 'percentage',
        discountValue: 40,
        regionCode: 'MIDDLE_COST',
        maxUses: 10000,
        usedCount: 0,
        maxUsesPerSeller: 1,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      })

      const promoLow = await PromoCode.create({
        code: 'UBSLOW60',
        discountType: 'percentage',
        discountValue: 60,
        regionCode: 'LOW_COST',
        maxUses: 10000,
        usedCount: 0,
        maxUsesPerSeller: 1,
        isActive: true,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
      })

      if (middleRule) {
        middleRule.promoCodeId = promoMiddle._id
        await middleRule.save()
      }
      if (lowRule) {
        lowRule.promoCodeId = promoLow._id
        await lowRule.save()
      }

      console.log('✅ Promo Codes seeded successfully!')
    }

    // 3. Seed Countries Mapping
    const existingCountries = await Country.countDocuments()
    if (existingCountries === 0) {
      console.log('🌱 Seeding Countries...')
      
      const countries = [
        { countryCode: 'IN', countryName: 'India', regionCode: 'LOW_COST', isActive: true },
        { countryCode: 'PK', countryName: 'Pakistan', regionCode: 'LOW_COST', isActive: true },
        { countryCode: 'BD', countryName: 'Bangladesh', regionCode: 'LOW_COST', isActive: true },
        { countryCode: 'US', countryName: 'United States', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'GB', countryName: 'United Kingdom', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'DE', countryName: 'Germany', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'CA', countryName: 'Canada', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'AU', countryName: 'Australia', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'SG', countryName: 'Singapore', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'JP', countryName: 'Japan', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'FR', countryName: 'France', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'ES', countryName: 'Spain', regionCode: 'HIGH_COST', isActive: true },
        { countryCode: 'AE', countryName: 'United Arab Emirates', regionCode: 'MIDDLE_COST', isActive: true },
        { countryCode: 'SA', countryName: 'Saudi Arabia', regionCode: 'MIDDLE_COST', isActive: true },
        { countryCode: 'QA', countryName: 'Qatar', regionCode: 'MIDDLE_COST', isActive: true },
        { countryCode: 'MY', countryName: 'Malaysia', regionCode: 'MIDDLE_COST', isActive: true },
        { countryCode: 'CN', countryName: 'China', regionCode: 'MIDDLE_COST', isActive: true }
      ]
      
      await Country.insertMany(countries)
      console.log('✅ Country-region mappings seeded successfully!')
    }
  } catch (error) {
    console.error('❌ Error during pricing/promo seeding:', error.message || error)
  }
}

module.exports = seedPricingData
