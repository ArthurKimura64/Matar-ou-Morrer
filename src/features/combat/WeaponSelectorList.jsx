import React from 'react';

/**
 * ============================================================================
 * LISTA SELETORA DE ARMAS E ATAQUE PERSONALIZADO (WeaponSelectorList.jsx)
 * ============================================================================
 * O QUE ESTE COMPONENTE FAZ:
 * Exibe os cards de armas/ataques do jogador + o card de "Ataque Personalizado".
 * Quando um card é clicado, exibe os campos para editar Dados, Tempo e Dano.
 * É reutilizado ao iniciar combate, ao defender, ao trocar de arma e na oportunidade.
 * ============================================================================
 */
const WeaponSelectorList = ({
  weapons = [],
  selectedWeapon,
  onSelectWeapon,
  customAttack,
  onChangeCustomAttack,
  actor,
  combatMode = 'mode1',
  localization = {},
  accentColor = 'success' // 'success' (verde) ou 'warning' (amarelo)
}) => {
  const hasModes = Boolean(actor?.mode1 && actor?.mode2);
  const isCustomSelected = selectedWeapon?.Name === customAttack.Name;

  const handleUpdateCustom = (field, value) => {
    const updated = { ...customAttack, [field]: value };
    onChangeCustomAttack(updated);
    if (isCustomSelected) {
      onSelectWeapon(updated);
    }
  };

  return (
    <section className="d-flex flex-column gap-2" aria-label="Lista de armas e ataques">
      {weapons.length === 0 && (
        <div className="alert alert-info mb-2 py-2">
          <small>{localization?.['UI.Combat.NoAttacksAvailable'] || 'Você não possui ataques ou armas disponíveis.'}</small>
        </div>
      )}

      {/* Cards de Armas/Ataques da Ficha */}
      {weapons.map((weapon, idx) => {
        const isSelected = selectedWeapon?.Name === weapon.Name;
        const borderClass = isSelected
          ? `border-${accentColor} bg-${accentColor} bg-opacity-25`
          : 'border-secondary';

        return (
          <article
            key={weapon.ID || idx}
            className={`card border ${borderClass} cursor-pointer`}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelectWeapon({ ...weapon })}
          >
            <div className="card-body p-2">
              <div className="d-flex justify-content-between align-items-start mb-1">
                <div style={{ flex: 1 }}>
                  <h6 className="text-white mb-1 small">
                    {weapon.Name}
                    {hasModes && weapon.modes && (
                      <span className="weapon-mode-indicator ms-1" style={{ fontSize: '9px', padding: '1px 6px' }}>
                        {localization?.[actor[combatMode]] || actor[combatMode] || combatMode}
                      </span>
                    )}
                  </h6>
                  <div className="d-flex gap-2 flex-wrap">
                    <small className="text-muted">🎲 {weapon.Dices ?? '0'}</small>
                    <small className="text-muted">⏱️ {weapon.LoadTime ?? '0'}</small>
                    <small className="text-muted">💥 {weapon.Damage || '0'}</small>
                    {weapon.Distance && <small className="text-muted">📏 {weapon.Distance}</small>}
                    {weapon.category && <span className="badge bg-secondary">{weapon.category}</span>}
                  </div>
                  {weapon.Description && (
                    <small className="text-info d-block mt-1" style={{ fontSize: '10px' }}>
                      {weapon.Description}
                    </small>
                  )}
                  {weapon.Effects && (
                    <small className="text-warning d-block mt-1" style={{ fontSize: '10px' }}>
                      ✨ {weapon.Effects}
                    </small>
                  )}
                </div>
                {isSelected && <span className={`text-${accentColor} ms-2`}>✓</span>}
              </div>

              {/* Controles editáveis de Dados, Tempo e Dano quando selecionado */}
              {isSelected && (
                <div className="mt-2 pt-2 border-top border-secondary">
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="text-white" style={{ fontSize: '11px' }}>
                        {localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={selectedWeapon.Dices}
                        min="0"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelectWeapon({ ...selectedWeapon, Dices: e.target.value })}
                      />
                    </div>
                    <div className="col-4">
                      <label className="text-white" style={{ fontSize: '11px' }}>
                        {localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={selectedWeapon.LoadTime}
                        min="-1"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelectWeapon({ ...selectedWeapon, LoadTime: e.target.value })}
                      />
                    </div>
                    <div className="col-4">
                      <label className="text-white" style={{ fontSize: '11px' }}>
                        {localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}
                      </label>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={selectedWeapon.Damage}
                        min="0"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSelectWeapon({ ...selectedWeapon, Damage: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}

      {/* Card de Ataque Personalizado */}
      <div
        className={`card border ${isCustomSelected ? 'border-warning bg-warning bg-opacity-25' : 'border-warning'} cursor-pointer`}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelectWeapon({ ...customAttack })}
      >
        <div className="card-body p-2">
          <div className="d-flex justify-content-between align-items-start mb-1">
            <h6 className="text-warning mb-0 small">
              {localization?.['UI.Combat.CustomAttackCard'] || '⚙️ Ataque Personalizado'}
            </h6>
            {isCustomSelected && <span className="text-warning">✓</span>}
          </div>

          {!isCustomSelected ? (
            <div className="d-flex gap-2 flex-wrap">
              <small className="text-muted">🎲 {customAttack.Dices ?? '0'}</small>
              <small className="text-muted">⏱️ {customAttack.LoadTime || '0'}</small>
              <small className="text-muted">💥 {customAttack.Damage || '0'}</small>
              <span className="badge bg-secondary">{customAttack.category}</span>
            </div>
          ) : (
            <div className="mt-2 pt-2 border-top border-secondary">
              <div className="mb-2">
                <label className="text-white" style={{ fontSize: '11px' }}>
                  {localization?.['UI.Combat.WeaponName'] || 'Nome:'}
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={customAttack.Name}
                  placeholder={localization?.['UI.Combat.AttackNamePlaceholder'] || 'Nome do ataque'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleUpdateCustom('Name', e.target.value)}
                />
              </div>
              <div className="row g-2">
                <div className="col-4">
                  <label className="text-white" style={{ fontSize: '11px' }}>
                    {localization?.['UI.Combat.DiceLabel'] || '🎲 Dados:'}
                  </label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={customAttack.Dices}
                    min="0"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateCustom('Dices', e.target.value)}
                  />
                </div>
                <div className="col-4">
                  <label className="text-white" style={{ fontSize: '11px' }}>
                    {localization?.['UI.Combat.TimeLabel'] || '⏱️ Tempo:'}
                  </label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={customAttack.LoadTime}
                    min="-1"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateCustom('LoadTime', e.target.value)}
                  />
                </div>
                <div className="col-4">
                  <label className="text-white" style={{ fontSize: '11px' }}>
                    {localization?.['UI.Combat.DamageLabel'] || '💥 Dano:'}
                  </label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={customAttack.Damage}
                    min="0"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateCustom('Damage', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WeaponSelectorList;