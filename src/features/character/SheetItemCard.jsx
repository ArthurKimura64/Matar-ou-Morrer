import React from 'react';
import { Utils } from '../../utils/cardFormatter';
import { sanitizeHtml } from '../../utils/sanitize';
import { VlastConversionBadge, VlastConversionButton } from './VlastPowerConverter';

/**
 * Renderiza uma carta individual dentro da Ficha do Personagem.
 */
const SheetItemCard = ({
  item,
  section,
  actor,
  currentMode,
  localization = {},
  isBlocked = false,
  isUsed = false,
  isUnlocked = false,
  isExposed = false,
  isConverted = false,
  isVlast = false,
  onToggleExposure,
  onUnlockItem,
  onUseItem,
  onToggleConvertPower,
  onQuickAttack = null
}) => {
  const isPassiveSpecial = section.type === 'passiveSpecial';
  const isSpecial = section.type === 'special';
  const isAttackOrWeapon = section.type === 'attack' || section.type === 'weapon';
  const isLocked = (isPassiveSpecial || isSpecial) && !isUnlocked;

  const title =
    ['device', 'power', 'special'].includes(section.type) || isConverted
      ? Utils.createTriggerName(item.ID, item, localization)
      : localization[item.ID] || item.ID;

  const desc = isAttackOrWeapon
    ? Utils.modeSystem.hasModes(actor) && item.modes
      ? Utils.createDualModeDescription(item, localization, actor)
      : Utils.createAttackDescription(item, localization, currentMode)
    : Utils.modeSystem.hasModes(actor) &&
      ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
    ? Utils.createModeRestrictedDescription(item, localization, actor)
    : localization[item.Description] || item.Description || '';

  let cardOpacity = '';
  if (isLocked) {
    cardOpacity = ' opacity-50';
  } else {
    cardOpacity = isBlocked ? ' opacity-50' : '';
    if (isUsed && !isConverted) cardOpacity += ' bg-dark opacity-75';
  }

  return (
    <article className="col-12 md:col-3">
      <div
        className={`card border-${section.color} h-100${cardOpacity}${
          isExposed ? ' card-exposed' : ''
        } position-relative`}
        style={{ background: 'var(--bs-gray-800)', color: '#fff' }}
      >
        <button
          type="button"
          className={`btn btn-sm position-absolute ${
            isExposed ? 'btn-success' : 'btn-outline-secondary'
          }`}
          style={{
            top: '5px',
            right: '5px',
            zIndex: 1,
            width: '24px',
            height: '24px',
            padding: 0,
            fontSize: '12px'
          }}
          onClick={() => onToggleExposure(item.ID)}
          title={
            isExposed
              ? localization['UI.CharacterSheet.HideFromTable'] || 'Ocultar da mesa'
              : localization['UI.CharacterSheet.ExposeOnTable'] || 'Expor na mesa'
          }
        >
          👁️
        </button>

        <div className="card-body p-2" style={{ paddingTop: '30px' }}>
          <div className={`fw-bold text-${section.color} mb-1`}>
            {title}
            {isBlocked && !isPassiveSpecial
              ? ` (${localization['UI.CharacterSheet.ModeRestricted'] || 'Bloqueado neste modo'})`
              : ''}
            {isLocked
              ? ` (${localization['UI.CharacterSheet.Locked'] || 'Bloqueado'})`
              : ''}
          </div>

          <VlastConversionBadge isConverted={isConverted} localization={localization} />

          <div className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(desc) }} />

          <div className="d-flex flex-wrap gap-2">
            {/* Atalho direto para abrir o combate com este ataque/arma */}
            {isAttackOrWeapon && !isBlocked && typeof onQuickAttack === 'function' && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => onQuickAttack(item)}
                title="Abrir painel de combate com este ataque selecionado"
              >
                ⚔️ Atacar
              </button>
            )}

            {/* Botão Desbloquear para Especiais e Especiais Passivas bloqueadas */}
            {isLocked && !isBlocked && (
              <button
                type="button"
                className={`btn btn-sm btn-outline-${section.color}`}
                onClick={() => onUnlockItem(item.ID)}
              >
                🔓 {localization['UI.CharacterSheet.Unlock'] || 'Desbloquear'}
              </button>
            )}

            {/* Estado Desbloqueado para Especiais Passivas */}
            {isPassiveSpecial && isUnlocked && !isBlocked && (
              <button
                type="button"
                className={`btn btn-sm btn-outline-${section.color}`}
                disabled
              >
                {localization['UI.CharacterSheet.Unlocked'] || 'Desbloqueado'}
              </button>
            )}

            {/* Botão Usar / Desfazer para Consumíveis (e Especiais já desbloqueadas) */}
            {section.useButton && !isBlocked && !isPassiveSpecial && (!isSpecial || isUnlocked) && (
              <button
                type="button"
                className={`btn btn-sm ${isUsed ? 'btn-outline-secondary' : `btn-outline-${section.color}`}`}
                onClick={() => onUseItem(item.ID)}
                title={isUsed ? 'Clique novamente para desfazer o uso' : undefined}
              >
                {isUsed
                  ? `${localization['UI.CharacterSheet.Used'] || 'Usado'} ↩`
                  : localization['UI.CharacterSheet.Use'] || 'Usar'}
              </button>
            )}

            <VlastConversionButton
              isVlast={isVlast}
              sectionKey={section.key}
              itemId={item.ID}
              isConverted={isConverted}
              isBlocked={isBlocked}
              onToggleConvert={onToggleConvertPower}
              localization={localization}
            />
          </div>
        </div>
      </div>
    </article>
  );
};

export default SheetItemCard;