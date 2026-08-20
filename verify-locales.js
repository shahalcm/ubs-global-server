const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'client', 'i18n'),
  path.join(__dirname, '..', 'global-web', 'public', 'locales'),
  path.join(__dirname, '..', 'admin', 'src', 'locales')
];

const requiredLangs = [
  'en', 'ar', 'hi', 'ml', 'fr', 'es', 'de', 'zh', 'ja', 'ur', 'tr', 'ru',
  'ko', 'pt', 'it', 'nl', 'bn', 'ta', 'te', 'kn', 'mr', 'gu', 'pa', 'id',
  'th', 'vi', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'he', 'fa'
];

let totalValid = 0;
let errors = [];

dirs.forEach(dir => {
  requiredLangs.forEach(lang => {
    const file = path.join(dir, `${lang}.json`);
    if (!fs.existsSync(file)) {
      errors.push(`Missing file: ${file}`);
    } else {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof parsed !== 'object') {
          errors.push(`Invalid JSON object in ${file}`);
        } else {
          totalValid++;
        }
      } catch (e) {
        errors.push(`JSON syntax error in ${file}: ${e.message}`);
      }
    }
  });
});

console.log(`Verification Complete: ${totalValid}/${dirs.length * requiredLangs.length} locale JSON files validated successfully.`);
if (errors.length > 0) {
  console.error(`Errors found:`, errors);
  process.exit(1);
} else {
  console.log('All 34 language locale JSON files across Mobile, Web, and Admin passed verification!');
}
