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
  onToggleConvertPower
}) => {
  const isPassiveSpecial = section.type === 'passiveSpecial';

  const title =
    ['device', 'power', 'special'].includes(section.type) || isConverted
      ? Utils.createTriggerName(item.ID, item, localization)
      : localization[item.ID] || item.ID;

  const desc = ['attack', 'weapon'].includes(section.type)
    ? Utils.modeSystem.hasModes(actor) && item.modes
      ? Utils.createDualModeDescription(item, localization, actor)
      : Utils.createAttackDescription(item, localization, currentMode)
    : Utils.modeSystem.hasModes(actor) &&
      ['power', 'passive', 'special', 'passiveSpecial'].includes(section.type)
    ? Utils.createModeRestrictedDescription(item, localization, actor)
    : localization[item.Description] || item.Description || '';

  let cardOpacity = '';
  if (isPassiveSpecial) {
    cardOpacity = isUnlocked ? '' : ' opacity-50';
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
            {isPassiveSpecial && !isUnlocked
              ? ` (${localization['UI.CharacterSheet.Locked'] || 'Bloqueado'})`
              : ''}
          </div>

          <VlastConversionBadge isConverted={isConverted} localization={localization} />

          <div className="mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(desc) }} />

          <div className="d-flex flex-wrap gap-2">
            {isPassiveSpecial && !isBlocked && (
              <button
                type="button"
                className={`btn btn-sm btn-outline-${section.color}`}
                onClick={() => onUnlockItem(item.ID)}
                disabled={isUnlocked}
              >
                {isUnlocked
                  ? localization['UI.CharacterSheet.Unlocked'] || 'Desbloqueado'
                  : localization['UI.CharacterSheet.Unlock'] || 'Desbloquear'}
              </button>
            )}

            {section.useButton && !isBlocked && !isPassiveSpecial && (
              <button
                type="button"
                className={`btn btn-sm btn-outline-${section.color}`}
                disabled={isUsed}
                onClick={() => onUseItem(item.ID)}
              >
                {isUsed
                  ? localization['UI.CharacterSheet.Used'] || 'Usado'
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