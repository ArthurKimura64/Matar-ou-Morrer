import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML para uso seguro com dangerouslySetInnerHTML.
 * Permite apenas tags de formatação seguras (negrito, itálico, parágrafos, etc.)
 * e remove scripts, event handlers e conteúdo perigoso.
 * 
 * @param {string} html - HTML a ser sanitizado
 * @returns {string} HTML seguro
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'small', 'hr'],
    ALLOWED_ATTR: ['class', 'style'],
  });
}

/**
 * Cria props seguras para dangerouslySetInnerHTML.
 * Uso: <div {...safeInnerHtml(htmlString)} />
 * 
 * @param {string} html - HTML a ser sanitizado
 * @returns {{ dangerouslySetInnerHTML: { __html: string } }}
 */
export function safeInnerHtml(html) {
  return { dangerouslySetInnerHTML: { __html: sanitizeHtml(html) } };
}
