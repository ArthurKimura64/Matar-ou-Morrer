import React, { useState, useEffect } from 'react';

const SelectionSection = ({ type, config, actor, localization, onSelectionChange, globalSelectedIds = new Set(), initialSelected = [] }) => {
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    if (Array.isArray(initialSelected) && initialSelected.length) {
      setSelectedItems(initialSelected);
      onSelectionChange(initialSelected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config.data || !config.data.length) return null;

  const handleItemToggle = (item, isSelected) => {
    let newSelection;
    if (isSelected) {
      newSelection = [...selectedItems, item];
    } else {
      newSelection = selectedItems.filter(selected => selected.ID !== item.ID);
    }
    // Limitar seleção ao número máximo
    if (newSelection.length <= config.number) {
      setSelectedItems(newSelection);
      onSelectionChange(newSelection);
    }
  };

  const isSelected = (item) => selectedItems.some(selected => selected.ID === item.ID);

  return (
    <div className="row justify-content-center">
      <h3 className={`text-${config.color} text-center my-3`}>
        {config.title} (Escolha {config.number})
      </h3>
      {config.data.map((id) => {
        const def = (config.definitions || []).find((d) => d.ID === id) || { ID: id };
        const name = typeof config.getName === 'function' ? config.getName(id, def) : id;
        const desc = typeof config.getDesc === 'function' ? config.getDesc(def) : "";
        const itemSelected = isSelected(def);
        const maxSelected = selectedItems.length >= config.number;
        const alreadySelectedElsewhere = !itemSelected && globalSelectedIds.has(def.ID);
        // Classes para simular o JS: border, shadow, bg-dark, opacity-75
        let cardClass = 'card col-10 col-md-4 m-2';
        if (itemSelected) {
          cardClass += ` border-3 border-${config.color} shadow`;
        } else {
          cardClass += ' border border-secondary';
        }
        if (!itemSelected && maxSelected) {
          cardClass += ' bg-dark opacity-75';
        }
        return (
          <div key={id} className={cardClass} style={itemSelected ? { background: 'var(--bs-gray-800)', color: '#fff' } : {}}>
            <div className="card-body">
              <h5 className={`card-title text-${config.color}`}>{name}</h5>
              <div className="card-text" dangerouslySetInnerHTML={{ __html: desc }} />
              <button
                className={`btn btn-outline-${config.color} select-btn w-100 mt-2${itemSelected ? ' active' : ''}`}
                disabled={alreadySelectedElsewhere || (!itemSelected && maxSelected)}
                onClick={() => handleItemToggle(def, !itemSelected)}
                title={alreadySelectedElsewhere ? (localization['Characteristic.AlreadySelectedElsewhere'] || 'Já selecionado em outra seção') : ''}
              >
                {itemSelected ? localization['Characteristic.Selected'] || 'Characteristic.Selected' : (alreadySelectedElsewhere ? (localization['Characteristic.AlreadySelected'] || 'Já selecionado') : (localization['Characteristic.Select'] || 'Characteristic.Select'))}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SelectionSection;
