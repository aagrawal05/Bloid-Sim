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
        agilityChart = charts.agilityChart;
        obsRangeChart = charts.obsRangeChart;
        sampleCharts = charts.sample;

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
    if (window.app) window.app.lockedWorldPos = null;
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
    agility: 'Agility codes for both movement speed and turn rate. Higher = faster movement and quicker turning. Gene × agilitySpeedCoefficient → speed; gene × agilityAngleCoefficient → angle change per step.',
    observationRange: 'Raycast length gene. Longer range = more environmental info but higher energy cost per timestep.',
    hp: 'Current health. Decreases each step from metabolic cost (size_gene × costCoefficient × dt) and observation cost; eating restores it (prey HP × eatCoefficient).'
};

var _inspectorGenesKey = null;
var _inspectorHpFillEl = null;
var _inspectorHpTextEl = null;
var _inspectorRaycastsEl = null;
var _inspectorLastHpFrac = null;
var _inspectorLastHpText = null;
var _inspectorLastRaycastKey = null;
var _inspectorNetworkKey = null;
var _minimapLastVpX = null;
var _minimapLastVpY = null;
var _minimapLastZoom = null;

function renderInspectorNetwork(networkJSON) {
    var netWrap = document.getElementById('inspectorNetworkWrap');
    var netStatus = document.getElementById('inspectorNetworkStatus');
    var netSvg = document.getElementById('inspectorNetwork');
    if (!netWrap || !netSvg) return;

    function clearNetworkSvg() {
        if (typeof d3 !== 'undefined') {
            d3.select('#inspectorNetwork').selectAll('*').remove();
        }
    }

    var hasNeataptic = (typeof neataptic !== 'undefined' && neataptic && neataptic.Network);
    var hasDrawGraph = (typeof drawGraph === 'function');
    var isSAB = !!useSAB;

    if (!networkJSON) {
        netWrap.style.display = 'block';
        clearNetworkSvg();
        if (netStatus) {
            if (isSAB) {
                netStatus.textContent = 'Network visualization is not available in SharedArrayBuffer (performance) mode. Run without COOP/COEP headers to view behaviour networks.';
            } else {
                netStatus.textContent = 'No behaviour network data is available yet for this agent.';
            }
        }
        return;
    }

    if (!hasNeataptic || !hasDrawGraph) {
        netWrap.style.display = 'block';
        clearNetworkSvg();
        if (netStatus) {
            netStatus.textContent = 'Neural network visualization scripts (neataptic graph + D3/WebCola) did not load, so the behaviour network cannot be drawn.';
        }
        return;
    }

    try {
        var net = neataptic.Network.fromJSON(networkJSON);
        var graphData = net.graph(320, 200);
        clearNetworkSvg();
        drawGraph(graphData, '#inspectorNetwork');
        netWrap.style.display = 'block';
        if (netStatus) netStatus.textContent = '';
    } catch (e) {
        netWrap.style.display = 'block';
        clearNetworkSvg();
        if (netStatus) {
            netStatus.textContent = 'An error occurred while rendering the behaviour network for this agent.';
            console.error('Network rendering error:', e);
        }
    }
}

