const { WORLD_COUNTRIES, findCountryByDialCode, findCountryByIso } = require('./worldCountries');

/**
 * Validate and normalize international phone number to canonical E.164 format
 * Handles formats like:
 * - "+919744367826"
 * - "+971 50 123 4567"
 * - dialCode="+91", subscriberNumber="9744367826"
 */
function validateAndNormalizePhone(phoneInput, dialCodeInput = '') {
  if (!phoneInput) {
    return { isValid: false, message: 'Phone number is required' };
  }

  let raw = String(phoneInput).trim();
  let dialCode = String(dialCodeInput || '').trim();

  // If raw starts with '+', extract country dial code from string
  if (raw.startsWith('+')) {
    const digitsOnly = raw.replace(/[^\d+]/g, '');
    let matchedCountry = null;

    // Sort countries by dial code length descending to match +1268 before +1
    const sortedCountries = [...WORLD_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    for (const country of sortedCountries) {
      if (digitsOnly.startsWith(country.code)) {
        matchedCountry = country;
        dialCode = country.code;
        const subscriber = digitsOnly.substring(country.code.length);
        const fullPhoneNumber = `${country.code}${subscriber}`;

        const isDigitsValid = /^\d{7,15}$/.test(subscriber);
        return {
          isValid: isDigitsValid,
          fullPhoneNumber,
          phoneNumber: subscriber,
          phoneCountryCode: country.code,
          countryCode: country.iso,
          countryName: country.name,
          countryFlag: country.flag,
          preferredLanguage: country.lang,
          message: isDigitsValid ? 'Valid phone number' : 'Invalid subscriber number length'
        };
      }
    }
  }

  // If dialCode was passed separately
  if (!dialCode.startsWith('+')) {
    dialCode = dialCode ? `+${dialCode}` : '+91';
  }

  const country = findCountryByDialCode(dialCode);
  const subscriberDigits = raw.replace(/\D/g, '');
  const fullPhoneNumber = `${country.code}${subscriberDigits}`;

  const isDigitsValid = subscriberDigits.length >= (country.minLen || 7) && subscriberDigits.length <= (country.maxLen || 15);

  return {
    isValid: isDigitsValid,
    fullPhoneNumber,
    phoneNumber: subscriberDigits,
    phoneCountryCode: country.code,
    countryCode: country.iso,
    countryName: country.name,
    countryFlag: country.flag,
    preferredLanguage: country.lang,
    message: isDigitsValid ? 'Valid phone number' : `Subscriber number must be ${country.minLen || 7}-${country.maxLen || 15} digits`
  };
}

module.exports = {
  validateAndNormalizePhone
};
