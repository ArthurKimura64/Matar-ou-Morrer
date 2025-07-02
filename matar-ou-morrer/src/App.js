import React, { useState, useEffect } from 'react';
import CharacterSelection from './components/CharacterSelection';
import CharacterBuilder from './components/CharacterBuilder';
import CharacterSheet from './components/CharacterSheet';
import './App.css';

function App() {
  const [gameData, setGameData] = useState(null);
  const [localization, setLocalization] = useState(null);
  const [currentView, setCurrentView] = useState('selection');
  const [selectedActor, setSelectedActor] = useState(null);
  const [characterSelections, setCharacterSelections] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("GameEconomyData.json").then(r => r.json()),
      fetch("LocalizationPortuguese.json").then(r => r.json())
    ]).then(([gameData, localization]) => {
      setGameData(gameData);
      setLocalization(localization);
    }).catch(error => {
      console.error('Erro ao carregar dados:', error);
    });
  }, []);

  const handleCharacterSelect = (actor) => {
    setSelectedActor(actor);
    setCurrentView('builder');
  };

  const handleCharacterCreate = (selections) => {
    setCharacterSelections(selections);
    setCurrentView('sheet');
  };

  const handleReset = () => {
    setCurrentView('selection');
    setSelectedActor(null);
    setCharacterSelections(null);
  };

  if (!gameData || !localization) {
    return (
      <div className="container-fluid d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Carregando...</span>
          </div>
          <p className="mt-2">Carregando dados do jogo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {currentView === 'selection' && (
        <>
          <div className="row">
            <div className="col-12 text-center">
              <img 
                src="KillOrDieLogo.png"
                alt="Matar ou Morrer" 
                className="img-fluid rounded mx-auto d-block my-3"
                style={{maxHeight: '300px'}} 
              />
              <h1 className="text-white">Matar ou Morrer</h1>
              <h4 className="text-light mb-4">Escolha seu personagem!</h4>
            </div>
          </div>
          <CharacterSelection 
            gameData={gameData}
            localization={localization}
            onCharacterSelect={handleCharacterSelect}
          />
        </>
      )}
      {currentView === 'builder' && (
        <CharacterBuilder
          actor={selectedActor}
          gameData={gameData}
          localization={localization}
          onCharacterCreate={handleCharacterCreate}
          onBack={() => setCurrentView('selection')}
        />
      )}
      {currentView === 'sheet' && (
        <CharacterSheet
          actor={selectedActor}
          selections={characterSelections}
          gameData={gameData}
          localization={localization}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

export default App;
