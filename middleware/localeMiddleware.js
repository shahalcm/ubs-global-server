const RTL_LANGUAGES = ['ar', 'ur', 'fa', 'he']
const SUPPORTED_LANGUAGES = [
  'en', 'ar', 'hi', 'ml', 'fr', 'es', 'de', 'zh', 'ja', 'ur', 'tr', 'ru',
  'ko', 'pt', 'it', 'nl', 'bn', 'ta', 'te', 'kn', 'mr', 'gu', 'pa', 'id',
  'th', 'vi', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'he', 'fa'
]

const localeMiddleware = (req, res, next) => {
  try {
    let lang = 'en'

    const headerLang = req.headers['x-user-language'] || req.headers['accept-language']
    const queryLang = req.query?.lang

    if (queryLang && SUPPORTED_LANGUAGES.includes(queryLang.toLowerCase())) {
      lang = queryLang.toLowerCase()
    } else if (req.user?.language && SUPPORTED_LANGUAGES.includes(req.user.language.toLowerCase())) {
      lang = req.user.language.toLowerCase()
    } else if (headerLang) {
      const code = headerLang.split(',')[0].split('-')[0].trim().toLowerCase()
      if (SUPPORTED_LANGUAGES.includes(code)) {
        lang = code
      }
    }

    req.language = lang
    req.isRTL = RTL_LANGUAGES.includes(lang)
  } catch (error) {
    req.language = 'en'
    req.isRTL = false
  }

  next()
}

module.exports = localeMiddleware