function updateInspector(individual) {
    var el = document.getElementById('inspectorContent');
    if (!el) return;

    if (!individual) {
        _inspectorGenesKey = null;
        _inspectorHpFillEl = null;
        _inspectorHpTextEl = null;
        _inspectorRaycastsEl = null;
        _inspectorLastHpFrac = null;
        _inspectorLastHpText = null;
        _inspectorLastRaycastKey = null;
        _inspectorNetworkKey = null;
        el.innerHTML = '<p class="inspector-placeholder">Hover over an individual</p>';
        var netWrap = document.getElementById('inspectorNetworkWrap');
        var netStatus = document.getElementById('inspectorNetworkStatus');
        if (netWrap) netWrap.style.display = 'none';
        if (netStatus) netStatus.textContent = '';
        return;
    }

    var g = individual.dna && individual.dna.genes ? individual.dna.genes : individual.genes;
    if (!g) return;

    var genesKey = g[0].toFixed(3) + '|' + g[1].toFixed(3) + '|' + (g[2] != null ? g[2].toFixed(3) : 'na');

    // Rebuild static gene/network UI only when the selected agent changes
    if (genesKey !== _inspectorGenesKey || !_inspectorHpFillEl || !_inspectorRaycastsEl) {
        _inspectorGenesKey = genesKey;
        _inspectorLastHpFrac = null;
        _inspectorLastHpText = null;
        _inspectorLastRaycastKey = null;
        _inspectorNetworkKey = null;

        var obsHtml = g[2] != null
            ? '<dt>Observation range<span class="info-trigger" tabindex="0" role="button" aria-label="Observation range gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' +
            (inspectorTooltips.observationRange || 'Raycast length gene. Longer range = more info but higher energy cost.') +
            '</span></span></dt><dd>' + g[2].toFixed(3) + '</dd>'
            : '';

        el.innerHTML =
            '<dl class="inspector-dl inspector-dl--genes">' +
            '<dt>Size<span class="info-trigger" tabindex="0" role="button" aria-label="Size gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.size + '</span></span></dt><dd>' + g[0].toFixed(3) + '</dd>' +
            '<dt>Agility<span class="info-trigger" tabindex="0" role="button" aria-label="Agility gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.agility + '</span></span></dt><dd>' + g[1].toFixed(3) + '</dd>' +
            obsHtml +
            '</dl>' +
            '<div class="inspector-status">' +
            '  <div class="inspector-hp-row">' +
            '    <div class="inspector-hp-label">HP</div>' +
            '    <div class="inspector-hp-body">' +
            '      <div class="inspector-hp-bar"><div class="inspector-hp-bar-fill" id="inspectorHpFill"></div></div>' +
            '      <div class="inspector-hp-text" id="inspectorHpText"></div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="inspector-raycasts-wrap">' +
            '    <h3 class="inspector-raycasts-heading">Raycast detections</h3>' +
            '    <div id="inspectorRaycasts" class="inspector-raycasts"></div>' +
            '  </div>' +
            '</div>';

        _inspectorHpFillEl = document.getElementById('inspectorHpFill');
        _inspectorHpTextEl = document.getElementById('inspectorHpText');
        _inspectorRaycastsEl = document.getElementById('inspectorRaycasts');

        if (genesKey !== _inspectorNetworkKey) {
            _inspectorNetworkKey = genesKey;
            renderInspectorNetwork(individual.networkJSON);
        }
    }

    // Dynamic HP status — only write DOM if value changed
    var sizeGene = g[0] != null ? g[0] : 0;
    var maxHp = Math.max(1, Math.round(sizeGene * CONFIG.hpCoefficient));
    var hp = individual.hp != null ? individual.hp : 0;
    if (hp < 0) hp = 0;
    if (hp > maxHp) hp = maxHp;

    var frac = maxHp > 0 ? (hp / maxHp) : 0;
    var hpFracStr = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    var hpText = Math.round(hp) + ' / ' + maxHp;
    if (_inspectorHpFillEl && hpFracStr !== _inspectorLastHpFrac) {
        _inspectorHpFillEl.style.width = hpFracStr;
        _inspectorLastHpFrac = hpFracStr;
    }
    if (_inspectorHpTextEl && hpText !== _inspectorLastHpText) {
        _inspectorHpTextEl.textContent = hpText;
        _inspectorLastHpText = hpText;
    }

    // Dynamic raycasts — only rebuild DOM if ray data changed
    if (_inspectorRaycastsEl) {
        var raycastResults = individual.raycastResults || [];
        var raycastKey = '';
        for (var i = 0; i < raycastResults.length; i++) {
            var rk = raycastResults[i];
            raycastKey += rk.type + ':' + (rk.normDist != null ? rk.normDist.toFixed(2) : '-') + '|';
        }
        if (raycastKey !== _inspectorLastRaycastKey) {
            _inspectorLastRaycastKey = raycastKey;
            if (!raycastResults.length) {
                _inspectorRaycastsEl.innerHTML = '<p class="inspector-placeholder">No raycast detections</p>';
            } else {
                var maxRange = (g[2] != null ? g[2] : 0) * CONFIG.observationRangeCoefficient;
                var html = '<table class="raycast-table"><tr><th>Ray</th><th>Type</th><th>Dist</th></tr>';
                for (var i = 0; i < raycastResults.length; i++) {
                    var r = raycastResults[i];
                    var typeStr = r.type === 0 ? 'Empty' : (r.type === 0.5 ? 'Wall' : 'Agent');
                    var cell;
                    if (r.normDist == null || !maxRange) {
                        cell = '-';
                    } else {
                        var fraction = Math.max(0, Math.min(1, r.normDist));
                        var distAbs = Math.round(fraction * maxRange);
                        cell = '<div class="raycast-bar"><div class="raycast-bar-fill" style="width:' +
                            (fraction * 100) + '%"></div><span class="raycast-bar-text">' +
                            distAbs + ' / ' + Math.round(maxRange) + '</span></div>';
                    }
                    html += '<tr><td>' + (i + 1) + '</td><td>' + typeStr + '</td><td>' + cell + '</td></tr>';
                }
                html += '</table>';
                _inspectorRaycastsEl.innerHTML = html;
            }
        }
    }
}

