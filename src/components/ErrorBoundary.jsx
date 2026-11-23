import React from 'react';
import { PlayerPersistence } from '../utils/playerPersistence';

/**
 * Captura erros inesperados na árvore React para evitar tela branca travada.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado na interface.'
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    PlayerPersistence.clearPlayerData();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="container-fluid d-flex justify-content-center align-items-center vh-100">
          <section className="card bg-dark border-danger p-4 text-center" style={{ maxWidth: '480px', width: '92%' }}>
            <div style={{ fontSize: '2.5rem' }} aria-hidden="true">⚠️</div>
            <h4 className="text-danger fw-bold mt-2 mb-2">Ops! Algo deu errado</h4>
            <p className="text-light small mb-3">
              Ocorreu um erro inesperado na tela. Você pode tentar recarregar o jogo normalmente.
            </p>
            <div className="alert alert-dark text-muted small text-start mb-3" style={{ wordBreak: 'break-word' }}>
              <code>{this.state.errorMessage}</code>
            </div>
            <div className="d-grid gap-2">
              <button type="button" className="btn btn-primary" onClick={this.handleReload}>
                🔄 Recarregar Jogo
              </button>
              <button
                type="button"
                className="btn btn-outline-warning btn-sm"
                onClick={this.handleResetAndReload}
              >
                🧹 Limpar dados da sala local e recarregar
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;