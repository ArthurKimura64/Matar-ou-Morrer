import React, { useState } from 'react';
import { RoomService } from '../services/roomService';
import { supabase } from '../services/supabaseClient';

const AdminPanel = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastCleanup, setLastCleanup] = useState(null);

  const getStats = async () => {
    setLoading(true);
    try {
      // Buscar estatísticas do banco
      const { count: playersCount } = await supabase
        .from('players')
        .select('*', { count: 'exact' });
      
      const { count: roomsCount } = await supabase
        .from('rooms')
        .select('*', { count: 'exact' });

      const { count: inactivePlayersCount } = await supabase
        .from('players')
        .select('*', { count: 'exact' })
        .lt('last_activity', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

      const { count: inactiveRoomsCount } = await supabase
        .from('rooms')
        .select('*', { count: 'exact' })
        .lt('last_activity', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

      setStats({
        totalPlayers: playersCount || 0,
        totalRooms: roomsCount || 0,
        inactivePlayers: inactivePlayersCount || 0,
        inactiveRooms: inactiveRoomsCount || 0
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeCleanup = async () => {
    setLoading(true);
    try {
      const result = await RoomService.cleanupOldData();
      if (result.success) {
        setLastCleanup(new Date().toLocaleString());
        // Atualizar estatísticas após limpeza
        await getStats();
        alert('Limpeza executada com sucesso!');
      } else {
        alert('Erro na limpeza: ' + result.error);
      }
    } catch (error) {
      console.error('Erro ao executar limpeza:', error);
      alert('Erro ao executar limpeza: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    getStats();
  }, []);

  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      margin: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h2 style={{ color: '#333', marginBottom: '20px' }}>
        🛠️ Painel de Administração
      </h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={getStats}
          disabled={loading}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '⏳ Carregando...' : '📊 Atualizar Estatísticas'}
        </button>
        
        <button 
          onClick={executeCleanup}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '⏳ Executando...' : '🧹 Executar Limpeza'}
        </button>
      </div>

      {stats && (
        <div style={{
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '6px',
          border: '1px solid #ddd'
        }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>📈 Estatísticas do Sistema</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px' }}>
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>
                {stats.totalPlayers}
              </div>
              <div style={{ color: '#666' }}>Total de Jogadores</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388e3c' }}>
                {stats.totalRooms}
              </div>
              <div style={{ color: '#666' }}>Total de Salas</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fff3e0', borderRadius: '4px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f57c00' }}>
                {stats.inactivePlayers}
              </div>
              <div style={{ color: '#666' }}>Jogadores Inativos (&gt;2h)</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fce4ec', borderRadius: '4px' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c2185b' }}>
                {stats.inactiveRooms}
              </div>
              <div style={{ color: '#666' }}>Salas Inativas (&gt;2h)</div>
            </div>
          </div>
        </div>
      )}

      {lastCleanup && (
        <div style={{
          marginTop: '15px',
          padding: '10px',
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          color: '#155724'
        }}>
          ✅ Última limpeza executada em: {lastCleanup}
        </div>
      )}

      <div style={{
        marginTop: '20px',
        fontSize: '14px',
        color: '#666',
        lineHeight: '1.4'
      }}>
        <strong>ℹ️ Informações:</strong>
        <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
          <li>A limpeza automática remove jogadores e salas inativos há mais de 2 horas</li>
          <li>A limpeza automática executa a cada 10 minutos em salas ativas</li>
          <li>Você pode executar a limpeza manualmente usando o botão acima</li>
          <li>Jogadores inativos são aqueles que não atualizaram sua atividade recentemente</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminPanel;
