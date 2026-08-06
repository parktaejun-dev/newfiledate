(function () {
  const btn = document.getElementById('toggle-lang-btn');
  const secKo = document.getElementById('sec-ko');
  const secEn = document.getElementById('sec-en');

  if (!btn || !secKo || !secEn) return;

  function setLanguage(lang) {
    if (lang === 'en') {
      secKo.classList.remove('active');
      secEn.classList.add('active');
      btn.textContent = '🌐 한국어 (KO)';
      document.documentElement.lang = 'en';
    } else {
      secEn.classList.remove('active');
      secKo.classList.add('active');
      btn.textContent = '🌐 English (EN)';
      document.documentElement.lang = 'ko';
    }
  }

  // Detect initial language from URL ?lang=en or browser navigator
  const urlParams = new URLSearchParams(window.location.search);
  const paramLang = urlParams.get('lang');
  let currentLang = 'ko';

  if (paramLang === 'en' || paramLang === 'ko') {
    currentLang = paramLang;
  } else if (typeof navigator !== 'undefined' && navigator.language && !navigator.language.toLowerCase().startsWith('ko')) {
    currentLang = 'en';
  }

  setLanguage(currentLang);

  btn.addEventListener('click', function () {
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    setLanguage(currentLang);
  });
})();
