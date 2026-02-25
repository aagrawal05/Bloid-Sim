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
        canvasHeight: dims.h,
        mapWidth: CONFIG.mapWidth,
        mapHeight: CONFIG.mapHeight
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
        canvasHeight: dims.h,
        mapWidth: CONFIG.mapWidth,
        mapHeight: CONFIG.mapHeight
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
        if (Renderer.setMapSize) Renderer.setMapSize(CONFIG.mapWidth, CONFIG.mapHeight);

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
            canvasEl.addEventListener('mousedown', window.app._onMouseDown);
            canvasEl.addEventListener('mouseup', window.app._onMouseUp);
            canvasEl.addEventListener('mouseleave', window.app._onMouseLeave);
            canvasEl.addEventListener('wheel', function (e) {
                e.preventDefault();
                var rect = canvasEl.getBoundingClientRect();
                var normX = (e.clientX - rect.left) / rect.width;
                var normY = (e.clientY - rect.top) / rect.height;
                var direction = e.deltaY > 0 ? -1 : 1;
                Renderer.setZoomStep(direction, normX, normY);
            }, { passive: false });
        }

        if (Minimap.init) Minimap.init('minimapContainer');
        window.app._minimapLoop();

        var panBtn = document.getElementById('panBtn');
        if (panBtn && canvasEl) {
            panBtn.addEventListener('click', function () {
                window.app.panMode = !window.app.panMode;
                panBtn.classList.toggle('canvas-tool--active', window.app.panMode);
                panBtn.setAttribute('aria-pressed', window.app.panMode ? 'true' : 'false');
                canvasEl.style.cursor = window.app.panMode ? 'grab' : '';
            });
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
            canvasHeight: dims.h,
            mapWidth: CONFIG.mapWidth,
            mapHeight: CONFIG.mapHeight
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

function screenToWorld(screenX, screenY) {
    var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
    if (!canvasEl) return { x: 0, y: 0 };
    var rect = canvasEl.getBoundingClientRect();
    var cw = Renderer.getWidth();
    var ch = Renderer.getHeight();
    var zoom = Renderer.getZoom ? Renderer.getZoom() : 1;
    var vp = Renderer.getViewport ? Renderer.getViewport() : { x: 0, y: 0 };
    var normX = (screenX - rect.left) / rect.width;
    var normY = (screenY - rect.top) / rect.height;
    return {
        x: vp.x + normX * (cw / zoom),
        y: vp.y + normY * (ch / zoom)
    };
}

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

var Minimap = {
    canvas: null,
    ctx: null,
    width: 140,
    height: 105,
    init: function (parentId) {
        var parent = document.getElementById(parentId);
        if (!parent) return;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.className = 'minimap-canvas';
        this.canvas.setAttribute('aria-label', 'Minimap: click to move view');
        this.ctx = this.canvas.getContext('2d');
        parent.appendChild(this.canvas);
        var self = this;
        this.canvas.addEventListener('click', function (e) {
            var rect = self.canvas.getBoundingClientRect();
            var px = e.clientX - rect.left;
            var py = e.clientY - rect.top;
            var nx = px / rect.width;
            var ny = py / rect.height;
            var mapW = CONFIG.mapWidth;
            var mapH = CONFIG.mapHeight;
            var worldX = nx * mapW;
            var worldY = ny * mapH;
            var cw = Renderer.getWidth();
            var ch = Renderer.getHeight();
            var zoom = Renderer.getZoom();
            var visW = cw / zoom;
            var visH = ch / zoom;
            var vx = Math.max(0, Math.min(mapW - visW, worldX - visW / 2));
            var vy = Math.max(0, Math.min(mapH - visH, worldY - visH / 2));
            Renderer.setViewport(vx, vy);
        });
    },
    draw: function (agents, viewportX, viewportY, zoom, mapW, mapH, canvasW, canvasH) {
        if (!this.ctx || !this.canvas) return;
        var w = this.width;
        var h = this.height;
        var scaleX = w / mapW;
        var scaleY = h / mapH;
        this.ctx.fillStyle = '#25262b';
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.strokeStyle = '#373a40';
        this.ctx.strokeRect(0, 0, w, h);
        var visW = canvasW / zoom;
        var visH = canvasH / zoom;
        var rx = viewportX * scaleX;
        var ry = viewportY * scaleY;
        var rw = visW * scaleX;
        var rh = visH * scaleY;
        this.ctx.strokeStyle = 'rgba(77, 171, 247, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(rx, ry, rw, rh);
        this.ctx.fillStyle = 'rgba(77, 171, 247, 0.15)';
        this.ctx.fillRect(rx, ry, rw, rh);
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            var g = a.dna && a.dna.genes ? a.dna.genes : (a.genes || [0.5, 0.5, 0.5]);
            this.ctx.fillStyle = 'rgb(' + Math.round(g[0] * 255) + ',' + Math.round(g[1] * 255) + ',' + Math.round(g[2] * 255) + ')';
            var sx = a.x * scaleX;
            var sy = a.y * scaleY;
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
};

window.app = {
    restart: restart,
    updateInspector: updateInspector,
    startSimulationLoop: startSimulationLoop,
    hoveredIndividual: null,
    mouseSketchX: null,
    mouseSketchY: null,
    currentIndividuals: [],
    panMode: false,
    zoomMode: false,
    _panStart: null,
    _onMouseMove: function (e) {
        var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
        if (!canvasEl) return;
        var rect = canvasEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var cw = Renderer.getWidth();
        var ch = Renderer.getHeight();
        if (!cw || !ch) return;
        if (window.app.panMode && window.app._panStart) {
            var dx = (e.clientX - window.app._panStart.x) * (cw / rect.width) / (Renderer.getZoom ? Renderer.getZoom() : 1);
            var dy = (e.clientY - window.app._panStart.y) * (ch / rect.height) / (Renderer.getZoom ? Renderer.getZoom() : 1);
            var vp = Renderer.getViewport();
            Renderer.setViewport(vp.x - dx, vp.y - dy);
            window.app._panStart = { x: e.clientX, y: e.clientY };
            return;
        }
        var zoom = Renderer.getZoom ? Renderer.getZoom() : 1;
        var vp = Renderer.getViewport ? Renderer.getViewport() : { x: 0, y: 0 };
        var normX = (e.clientX - rect.left) / rect.width;
        var normY = (e.clientY - rect.top) / rect.height;
        _mouseX = vp.x + normX * (cw / zoom);
        _mouseY = vp.y + normY * (ch / zoom);
        hoverCheck();
    },
    _onMouseDown: function (e) {
        if (e.button !== 0) return;
        if (window.app.panMode) {
            window.app._panStart = { x: e.clientX, y: e.clientY };
            var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
            if (canvasEl) canvasEl.style.cursor = 'grabbing';
        }
    },
    _onMouseUp: function (e) {
        if (e.button !== 0) return;
        if (window.app.panMode) {
            window.app._panStart = null;
            var canvasEl = Renderer.getCanvas && Renderer.getCanvas();
            if (canvasEl) canvasEl.style.cursor = 'grab';
        }
    },
    _onMouseLeave: function () {
        _mouseX = null;
        _mouseY = null;
        window.app._panStart = null;
        Renderer.setHovered(null);
        if (window.app.updateInspector) window.app.updateInspector(null);
        lastHoveredIndex = null;
    },
    _minimapLoop: function () {
        if (Minimap.canvas && Renderer.getViewport) {
            var vp = Renderer.getViewport();
            var zoom = Renderer.getZoom();
            var mapSize = Renderer.getMapSize ? Renderer.getMapSize() : { w: CONFIG.mapWidth, h: CONFIG.mapHeight };
            var cw = Renderer.getWidth();
            var ch = Renderer.getHeight();
            Minimap.draw(window.app.currentIndividuals, vp.x, vp.y, zoom, mapSize.w, mapSize.h, cw, ch);
        }
        requestAnimationFrame(window.app._minimapLoop);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
