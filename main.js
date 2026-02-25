var populationChart, sizeChart, speedChart, angleSpeedChart;
var lastHoveredIndex = null;
var simulationWorker = null;
var tickIntervalId = null;
var useSAB = false;
var sharedBuffer = null;

function getCanvasDimensions() {
    var w = Renderer.getWidth && Renderer.getWidth();
    var h = Renderer.getHeight && Renderer.getHeight();
    if (w && h) return { w: w, h: h };
    var container = document.getElementById("canvasParent");
    return {
        w: container ? container.clientWidth : CONSTANTS.canvasWidth,
        h: container ? container.clientHeight : CONSTANTS.canvasHeight
    };
}

function sendWorkerInit() {
    if (!simulationWorker) return;
    var dims = getCanvasDimensions();
    var msg = {
        type: 'init',
        config: CONFIG,
        constants: CONSTANTS,
        canvasWidth: dims.w,
        canvasHeight: dims.h
    };
    if (useSAB && sharedBuffer && typeof SAB_LAYOUT !== 'undefined') {
        msg.sab = sharedBuffer;
        msg.sabLayout = SAB_LAYOUT;
    }
    simulationWorker.postMessage(msg);
}

function sendWorkerTick() {
    if (!simulationWorker) return;
    var dims = getCanvasDimensions();
    var dt = CONFIG.simulationSpeed / CONFIG.fps;
    simulationWorker.postMessage({
        type: 'tick',
        dt: dt,
        config: CONFIG,
        constants: CONSTANTS,
        canvasWidth: dims.w,
        canvasHeight: dims.h
    });
}

function startSimulationLoop() {
    if (tickIntervalId) clearInterval(tickIntervalId);
    var fps = Math.max(1, Math.min(240, CONFIG.fps));
    tickIntervalId = setInterval(sendWorkerTick, 1000 / fps);
}

function readStateFromSAB() {
    if (!sharedBuffer || typeof SAB_LAYOUT === 'undefined') return [];
    var layout = SAB_LAYOUT;
    var MAX = layout.MAX_AGENTS;
    var FPA = layout.FLOATS_PER_AGENT;
    var floatsPerBuffer = FPA * MAX;
    var bytesPerBuffer = 4 + floatsPerBuffer * 4;
    var i32 = new Int32Array(sharedBuffer);
    var f32 = new Float32Array(sharedBuffer);
    var readIdx = Atomics.load(i32, 0);
    var countOffset = readIdx === 0 ? 1 : 1 + (bytesPerBuffer / 4);
    var dataOffset = readIdx === 0 ? 2 : 2 + (bytesPerBuffer / 4);
    var n = i32[countOffset];
    if (n <= 0 || n > MAX) return [];
    var out = [];
    for (var i = 0; i < n; i++) {
        var base = dataOffset + i * FPA;
        var genes = [f32[base + 7], f32[base + 8], f32[base + 9]];
        var hp = f32[base + 10];
        out.push({
            x: f32[base],
            y: f32[base + 1],
            size: f32[base + 2],
            r: f32[base + 3],
            g: f32[base + 4],
            b: f32[base + 5],
            a: f32[base + 6],
            genes: genes,
            hp: hp,
            dna: { genes: genes }
        });
    }
    return out;
}

function init() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#9a9ca5';
        Chart.defaults.font.family = '"DM Sans", system-ui, sans-serif';
        Chart.defaults.borderColor = '#373a40';
        Chart.defaults.backgroundColor = '#25262b';
    }

    useSAB = typeof SharedArrayBuffer !== 'undefined' && typeof SAB_LAYOUT !== 'undefined';
    if (useSAB) {
        try {
            sharedBuffer = new SharedArrayBuffer(SAB_LAYOUT.getByteLength());
        } catch (e) {
            useSAB = false;
            sharedBuffer = null;
        }
    }

    window.app.currentIndividuals = [];
    var getPopulation = function () {
        return { individuals: window.app.currentIndividuals };
    };

    Renderer.init('canvasParent', function onRendererReady() {
        simulationWorker = new Worker('js/simulation-worker.js');
        if (useSAB) {
            Renderer.setStateProvider(function () {
                var state = readStateFromSAB();
                window.app.currentIndividuals = state;
                return state;
            });
        } else {
            simulationWorker.onmessage = function (e) {
                var msg = e.data;
                if (msg && msg.type === 'state' && Array.isArray(msg.individuals)) {
                    msg.individuals.forEach(function (d) {
                        if (!d.dna) d.dna = { genes: d.genes };
                    });
                    window.app.currentIndividuals = msg.individuals;
                    Renderer.setState(msg.individuals);
                }
            };
        }

        sendWorkerInit();
        startSimulationLoop();

        var charts = Charts.createAll(getPopulation);
        populationChart = charts.populationChart;
        sizeChart = charts.sizeChart;
        speedChart = charts.speedChart;
        angleSpeedChart = charts.angleSpeedChart;

        if (window.app.updateInspector) window.app.updateInspector(null);

        var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
        if (canvasEl) {
            canvasEl.addEventListener('mousemove', window.app._onMouseMove);
            canvasEl.addEventListener('mouseleave', window.app._onMouseLeave);
        }
    });
}

