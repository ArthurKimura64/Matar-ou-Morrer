import React, { useState, useEffect } from 'react';
import AdminPanel from './components/AdminPanel';
import './App.css';

function AdminApp() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simular carregamento
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center text-white">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
          <p className="mt-3">Carregando painel de administração...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12 text-center mb-4">
          <img 
            src="KillOrDieLogo.png"
            alt="Matar ou Morrer" 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{maxHeight: '200px'}} 
          />
          <h2 className="text-white">Painel de Administração</h2>
          <p className="text-light">Sistema de monitoramento e limpeza</p>
        </div>
      </div>
      
      <div className="row">
        <div className="col-12">
          <AdminPanel />
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-12 text-center">
          <a 
            href="/" 
            className="btn btn-outline-light"
          >
            ← Voltar ao Jogo Principal
          </a>
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-12">
          <div className="alert alert-warning" role="alert">
            <strong>⚠️ Página Restrita:</strong> Esta página é destinada apenas para administradores do sistema.
            Use com cuidado ao executar limpezas manuais.
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminApp;
