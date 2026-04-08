import React, { useState, useEffect } from 'react';
import AdminPanel from './components/AdminPanel';
import { supabase } from './services/supabaseClient';
import './App.css';

function AdminApp() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [localization, setLocalization] = useState({});

  useEffect(() => {
    const initialize = async () => {
      try {
        // Verificar autenticação e permissão de admin
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: adminCheck } = await supabase.rpc('is_user_admin', { p_user_id: user.id });
          if (adminCheck === true) {
            setIsAdmin(true);
          }
        }

        // Carregar localização
        const response = await fetch('/LocalizationPortuguese.json');
        const data = await response.json();
        setLocalization(data);
      } catch (error) {
        console.error('Erro ao inicializar painel admin:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  if (loading) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center text-white">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">{localization['UI.Loading'] || 'UI.Loading'}</span>
          </div>
          <p className="mt-3">{localization['UI.Loading.AdminPanel'] || 'UI.Loading.AdminPanel'}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center text-white">
          <h2>Acesso Negado</h2>
          <p>Você não tem permissão para acessar o painel administrativo.</p>
          <a href="/" className="btn btn-outline-light mt-3">Voltar ao Jogo</a>
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
            alt="Kill or Die" 
            className="img-fluid rounded mx-auto d-block my-3"
            style={{maxHeight: '200px'}} 
          />
          <h2 className="text-white">{localization['UI.Admin.Title'] || 'UI.Admin.Title'}</h2>
          <p className="text-light">{localization['UI.Admin.Description'] || 'UI.Admin.Description'}</p>
        </div>
      </div>
      
      <div className="row">
        <div className="col-12">
          <AdminPanel localization={localization} />
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-12 text-center">
          <a 
            href="/" 
            className="btn btn-outline-light"
          >
            {localization['UI.Admin.BackToGame'] || 'UI.Admin.BackToGame'}
          </a>
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-12">
          <div className="alert alert-warning" role="alert">
            <strong>{localization['UI.Admin.RestrictedPage'] || 'UI.Admin.RestrictedPage'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminApp;
