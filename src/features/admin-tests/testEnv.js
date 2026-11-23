/**
 * ============================================================================
 * DETECÇÃO DE AMBIENTE DE TESTE (testEnv.js)
 * ============================================================================
 * Retorna true apenas em ambiente local ou quando a variável de ambiente
 * REACT_APP_ENABLE_TEST_LAB=true estiver ativa (ex: Preview da Vercel).
 * Em produção, basta não definir essa variável e o laboratório some da UI.
 * ============================================================================
 */
export function isTestEnvironment() {
  if (process.env.REACT_APP_ENABLE_TEST_LAB === 'true') {
    return true;
  }

  if (typeof window === 'undefined') return false;

  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.local')
  );
}