var _mouseX = null;
var _mouseY = null;


function findIndividualAt(worldX, worldY) {
    var individuals = window.app.currentIndividuals;
    for (var i = 0; i < individuals.length; i++) {
        var d = individuals[i];
        if (dist({ x: worldX, y: worldY }, { x: d.x, y: d.y }) < d.size / 2) {
            return i;
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
        if (window.app.updateInspector) window.app.updateInspector(null);
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

    if (window.app.updateInspector) {
        window.app.updateInspector({
            dna: { genes: d.genes },
            hp: d.hp,
            raycastResults: d.raycastResults,
            networkJSON: d.networkJSON
        });
    }
}

function hoverCheck() {
    if (window.app.lockedWorldPos) return; // lock tracking handled by updateLockedHighlight
    var foundIndex = null;
    if (_mouseX != null && _mouseY != null) {
        foundIndex = findIndividualAt(_mouseX, _mouseY);
    }
    if (foundIndex !== lastHoveredIndex) {
        lastHoveredIndex = foundIndex;
        Renderer.setHovered(foundIndex);
        if (window.app.updateInspector) {
            if (foundIndex == null) {
                window.app.updateInspector(null);
            } else {
                var drawable = window.app.currentIndividuals[foundIndex];
                window.app.updateInspector({
                    dna: { genes: drawable.genes },
                    hp: drawable.hp,
                    raycastResults: drawable.raycastResults,
                    networkJSON: drawable.networkJSON
                });
            }
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
    updateInspector: updateInspector,
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
            return;
        }
        var mx = _mouseX;
        var my = _mouseY;
        if (mx == null || my == null) return;
        var idx = findIndividualAt(mx, my);
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
                if (window.app.updateInspector) {
                    window.app.updateInspector({
                        dna: { genes: ind.genes },
                        hp: ind.hp,
                        raycastResults: ind.raycastResults,
                        networkJSON: ind.networkJSON
                    });
                }
            } else {
                window.app.lockedWorldPos = null;
                lastHoveredIndex = null;
                Renderer.setHovered(null);
                if (window.app.updateInspector) window.app.updateInspector(null);
            }
        } else if (idx != null) {
            var ind = window.app.currentIndividuals[idx];
            window.app.lockedWorldPos = { x: ind.x, y: ind.y };
            lastHoveredIndex = idx;
            Renderer.setHovered(idx);
            if (window.app.updateInspector) {
                ind = window.app.currentIndividuals[idx];
                window.app.updateInspector({
                    dna: { genes: ind.genes },
                    hp: ind.hp,
                    raycastResults: ind.raycastResults,
                    networkJSON: ind.networkJSON
                });
            }
        }
    },
    _onMouseLeave: function () {
        _mouseX = null;
        _mouseY = null;
        window.app._panStart = null;
        if (!window.app.lockedWorldPos) {
            Renderer.setHovered(null);
            if (window.app.updateInspector) window.app.updateInspector(null);
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
