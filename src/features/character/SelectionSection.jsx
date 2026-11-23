import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';

const SelectionSection = ({
  type,
  config,
  actor,
  localization,
  onSelectionChange,
  globalSelectedIds = new Set(),
  initialSelected = []
}) => {
  const [selectedItems, setSelectedItems] = useState([]);

  // Sincroniza quando o usuário clica em "Preencher Aleatório", "Carregar Build", F5 ou troca de personagem
  useEffect(() => {
    setSelectedItems(Array.isArray(initialSelected) ? initialSelected : []);
  }, [initialSelected]);

  const hasData = !!(config.data && config.data.length);

  const handleItemToggle = useCallback(
    (item, shouldSelect) => {
      let newSelection;
      if (shouldSelect) {
        if (selectedItems.some((selected) => selected.ID === item.ID)) return;
        newSelection = [...selectedItems, item];
      } else {
        newSelection = selectedItems.filter((selected) => selected.ID !== item.ID);
      }

      if (newSelection.length <= config.number) {
        setSelectedItems(newSelection);
        onSelectionChange(newSelection);
      }
    },
    [selectedItems, config.number, onSelectionChange]
  );

  const isSelected = useCallback(
    (item) => selectedItems.some((selected) => selected.ID === item.ID),
    [selectedItems]
  );

  // Mapa de definições por ID para acesso rápido O(1)
  const defMap = useMemo(() => {
    const m = new Map();
    (config.definitions || []).forEach((d) => {
      m.set(d.ID, d);
    });
    return m;
  }, [config.definitions]);

  if (!hasData) return null;

  return (
    <section className="row justify-content-center" aria-label={config.title}>
      <h3 className={`text-${config.color} text-center my-3`}>
        {config.title} ({localization['UI.Selection.ChooseN'] || 'Escolha'} {config.number})
      </h3>

      {config.data.map((id) => {
        const def = defMap.get(id) || { ID: id };
        const name = typeof config.getName === 'function' ? config.getName(id, def) : id;
        const desc = typeof config.getDesc === 'function' ? config.getDesc(def) : '';
        const itemSelected = isSelected(def);
        const maxSelected = selectedItems.length >= config.number;
        const alreadySelectedElsewhere = !itemSelected && globalSelectedIds.has(def.ID);

        // Sintaxe padronizada para Bootstrap 6 Alpha (sem duplicar col-md-4)
        let cardClass = 'card col-10 md:col-4 m-2';
        if (itemSelected) {
          cardClass += ` border-3 border-${config.color} shadow`;
        } else {
          cardClass += ' border border-secondary';
        }
        if (!itemSelected && maxSelected) {
          cardClass += ' bg-dark opacity-75';
        }

        return (
          <article
            key={id}
            className={cardClass}
            style={itemSelected ? { background: 'var(--bs-gray-800)', color: '#fff' } : {}}
          >
            <div className="card-body">
              <h5 className={`card-title text-${config.color}`}>{name}</h5>
              <div className="card-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(desc) }} />
              <button
                type="button"
                className={`btn btn-outline-${config.color} select-btn w-100 mt-2${itemSelected ? ' active' : ''}`}
                disabled={alreadySelectedElsewhere || (!itemSelected && maxSelected)}
                onClick={() => handleItemToggle(def, !itemSelected)}
                title={
                  alreadySelectedElsewhere
                    ? localization['Characteristic.AlreadySelectedElsewhere'] ||
                      'Já selecionado em outra seção'
                    : ''
                }
              >
                {itemSelected
                  ? localization['Characteristic.Selected'] || 'Selecionado'
                  : alreadySelectedElsewhere
                  ? localization['Characteristic.AlreadySelected'] || 'Já selecionado'
                  : localization['Characteristic.Select'] || 'Selecionar'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
};

export default SelectionSection;