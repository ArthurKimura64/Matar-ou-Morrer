/**
 * Utilitário de validação de entrada para segurança.
 * Todas as entradas de usuário devem passar por estas funções antes de
 * serem enviadas ao banco de dados.
 */

// Regex: letras (incluindo acentuadas), números, espaços, hífens, underscores
const SAFE_NAME_REGEX = /^[a-zA-Z0-9\u00C0-\u017F\s\-_]+$/;

// Caracteres perigosos para injeção
const DANGEROUS_CHARS_REGEX = /[<>'"`;\\]/;

/**
 * Valida e sanitiza um nome de jogador.
 * @param {string} name - Nome a validar
 * @param {number} maxLength - Comprimento máximo (padrão 50)
 * @returns {{ valid: boolean, sanitized: string, error: string|null }}
 */
export function validatePlayerName(name, maxLength = 50) {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: 'Nome é obrigatório' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Nome não pode ser vazio' };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, sanitized: '', error: `Nome deve ter no máximo ${maxLength} caracteres` };
  }

  if (trimmed.length < 2) {
    return { valid: false, sanitized: '', error: 'Nome deve ter pelo menos 2 caracteres' };
  }

  if (DANGEROUS_CHARS_REGEX.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Nome contém caracteres não permitidos' };
  }

  if (!SAFE_NAME_REGEX.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Nome contém caracteres inválidos' };
  }

  // Rejeitar espaços consecutivos excessivos
  if (/\s{3,}/.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Nome contém espaços excessivos' };
  }

  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Valida e sanitiza um nome de sala.
 * @param {string} name - Nome da sala
 * @param {number} maxLength - Comprimento máximo (padrão 100)
 * @returns {{ valid: boolean, sanitized: string, error: string|null }}
 */
export function validateRoomName(name, maxLength = 100) {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: 'Nome da sala é obrigatório' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, sanitized: '', error: 'Nome da sala não pode ser vazio' };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, sanitized: '', error: `Nome da sala deve ter no máximo ${maxLength} caracteres` };
  }

  if (DANGEROUS_CHARS_REGEX.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Nome da sala contém caracteres não permitidos' };
  }

  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Valida um código de sala (6 dígitos numéricos).
 * @param {string} roomId
 * @returns {{ valid: boolean, sanitized: string, error: string|null }}
 */
export function validateRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return { valid: false, sanitized: '', error: 'Código da sala é obrigatório' };
  }

  const trimmed = roomId.trim();

  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Código da sala deve ter exatamente 6 dígitos' };
  }

  return { valid: true, sanitized: trimmed, error: null };
}

/**
 * Valida um valor de contador (numérico, dentro de limites).
 * @param {*} value - Valor do contador
 * @param {number} min - Valor mínimo (padrão 0)
 * @param {number} max - Valor máximo (padrão 999)
 * @returns {{ valid: boolean, value: number, error: string|null }}
 */
export function validateCounterValue(value, min = 0, max = 999) {
  const num = Number(value);

  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: 0, error: 'Valor deve ser numérico' };
  }

  if (!Number.isInteger(num)) {
    return { valid: false, value: 0, error: 'Valor deve ser inteiro' };
  }

  if (num < min || num > max) {
    return { valid: false, value: 0, error: `Valor deve estar entre ${min} e ${max}` };
  }

  return { valid: true, value: num, error: null };
}

/**
 * Valida dados JSONB antes de enviar ao banco.
 * Rejeita payloads muito grandes ou com profundidade excessiva.
 * @param {*} data - Dados a validar
 * @param {number} maxSize - Tamanho máximo em bytes (padrão 50KB)
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateJsonData(data, maxSize = 50000) {
  if (data === null || data === undefined) {
    return { valid: true, error: null };
  }

  try {
    const serialized = JSON.stringify(data);
    if (serialized.length > maxSize) {
      return { valid: false, error: `Dados JSON excedem o tamanho máximo de ${Math.round(maxSize / 1024)}KB` };
    }
  } catch {
    return { valid: false, error: 'Dados JSON inválidos' };
  }

  return { valid: true, error: null };
}

/**
 * Escapa texto para uso seguro em HTML (quando dangerouslySetInnerHTML não puder ser evitado).
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (!text || typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
