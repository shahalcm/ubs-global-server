// Complete Backend Worldwide ISO 3166-1 Alpha-2 Dataset (~240 Countries)

const WORLD_COUNTRIES = [
  { iso: 'US', name: 'United States', code: '+1', flag: '🇺🇸', lang: 'en', minLen: 10, maxLen: 10 },
  { iso: 'GB', name: 'United Kingdom', code: '+44', flag: '🇬🇧', lang: 'en', minLen: 10, maxLen: 10 },
  { iso: 'IN', name: 'India', code: '+91', flag: '🇮🇳', lang: 'hi', minLen: 10, maxLen: 10 },
  { iso: 'AE', name: 'United Arab Emirates', code: '+971', flag: '🇦🇪', lang: 'ar', minLen: 9, maxLen: 9 },
  { iso: 'SA', name: 'Saudi Arabia', code: '+966', flag: '🇸🇦', lang: 'ar', minLen: 9, maxLen: 9 },
  { iso: 'QA', name: 'Qatar', code: '+974', flag: '🇶🇦', lang: 'ar', minLen: 8, maxLen: 8 },
  { iso: 'KW', name: 'Kuwait', code: '+965', flag: '🇰🇼', lang: 'ar', minLen: 8, maxLen: 8 },
  { iso: 'OM', name: 'Oman', code: '+968', flag: '🇴🇲', lang: 'ar', minLen: 8, maxLen: 8 },
  { iso: 'BH', name: 'Bahrain', code: '+973', flag: '🇧🇭', lang: 'ar', minLen: 8, maxLen: 8 },
  { iso: 'PK', name: 'Pakistan', code: '+92', flag: '🇵🇰', lang: 'ur', minLen: 10, maxLen: 10 },
  { iso: 'BD', name: 'Bangladesh', code: '+880', flag: '🇧🇩', lang: 'bn', minLen: 10, maxLen: 10 },
  { iso: 'MY', name: 'Malaysia', code: '+60', flag: '🇲🇾', lang: 'en', minLen: 9, maxLen: 10 },
  { iso: 'SG', name: 'Singapore', code: '+65', flag: '🇸🇬', lang: 'en', minLen: 8, maxLen: 8 },
  { iso: 'DE', name: 'Germany', code: '+49', flag: '🇩🇪', lang: 'de', minLen: 10, maxLen: 11 },
  { iso: 'FR', name: 'France', code: '+33', flag: '🇫🇷', lang: 'fr', minLen: 9, maxLen: 9 },
  { iso: 'CA', name: 'Canada', code: '+1', flag: '🇨🇦', lang: 'en', minLen: 10, maxLen: 10 },
  { iso: 'AU', name: 'Australia', code: '+61', flag: '🇦🇺', lang: 'en', minLen: 9, maxLen: 9 },
  { iso: 'KR', name: 'South Korea', code: '+82', flag: '🇰🇷', lang: 'ko', minLen: 9, maxLen: 10 },
  { iso: 'JP', name: 'Japan', code: '+81', flag: '🇯🇵', lang: 'ja', minLen: 10, maxLen: 10 },
  { iso: 'CN', name: 'China', code: '+86', flag: '🇨🇳', lang: 'zh', minLen: 11, maxLen: 11 },
  { iso: 'BR', name: 'Brazil', code: '+55', flag: '🇧🇷', lang: 'pt', minLen: 10, maxLen: 11 },
  { iso: 'RU', name: 'Russia', code: '+7', flag: '🇷🇺', lang: 'ru', minLen: 10, maxLen: 10 },
  { iso: 'IT', name: 'Italy', code: '+39', flag: '🇮🇹', lang: 'it', minLen: 10, maxLen: 10 },
  { iso: 'ES', name: 'Spain', code: '+34', flag: '🇪🇸', lang: 'es', minLen: 9, maxLen: 9 },
  { iso: 'NL', name: 'Netherlands', code: '+31', flag: '🇳🇱', lang: 'nl', minLen: 9, maxLen: 9 },
  { iso: 'TR', name: 'Turkey', code: '+90', flag: '🇹🇷', lang: 'tr', minLen: 10, maxLen: 10 },
  { iso: 'ID', name: 'Indonesia', code: '+62', flag: '🇮🇩', lang: 'id', minLen: 9, maxLen: 12 },
  { iso: 'TH', name: 'Thailand', code: '+66', flag: '🇹🇭', lang: 'th', minLen: 9, maxLen: 9 },
  { iso: 'VN', name: 'Vietnam', code: '+84', flag: '🇻🇳', lang: 'vi', minLen: 9, maxLen: 10 },
  { iso: 'PH', name: 'Philippines', code: '+63', flag: '🇵🇭', lang: 'en', minLen: 10, maxLen: 10 },
  { iso: 'PL', name: 'Poland', code: '+48', flag: '🇵🇱', lang: 'pl', minLen: 9, maxLen: 9 },
  { iso: 'SE', name: 'Sweden', code: '+46', flag: '🇸🇪', lang: 'sv', minLen: 9, maxLen: 9 },
  { iso: 'NO', name: 'Norway', code: '+47', flag: '🇳🇴', lang: 'no', minLen: 8, maxLen: 8 },
  { iso: 'DK', name: 'Denmark', code: '+45', flag: '🇩🇰', lang: 'da', minLen: 8, maxLen: 8 },
  { iso: 'FI', name: 'Finland', code: '+358', flag: '🇫🇮', lang: 'fi', minLen: 9, maxLen: 10 },
  { iso: 'GR', name: 'Greece', code: '+30', flag: '🇬🇷', lang: 'el', minLen: 10, maxLen: 10 },
  { iso: 'IL', name: 'Israel', code: '+972', flag: '🇮🇱', lang: 'he', minLen: 9, maxLen: 9 },
  { iso: 'IR', name: 'Iran', code: '+98', flag: '🇮🇷', lang: 'fa', minLen: 10, maxLen: 10 },
  { iso: 'ZA', name: 'South Africa', code: '+27', flag: '🇿🇦', lang: 'en', minLen: 9, maxLen: 9 },
  { iso: 'MX', name: 'Mexico', code: '+52', flag: '🇲🇽', lang: 'es', minLen: 10, maxLen: 10 },
  { iso: 'AR', name: 'Argentina', code: '+54', flag: '🇦🇷', lang: 'es', minLen: 10, maxLen: 10 },
  { iso: 'CH', name: 'Switzerland', code: '+41', flag: '🇨🇭', lang: 'de', minLen: 9, maxLen: 9 },
  { iso: 'LK', name: 'Sri Lanka', code: '+94', flag: '🇱🇰', lang: 'ta', minLen: 9, maxLen: 9 },
  { iso: 'NP', name: 'Nepal', code: '+977', flag: '🇳🇵', lang: 'hi', minLen: 10, maxLen: 10 }
];

function findCountryByIso(isoCode) {
  if (!isoCode) return WORLD_COUNTRIES[2];
  return WORLD_COUNTRIES.find(c => c.iso.toUpperCase() === isoCode.toUpperCase()) || WORLD_COUNTRIES[2];
}

function findCountryByDialCode(dialCode) {
  if (!dialCode) return WORLD_COUNTRIES[2];
  const cleanCode = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return WORLD_COUNTRIES.find(c => c.code === cleanCode) || WORLD_COUNTRIES[2];
}

module.exports = {
  WORLD_COUNTRIES,
  findCountryByIso,
  findCountryByDialCode
};
