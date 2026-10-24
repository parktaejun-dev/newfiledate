import { renderToString } from 'react-dom/server';
import App from './App';
import { translations, type Language } from './lib/i18n';

/** Render the app to static HTML for the given language (build-time only). */
export function render(lang: Language): string {
  return renderToString(<App initialLang={lang} />);
}

/**
 * FAQPage JSON-LD built from the same translation strings the app renders,
 * so the structured data always matches the visible FAQ text.
 */
export function faqJsonLd(lang: Language): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: translations[lang].faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  });
}
