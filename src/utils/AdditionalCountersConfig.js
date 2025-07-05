// Configuração de contadores adicionais baseados em SpecialCharacteristics
// Este arquivo processa as características especiais que são do tipo 'counter'
// definidas no GameEconomyData.json > SpecialDefinitions
//
// IMPORTANTE: Este sistema é responsável por TODOS os contadores do tipo 'counter'
// O componente SpecialCharacteristics NÃO deve renderizar contadores, apenas outros tipos
// como 'textbox', etc.

export const AdditionalCountersConfig = {
  // Esta configuração não define contadores fixos,
  // mas sim processa as SpecialCharacteristics reais do jogo dinamicamente
};

// Função para obter contadores adicionais baseados nas SpecialCharacteristics (algoritmo geral)
export const getCharacterAdditionalCounters = (characterName, characterData) => {
  let counters = {};

  // Processar TODAS as SpecialCharacteristics do tipo 'counter' de qualquer personagem
  if (characterData?.actor?.SpecialCharacteristics && characterData?.gameData?.SpecialDefinitions) {
    const { actor, gameData, localization } = characterData;
    
    console.log('🔍 DEBUG - Processando SpecialCharacteristics:', actor.SpecialCharacteristics);
    console.log('🔍 DEBUG - SpecialDefinitions disponíveis:', gameData.SpecialDefinitions.filter(s => s.Type === 'counter'));
    
    actor.SpecialCharacteristics.forEach(specialId => {
      const spec = gameData.SpecialDefinitions.find(s => s.ID === specialId);
      if (spec && spec.Type === 'counter') {
        console.log('✅ DEBUG - Criando contador para:', specialId, spec);
        
        // Verificar se já existe para evitar duplicatas
        if (counters[specialId]) {
          console.warn('⚠️ DEBUG - Contador duplicado detectado:', specialId);
          return;
        }
        
        // Valores baseados nas definições do jogo ou padrões sensatos
        const maxValue = spec.Max || 10; // Valor máximo padrão
        const minValue = spec.Min || 0;
        const initialValue = spec.InitialValue !== undefined ? spec.InitialValue : maxValue; // Começar no máximo se não especificado
        
        // Usar a localização para obter o nome
        const label = (localization && spec.Title ? localization[spec.Title] || spec.Title : spec.Title) || specialId.replace('SpecialCustom.', '').replace(/\d+$/, '');
        
        // Ícone geral para todos os contadores especiais
        const icon = '📊';
        
        counters[specialId] = {
          current: initialValue,
          max: maxValue,
          min: minValue,
          initialValue: initialValue,
          label: label,
          icon: icon
        };
      }
    });
  }

  console.log('📊 DEBUG - Contadores finais gerados:', Object.keys(counters), counters);
  return counters;
};

// Função para atualizar um contador específico (não altera o máximo)
export const updateAdditionalCounter = (currentCounters, counterKey, newValue) => {
  if (!currentCounters[counterKey]) return currentCounters;

  return {
    ...currentCounters,
    [counterKey]: {
      ...currentCounters[counterKey],
      current: Math.max(0, Math.min(newValue, currentCounters[counterKey].max))
      // Mantém o valor máximo original
    }
  };
};

// Função para resetar todos os contadores para seus valores iniciais
export const resetAdditionalCounters = (counters) => {
  const reset = {};
  Object.entries(counters).forEach(([key, value]) => {
    if (typeof value === 'object' && value.initialValue !== undefined) {
      reset[key] = { ...value, current: value.initialValue };
    } else if (typeof value === 'object' && value.max !== undefined) {
      // Se não tem initialValue definido, usar o máximo
      reset[key] = { ...value, current: value.max };
    } else {
      reset[key] = value;
    }
  });
  return reset;
};
