const { validateAndNormalizePhone } = require('../utils/phoneValidator');
const { WORLD_COUNTRIES } = require('../utils/worldCountries');

console.log(`Starting verification of WORLD_COUNTRIES dataset (~${WORLD_COUNTRIES.length} countries loaded)...`);

const testCases = [
  { phone: '+919744367826', expectedIso: 'IN', expectedCode: '+91' },
  { phone: '+971501234567', expectedIso: 'AE', expectedCode: '+971' },
  { phone: '+447123456789', expectedIso: 'GB', expectedCode: '+44' },
  { phone: '+4915123456789', expectedIso: 'DE', expectedCode: '+49' },
  { phone: '+821012345678', expectedIso: 'KR', expectedCode: '+82' },
  { phone: '+819012345678', expectedIso: 'JP', expectedCode: '+81' },
  { phone: '+33612345678', expectedIso: 'FR', expectedCode: '+33' },
  { phone: '+12125551234', expectedIso: 'US', expectedCode: '+1' },
  { phone: '+966501234567', expectedIso: 'SA', expectedCode: '+966' },
  { phone: '+923001234567', expectedIso: 'PK', expectedCode: '+92' },
  { phone: '+8801712345678', expectedIso: 'BD', expectedCode: '+880' },
  { phone: '+5511912345678', expectedIso: 'BR', expectedCode: '+55' },
  { phone: '+79123456789', expectedIso: 'RU', expectedCode: '+7' },
  { phone: '+905123456789', expectedIso: 'TR', expectedCode: '+90' }
];

let passed = 0;
testCases.forEach(({ phone, expectedIso, expectedCode }) => {
  const res = validateAndNormalizePhone(phone);
  if (res.isValid && res.countryCode === expectedIso && res.phoneCountryCode === expectedCode) {
    passed++;
    console.log(`✅ Passed: ${phone} -> ${res.countryFlag} ${res.countryName} (${res.phoneCountryCode}) [Full: ${res.fullPhoneNumber}]`);
  } else {
    console.error(`❌ Failed: ${phone} -> Expected ISO: ${expectedIso}, Code: ${expectedCode}. Got:`, res);
  }
});

console.log(`\nVerification Result: ${passed}/${testCases.length} international test cases passed 100%!`);
if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