function restart() {
    lastHoveredIndex = null;
    if (window.app.updateInspector) window.app.updateInspector(null);
    if (simulationWorker) {
        var dims = getCanvasDimensions();
        var msg = {
            type: 'restart',
            config: CONFIG,
            constants: CONSTANTS,
            canvasWidth: dims.w,
            canvasHeight: dims.h
        };
        if (useSAB && sharedBuffer && typeof SAB_LAYOUT !== 'undefined') {
            msg.sab = sharedBuffer;
            msg.sabLayout = SAB_LAYOUT;
        }
        simulationWorker.postMessage(msg);
    }
}

var inspectorTooltips = {
    size: 'Body size, health pool, and metabolic cost. Larger = more HP and bite radius, can eat smaller agents; pays more cost per timestep. Gene × sizeCoefficient → display size.',
    speed: 'Movement speed in pixels per time. Higher = chase or flee faster. No direct cost; gene × speedCoefficient.',
    angularSpeed: 'Turn rate (heading wobble per step). Higher = more erratic movement; lower = straighter paths. Gene × 2π radians per step.',
    hp: 'Current health. Decreases each step from metabolic cost (size_gene × costCoefficient × dt); eating restores it (prey HP × eatCoefficient).'
};

function updateInspector(individual) {
    var el = document.getElementById('inspectorContent');
    if (!el) return;
    if (!individual) {
        el.innerHTML = '<p class="inspector-placeholder">Hover over an individual</p>';
        return;
    }
    var g = individual.dna && individual.dna.genes ? individual.dna.genes : individual.genes;
    var hp = individual.hp;
    if (!g) return;
    el.innerHTML =
        '<dl class="inspector-dl">' +
        '<dt>Size<span class="info-trigger" tabindex="0" role="button" aria-label="Size gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.size + '</span></span></dt><dd>' + g[0].toFixed(3) + '</dd>' +
        '<dt>Speed<span class="info-trigger" tabindex="0" role="button" aria-label="Speed gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.speed + '</span></span></dt><dd>' + g[1].toFixed(3) + '</dd>' +
        '<dt>Angular speed<span class="info-trigger" tabindex="0" role="button" aria-label="Angular speed gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.angularSpeed + '</span></span></dt><dd>' + g[2].toFixed(3) + '</dd>' +
        '<dt>HP<span class="info-trigger" tabindex="0" role="button" aria-label="HP description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.hp + '</span></span></dt><dd>' + hp + '</dd>' +
        '</dl>';
}

var _mouseX = null;
var _mouseY = null;

function hoverCheck() {
    if (_mouseX == null || _mouseY == null) return;
    var individuals = window.app.currentIndividuals;
    var foundIndex = null;
    for (var i = 0; i < individuals.length; i++) {
        var d = individuals[i];
        if (dist({ x: _mouseX, y: _mouseY }, { x: d.x, y: d.y }) < d.size / 2) {
            foundIndex = i;
            break;
        }
    }
    if (foundIndex !== lastHoveredIndex) {
        lastHoveredIndex = foundIndex;
        Renderer.setHovered(foundIndex);
        if (window.app.updateInspector) {
            if (foundIndex == null) {
                window.app.updateInspector(null);
            } else {
                var drawable = individuals[foundIndex];
                window.app.updateInspector({ dna: { genes: drawable.genes }, hp: drawable.hp });
            }
        }
    }
}

window.app = {
    restart: restart,
    updateInspector: updateInspector,
    startSimulationLoop: startSimulationLoop,
    hoveredIndividual: null,
    mouseSketchX: null,
    mouseSketchY: null,
    currentIndividuals: [],
    _onMouseMove: function (e) {
        var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
        if (!canvasEl) return;
        var rect = canvasEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var cw = Renderer.getWidth();
        var ch = Renderer.getHeight();
        if (!cw || !ch) return;
        _mouseX = (e.clientX - rect.left) * (cw / rect.width);
        _mouseY = (e.clientY - rect.top) * (ch / rect.height);
        hoverCheck();
    },
    _onMouseLeave: function () {
        _mouseX = null;
        _mouseY = null;
        Renderer.setHovered(null);
        if (window.app.updateInspector) window.app.updateInspector(null);
        lastHoveredIndex = null;
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
