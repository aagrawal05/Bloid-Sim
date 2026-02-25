/**
 * Binds all sliders and buttons to CONFIG. Updates config and display spans.
 * No inline scripts in HTML; all control logic lives here.
 */
(function () {
  function get(id) {
    return document.getElementById(id);
  }

  function bindSlider(inputId, spanId, key, formatter, transform, onUpdate) {
    var input = get(inputId);
    var span = get(spanId);
    if (!input || !span) return;
    formatter = formatter || function (v) { return String(v); };
    transform = transform || function (v) { return v; };
    function update() {
      var raw = input.type === 'range' ? parseFloat(input.value, 10) : input.value;
      var value = transform(raw);
      CONFIG[key] = value;
      span.textContent = formatter(value);
      if (onUpdate) onUpdate(value);
    }
    input.addEventListener('input', update);
    update();
  }

  function simulationSpeedTransform(sliderVal) {
    if (sliderVal <= 0) return 0;
    return Math.pow(10, (sliderVal / 5) - 1);
  }

  function init() {
    bindSlider('Slider', 'fps', 'fps', function (v) { return String(Math.round(v)); }, undefined, function () {
      if (window.app && typeof window.app.startSimulationLoop === 'function') window.app.startSimulationLoop();
    });
    bindSlider('simSlider', 'speed', 'simulationSpeed', function (v) { return (Math.round(v * 10) / 10).toFixed(1) + 'x'; }, simulationSpeedTransform);
    bindSlider('size', 'sizeSpan', 'sizeCoefficient');
    bindSlider('mutation', 'mutationSpan', 'mutationRate');
    bindSlider('reproduction', 'reproductionSpan', 'reproductionRate');
    bindSlider('hp', 'hpSpan', 'hpCoefficient');
    bindSlider('eat', 'eatSpan', 'eatCoefficient');
    bindSlider('compare', 'compareSpan', 'compareCoefficient');
    bindSlider('cost', 'costSpan', 'costCoefficient');
    bindSlider('speedC', 'speedCSpan', 'speedCoefficient');
    bindSlider('initial', 'initialSpan', 'initialPopulation', function (v) { return String(Math.round(v)); });

    var spatialSelect = get('spatialIndex');
    if (spatialSelect) {
      function updateSpatialIndex() {
        CONFIG.spatialIndex = spatialSelect.value;
      }
      spatialSelect.addEventListener('change', updateSpatialIndex);
      spatialSelect.value = CONFIG.spatialIndex || 'quadtree';
    }

    var restartButton = get('restartBtn');
    if (restartButton) {
      restartButton.addEventListener('click', function () {
        if (window.app && typeof window.app.restart === 'function') {
          window.app.restart();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
