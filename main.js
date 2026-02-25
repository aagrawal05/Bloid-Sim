var populationChart, sizeChart, agilityChart, obsRangeChart;
var sampleCharts = null;
var lastSampleSimTime = 0;
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
    if (window.app && window.app.paused) return;
    var dims = getCanvasDimensions();
    var effectiveSpeed = CONFIG.simulationSpeed;
    var dt = effectiveSpeed / CONFIG.fps;
    window.app.simTime += dt;
    if (typeof sampleCharts === 'function') {
        var interval = (CONFIG.statsSampleInterval || 1);
        if (interval <= 0) interval = 1;
        // Sample charts at most once per configured simulated interval
        if (window.app.simTime - lastSampleSimTime >= interval) {
            lastSampleSimTime = window.app.simTime;
            sampleCharts(window.app.simTime);
        }
    }
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
    if (window.app && window.app.paused) return;
    if (tickIntervalId) clearInterval(tickIntervalId);
    var fps = Math.max(1, Math.min(240, CONFIG.fps));
    tickIntervalId = setInterval(sendWorkerTick, 1000 / fps);
}

function setPaused(paused) {
    if (!window.app) return;
    window.app.paused = !!paused;
    var speedSpan = document.getElementById('speed');
    var playPauseBtn = document.getElementById('playPauseBtn');
    var icon = playPauseBtn && playPauseBtn.querySelector('i');
    if (paused) {
        if (tickIntervalId) { clearInterval(tickIntervalId); tickIntervalId = null; }
        if (speedSpan) speedSpan.textContent = 'Paused';
        if (icon) { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
        if (playPauseBtn) { playPauseBtn.setAttribute('aria-label', 'Play simulation'); playPauseBtn.title = 'Play (Space)'; }
    } else {
        startSimulationLoop();
        if (speedSpan) speedSpan.textContent = (Math.round(CONFIG.simulationSpeed * 10) / 10).toFixed(1) + 'x';
        if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-pause'); }
        if (playPauseBtn) { playPauseBtn.setAttribute('aria-label', 'Pause simulation'); playPauseBtn.title = 'Pause (Space)'; }
    }
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
    var F = layout.FIELD;
    var out = [];
    for (var i = 0; i < n; i++) {
        var base = dataOffset + i * FPA;
        var genes = [f32[base + F.GENE_0], f32[base + F.GENE_1], f32[base + F.GENE_2]];
        var hp = f32[base + F.HP];
        out.push({
            x: f32[base + F.X],
            y: f32[base + F.Y],
            size: f32[base + F.SIZE],
            r: f32[base + F.R],
            g: f32[base + F.G],
            b: f32[base + F.B],
            a: f32[base + F.A],
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
            sharedBuffer = new SharedArrayBuffer(SAB_LAYOUT.BYTE_LENGTH);
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
        agilityChart = charts.agilityChart;
        obsRangeChart = charts.obsRangeChart;
        sampleCharts = charts.sample;

        Inspector.update(null);

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
    if (window.app) window.app.lockedWorldPos = null;
    Inspector.update(null);
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

var _minimapLastVpX = null;
var _minimapLastVpY = null;
var _minimapLastZoom = null;

var _worldMouseX = null;
var _worldMouseY = null;

function buildInspectorData(d) {
    return {
        dna: { genes: d.genes },
        hp: d.hp,
        raycastResults: d.raycastResults,
        networkJSON: d.networkJSON
    };
}

// Lightweight grid for O(1) amortized hover detection
var _hoverGrid = null;
var _hoverGridRef = null;
var HOVER_CELL = 64;

function buildHoverGrid(individuals) {
    var grid = {};
    for (var i = 0; i < individuals.length; i++) {
        var d = individuals[i];
        var cx = Math.floor(d.x / HOVER_CELL);
        var cy = Math.floor(d.y / HOVER_CELL);
        var key = cx + ',' + cy;
        if (!grid[key]) grid[key] = [];
        grid[key].push(i);
    }
    return grid;
}

function findIndividualAt(worldX, worldY) {
    var individuals = window.app.currentIndividuals;
    if (!individuals || individuals.length === 0) return null;

    // Rebuild grid when the array reference changes
    if (individuals !== _hoverGridRef) {
        _hoverGridRef = individuals;
        _hoverGrid = buildHoverGrid(individuals);
    }

    var cx = Math.floor(worldX / HOVER_CELL);
    var cy = Math.floor(worldY / HOVER_CELL);
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            var key = (cx + dx) + ',' + (cy + dy);
            var bucket = _hoverGrid[key];
            if (!bucket) continue;
            for (var k = 0; k < bucket.length; k++) {
                var idx = bucket[k];
                var d = individuals[idx];
                if (dist({ x: worldX, y: worldY }, { x: d.x, y: d.y }) < d.size / 2) {
                    return idx;
                }
            }
        }
    }
    return null;
}

function findLockedIndividual() {
    if (!window.app || !window.app.lockedWorldPos) return null;
    var individuals = window.app.currentIndividuals;
    var lp = window.app.lockedWorldPos;
    var bestIdx = null;
    var bestDist = Infinity;
    var maxRadius = 150;
    for (var i = 0; i < individuals.length; i++) {
        var d = individuals[i];
        var d2 = dist(lp, { x: d.x, y: d.y });
        if (d2 < bestDist && d2 < maxRadius) {
            bestDist = d2;
            bestIdx = i;
        }
    }
    return bestIdx;
}

function updateLockedHighlight() {
    if (!window.app || !window.app.lockedWorldPos) return;
    var idx = findLockedIndividual();
    if (idx == null) {
        window.app.lockedWorldPos = null;
        lastHoveredIndex = null;
        Renderer.setHovered(null);
        Inspector.update(null);
        return;
    }
    var individuals = window.app.currentIndividuals;
    var d = individuals[idx];
    window.app.lockedWorldPos = { x: d.x, y: d.y };

    // Center the camera on the locked individual
    var cw = Renderer.getWidth();
    var ch = Renderer.getHeight();
    var zoom = Renderer.getZoom ? Renderer.getZoom() : 1;
    if (cw > 0 && ch > 0 && zoom > 0) {
        var visW = cw / zoom;
        var visH = ch / zoom;
        var vx = d.x - visW / 2;
        var vy = d.y - visH / 2;
        Renderer.setViewport(vx, vy);
    }

    if (lastHoveredIndex !== idx) {
        lastHoveredIndex = idx;
        Renderer.setHovered(idx);
    }

    Inspector.update(buildInspectorData(d));
}

function hoverCheck() {
    if (window.app.lockedWorldPos) return; // lock tracking handled by updateLockedHighlight
    var foundIndex = null;
    if (_worldMouseX != null && _worldMouseY != null) {
        foundIndex = findIndividualAt(_worldMouseX, _worldMouseY);
    }
    if (foundIndex !== lastHoveredIndex) {
        lastHoveredIndex = foundIndex;
        Renderer.setHovered(foundIndex);
        if (foundIndex == null) {
            Inspector.update(null);
        } else {
            Inspector.update(buildInspectorData(window.app.currentIndividuals[foundIndex]));
        }
    }
}

var Minimap = {
    canvas: null,
    ctx: null,
    width: 140,
    height: 105,
    _dragging: false,
    _onDragMove: null,
    _onDragEnd: null,
    _scrub: function (clientX, clientY) {
        var rect = this.canvas.getBoundingClientRect();
        var px = clientX - rect.left;
        var py = clientY - rect.top;
        var nx = Math.max(0, Math.min(1, px / rect.width));
        var ny = Math.max(0, Math.min(1, py / rect.height));
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
    },
    init: function (parentId) {
        var parent = document.getElementById(parentId);
        if (!parent) return;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.className = 'minimap-canvas';
        this.canvas.setAttribute('aria-label', 'Minimap: drag to pan view');
        this.ctx = this.canvas.getContext('2d');
        parent.appendChild(this.canvas);
        var self = this;
        this._onDragMove = function (e) {
            if (!self._dragging) return;
            self._scrub(e.clientX, e.clientY);
        };
        this._onDragEnd = function () {
            if (!self._dragging) return;
            self._dragging = false;
            document.removeEventListener('mousemove', self._onDragMove);
            document.removeEventListener('mouseup', self._onDragEnd);
        };
        this.canvas.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            self._dragging = true;
            self._scrub(e.clientX, e.clientY);
            document.addEventListener('mousemove', self._onDragMove);
            document.addEventListener('mouseup', self._onDragEnd);
        });
    },
    draw: function (agents, viewportX, viewportY, zoom, mapW, mapH, canvasW, canvasH) {
        if (!this.ctx || !this.canvas) return;
        var w = this.width;
        var h = this.height;
        var scaleX = w / mapW;
        var scaleY = h / mapH;
        this.ctx.fillStyle = THEME.minimapBg;
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.strokeStyle = THEME.minimapBorder;
        this.ctx.strokeRect(0, 0, w, h);
        var visW = canvasW / zoom;
        var visH = canvasH / zoom;
        var rx = viewportX * scaleX;
        var ry = viewportY * scaleY;
        var rw = visW * scaleX;
        var rh = visH * scaleY;
        this.ctx.strokeStyle = THEME.minimapViewport;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(rx, ry, rw, rh);
        this.ctx.fillStyle = THEME.minimapViewFill;
        this.ctx.fillRect(rx, ry, rw, rh);
        for (var i = 0; i < agents.length; i++) {
            var a = agents[i];
            var g = getGenes(a);
            if (!g.length) g = [0.5, 0.5, 0.5];
            var b = (g[2] != null ? g[2] : 0.5);
            this.ctx.fillStyle = 'rgb(' + Math.round(g[0] * 255) + ',' + Math.round(g[1] * 255) + ',' + Math.round(b * 255) + ')';
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
    startSimulationLoop: startSimulationLoop,
    setPaused: setPaused,
    simTime: 0,
    paused: false,
    currentIndividuals: [],
    lockedWorldPos: null,
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
        var normX = (e.clientX - rect.left) / rect.width;
        var normY = (e.clientY - rect.top) / rect.height;
        var world = Renderer.screenToWorld(normX, normY);
        _worldMouseX = world.x;
        _worldMouseY = world.y;
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
            return;
        }
        var worldX = _worldMouseX;
        var worldY = _worldMouseY;
        if (worldX == null || worldY == null) return;
        var idx = findIndividualAt(worldX, worldY);
        if (window.app.lockedWorldPos) {
            var lockedIdx = findLockedIndividual();
            if (idx != null && idx === lockedIdx) {
                window.app.lockedWorldPos = null;
                lastHoveredIndex = idx;
                hoverCheck();
            } else if (idx != null) {
                var ind = window.app.currentIndividuals[idx];
                window.app.lockedWorldPos = { x: ind.x, y: ind.y };
                lastHoveredIndex = idx;
                Renderer.setHovered(idx);
                Inspector.update(buildInspectorData(ind));
            } else {
                window.app.lockedWorldPos = null;
                lastHoveredIndex = null;
                Renderer.setHovered(null);
                Inspector.update(null);
            }
        } else if (idx != null) {
            var ind = window.app.currentIndividuals[idx];
            window.app.lockedWorldPos = { x: ind.x, y: ind.y };
            lastHoveredIndex = idx;
            Renderer.setHovered(idx);
            Inspector.update(buildInspectorData(ind));
        }
    },
    _onMouseLeave: function () {
        _worldMouseX = null;
        _worldMouseY = null;
        window.app._panStart = null;
        if (!window.app.lockedWorldPos) {
            Renderer.setHovered(null);
            Inspector.update(null);
            lastHoveredIndex = null;
        }
    },
    _minimapLoop: function () {
        // When paused nothing moves — skip camera tracking and inspector updates
        if (window.app.lockedWorldPos && !window.app.paused) updateLockedHighlight();
        if (Minimap.canvas && Renderer.getViewport) {
            var vp = Renderer.getViewport();
            var zoom = Renderer.getZoom();
            var vpChanged = vp.x !== _minimapLastVpX || vp.y !== _minimapLastVpY || zoom !== _minimapLastZoom;
            // When running: redraw every frame (agents move). When paused: redraw only if viewport changed.
            if (!window.app.paused || vpChanged) {
                var mapSize = Renderer.getMapSize ? Renderer.getMapSize() : { w: CONFIG.mapWidth, h: CONFIG.mapHeight };
                var cw = Renderer.getWidth();
                var ch = Renderer.getHeight();
                Minimap.draw(window.app.currentIndividuals, vp.x, vp.y, zoom, mapSize.w, mapSize.h, cw, ch);
                _minimapLastVpX = vp.x;
                _minimapLastVpY = vp.y;
                _minimapLastZoom = zoom;
            }
        }
        requestAnimationFrame(window.app._minimapLoop);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
