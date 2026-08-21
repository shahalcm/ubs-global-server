const axios = require('axios');

// Supported target languages
const TARGET_LANGUAGES = [
  'ar', 'hi', 'ml', 'fr', 'es', 'de', 'zh', 'ja', 'ko', 'pt',
  'it', 'nl', 'bn', 'ta', 'te', 'kn', 'mr', 'gu', 'pa', 'id',
  'th', 'vi', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'he', 'fa'
];

/**
 * Translate a single text string from sourceLang to targetLang using MyMemory API with fallback
 */
async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || typeof text !== 'string' || !text.trim()) return text;
  if (targetLang === sourceLang) return text;

  try {
    const langPair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${encodeURIComponent(langPair)}`;
    const response = await axios.get(url, { timeout: 4000 });

    if (response.data && response.data.responseData && response.data.responseData.translatedText) {
      const translated = response.data.responseData.translatedText;
      if (translated && !translated.includes('MYMEMORY WARNING')) {
        return translated;
      }
    }
  } catch (err) {
    console.warn(`[AutoTranslator] Translation failed for '${text.substring(0, 15)}...' to ${targetLang}:`, err.message);
  }

  return text; // Return fallback text if API fails
}

/**
 * Generate full multilingual translations object for a set of fields
 * Example fieldsToTranslate: { title: "Summer Sale", description: "Big Discounts" }
 */
async function generateMultilingualFields(fieldsToTranslate, customLangs = TARGET_LANGUAGES) {
  const result = { en: { ...fieldsToTranslate } };

  if (!fieldsToTranslate || Object.keys(fieldsToTranslate).length === 0) {
    return result;
  }

  // Process target languages in parallel batches
  const langPromises = customLangs.map(async (lang) => {
    const translatedObj = {};
    for (const [key, val] of Object.entries(fieldsToTranslate)) {
      if (typeof val === 'string' && val.trim()) {
        translatedObj[key] = await translateText(val, lang);
      } else if (Array.isArray(val)) {
        translatedObj[key] = await Promise.all(
          val.map(item => typeof item === 'string' ? translateText(item, lang) : item)
        );
      } else {
        translatedObj[key] = val;
      }
    }
    return { lang, translatedObj };
  });

  const translationsArr = await Promise.all(langPromises);
  translationsArr.forEach(({ lang, translatedObj }) => {
    result[lang] = translatedObj;
  });

  return result;
}

module.exports = {
  TARGET_LANGUAGES,
  translateText,
  generateMultilingualFields
};
