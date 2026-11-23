import { sanitizeHtml } from '../../utils/sanitize';

const SpecialCharacteristics = ({
  actor,
  gameData,
  localization = {},
  additionalCounters = {},
  onCounterChange
}) => {
  const nonCounterCharacteristics =
    actor?.SpecialCharacteristics?.filter((specialId) => {
      const spec = gameData?.SpecialDefinitions?.find((s) => s.ID === specialId);
      return spec && spec.Type !== 'counter';
    }) || [];

  if (nonCounterCharacteristics.length === 0) {
    return null;
  }

  const handleTextboxChange = (specialId, textValue) => {
    if (!onCounterChange) return;
    const currentNotes =
      typeof additionalCounters?._notes === 'object' && additionalCounters._notes !== null
        ? additionalCounters._notes
        : {};

    onCounterChange({
      ...additionalCounters,
      _notes: {
        ...currentNotes,
        [specialId]: textValue
      }
    });
  };

  return (
    <section
      className="row g-2 mb-3 gap-3 d-flex flex-wrap justify-content-center"
      aria-label="Anotações especiais do personagem"
    >
      {nonCounterCharacteristics.map((specialId) => {
        const spec = gameData.SpecialDefinitions?.find((s) => s.ID === specialId);
        if (!spec || spec.Type !== 'textbox') return null;

        const title =
          localization[spec.Title] ||
          spec.Title ||
          localization['UI.SpecialCharacteristics.Default'] ||
          'Característica Especial';

        // Lê do formato novo (_notes) com fallback para o formato antigo (string solta)
        const savedText =
          typeof additionalCounters?._notes?.[specialId] === 'string'
            ? additionalCounters._notes[specialId]
            : typeof additionalCounters?.[specialId] === 'string'
            ? additionalCounters[specialId]
            : '';

        return (
          <article key={specialId} className="col-12 md:col-5 mb-3 md:mb-0 d-flex justify-content-center">
            <div className="card bg-dark text-white w-100">
              <div className="card-body p-2 d-flex flex-column align-items-center">
                <label
                  htmlFor={`special-note-${specialId}`}
                  className="fw-bold mb-1"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(title) }}
                />
                <div className="input-group flex-nowrap justify-content-center">
                  <textarea
                    id={`special-note-${specialId}`}
                    rows="4"
                    className="form-control w-75 mb-2 rounded shadow-sm"
                    placeholder={
                      spec.Placeholder ||
                      localization['UI.SpecialCharacteristics.Placeholder'] ||
                      'Digite aqui...'
                    }
                    value={savedText}
                    onChange={(e) => handleTextboxChange(specialId, e.target.value)}
                  />
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
};

export default SpecialCharacteristics;