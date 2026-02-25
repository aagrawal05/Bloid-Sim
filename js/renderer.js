/**
 * PixiJS-based renderer: canvas in #canvasParent, draws agents from state array.
 * State items: { x, y, size, r, g, b, a } (and optionally genes, hp for inspector).
 * World container has viewport (pan) and zoom; grid drawn behind agents.
 */
var Renderer = (function () {
    var app = null;
    var worldContainer = null;
    var gridGraphics = null;
    var graphics = null;
    var currentState = [];
    var stateProvider = null;
    var hoveredIndex = null;
    var containerEl = null;
    var viewportX = 0;
    var viewportY = 0;
    var zoomLevel = 1;
    var targetZoom = 1;
    var targetViewportX = 0;
    var targetViewportY = 0;
    var mapWidth = 3200;
    var mapHeight = 2400;
    var zoomLerpSpeed = 0.18;
    var ZOOM_LEVELS = [0.25, 0.35, 0.5, 0.71, 1, 1.41, 2, 2.83, 4];

    function rgbToHex(r, g, b) {
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        return (r << 16) | (g << 8) | b;
    }

    function drawGrid() {
        if (!gridGraphics || !worldContainer) return;
        gridGraphics.clear();
        var minorCell = 100;
        var majorCell = 500;
        var lineColor = 0x444444;
        var lineAlpha = 0.5;
        var cw = app.renderer.width;
        var ch = app.renderer.height;
        var visW = cw / zoomLevel;
        var visH = ch / zoomLevel;
        var startX = Math.floor(viewportX / minorCell) * minorCell;
        var startY = Math.floor(viewportY / minorCell) * minorCell;
        var endX = Math.min(mapWidth, viewportX + visW + minorCell);
        var endY = Math.min(mapHeight, viewportY + visH + minorCell);

        var minorLineWidth = Math.max(0.5, 1 / zoomLevel);
        var majorLineWidth = Math.max(1, 2.5 / zoomLevel);

        gridGraphics.lineStyle(minorLineWidth, lineColor, lineAlpha);
        for (var x = startX; x < endX; x += minorCell) {
            for (var y = startY; y < endY; y += minorCell) {
                gridGraphics.drawRect(x, y, minorCell, minorCell);
            }
        }

        gridGraphics.lineStyle(majorLineWidth, lineColor, Math.min(1, lineAlpha + 0.2));
        for (var x = Math.floor(viewportX / majorCell) * majorCell; x < endX; x += majorCell) {
            for (var y = Math.floor(viewportY / majorCell) * majorCell; y < endY; y += majorCell) {
                gridGraphics.drawRect(x, y, majorCell, majorCell);
            }
        }
        gridGraphics.lineStyle(0);
    }

    function draw() {
        if (!graphics || !app) return;
        graphics.clear();

        for (var i = 0; i < currentState.length; i++) {
            var d = currentState[i];
            var hex = rgbToHex(d.r, d.g, d.b);
            var alpha = typeof d.a === 'number' ? d.a / 255 : 1;
            graphics.beginFill(hex, alpha);
            graphics.drawCircle(d.x, d.y, d.size / 2);
            graphics.endFill();
        }

        if (hoveredIndex != null && hoveredIndex >= 0 && hoveredIndex < currentState.length) {
            var h = currentState[hoveredIndex];
            graphics.lineStyle(2, 0xffffff, 1);
            graphics.drawCircle(h.x, h.y, h.size / 2 + 2);
            graphics.lineStyle(0);
        }
    }

    function findNearestZoomIndex(z) {
        var best = 0;
        var bestDiff = Infinity;
        for (var i = 0; i < ZOOM_LEVELS.length; i++) {
            var d = Math.abs(ZOOM_LEVELS[i] - z);
            if (d < bestDiff) { bestDiff = d; best = i; }
        }
        return best;
    }

    function updateCamera() {
        if (!worldContainer || !app) return;
        zoomLevel += (targetZoom - zoomLevel) * zoomLerpSpeed;
        if (Math.abs(zoomLevel - targetZoom) < 0.001) zoomLevel = targetZoom;
        viewportX += (targetViewportX - viewportX) * zoomLerpSpeed;
        viewportY += (targetViewportY - viewportY) * zoomLerpSpeed;
        if (Math.abs(viewportX - targetViewportX) < 0.5) viewportX = targetViewportX;
        if (Math.abs(viewportY - targetViewportY) < 0.5) viewportY = targetViewportY;
        clampViewport();
        worldContainer.x = -viewportX * zoomLevel;
        worldContainer.y = -viewportY * zoomLevel;
        worldContainer.scale.set(zoomLevel);
        drawGrid();
    }

    function loop() {
        updateCamera();
        if (stateProvider) {
            var provided = stateProvider();
            currentState = Array.isArray(provided) ? provided : [];
        }
        draw();
        if (app) app.renderer.render(app.stage);
        requestAnimationFrame(loop);
    }

    function clampViewport() {
        var cw = app ? app.renderer.width : 0;
        var ch = app ? app.renderer.height : 0;
        var visW = cw / zoomLevel;
        var visH = ch / zoomLevel;
        var maxX = Math.max(0, mapWidth - visW);
        var maxY = Math.max(0, mapHeight - visH);
        viewportX = Math.max(0, Math.min(maxX, viewportX));
        viewportY = Math.max(0, Math.min(maxY, viewportY));
    }

    return {
        init: function (container, callback) {
            containerEl = typeof container === 'string' ? document.getElementById(container) : container;
            if (!containerEl) { if (callback) callback(); return; }
            var w = containerEl.clientWidth || 640;
            var h = containerEl.clientHeight || 480;
            if (typeof PIXI === 'undefined') { if (callback) callback(); return; }
            try {
                app = new PIXI.Application({ width: w, height: h, background: 0x333333 });
                var view = app.canvas || app.view;
                if (view) {
                    view.style.display = 'block';
                    view.style.width = '100%';
                    view.style.height = '100%';
                    containerEl.appendChild(view);
                }
                worldContainer = new PIXI.Container();
                app.stage.addChild(worldContainer);
                gridGraphics = new PIXI.Graphics();
                worldContainer.addChild(gridGraphics);
                graphics = new PIXI.Graphics();
                worldContainer.addChild(graphics);
                if (typeof CONSTANTS !== 'undefined') {
                    CONSTANTS.canvasWidth = app.renderer.width;
                    CONSTANTS.canvasHeight = app.renderer.height;
                }
                if (typeof CONFIG !== 'undefined') {
                    mapWidth = CONFIG.mapWidth || 3200;
                    mapHeight = CONFIG.mapHeight || 2400;
                }
                updateCamera();
                loop();
                if (typeof ResizeObserver !== 'undefined') {
                    var ro = new ResizeObserver(function () {
                        var cw = containerEl.clientWidth;
                        var ch = containerEl.clientHeight;
                        if (cw > 0 && ch > 0 && app && app.renderer) {
                            app.renderer.resize(cw, ch);
                            if (typeof CONSTANTS !== 'undefined') {
                                CONSTANTS.canvasWidth = cw;
                                CONSTANTS.canvasHeight = ch;
                            }
                            clampViewport();
                        }
                    });
                    ro.observe(containerEl);
                }
            } catch (err) {
                console.error('PixiJS init failed', err);
            }
            if (callback) callback();
        },

        setState: function (drawables) {
            currentState = Array.isArray(drawables) ? drawables : [];
        },

        setStateProvider: function (fn) {
            stateProvider = typeof fn === 'function' ? fn : null;
        },

        setHovered: function (index) {
            hoveredIndex = index;
        },

        setViewport: function (x, y) {
            viewportX = targetViewportX = x;
            viewportY = targetViewportY = y;
            clampViewport();
            targetViewportX = viewportX;
            targetViewportY = viewportY;
        },

        getViewport: function () {
            return { x: viewportX, y: viewportY };
        },

        setZoom: function (level) {
            var z = Math.max(0.25, Math.min(4, level));
            targetZoom = z;
            targetViewportX = viewportX;
            targetViewportY = viewportY;
        },

        setZoomStep: function (direction, normX, normY) {
            var idx = findNearestZoomIndex(zoomLevel);
            idx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + direction));
            var newZoom = ZOOM_LEVELS[idx];
            var cw = app ? app.renderer.width : 0;
            var ch = app ? app.renderer.height : 0;
            if (cw > 0 && ch > 0 && typeof normX === 'number' && typeof normY === 'number') {
                var wx = viewportX + normX * (cw / zoomLevel);
                var wy = viewportY + normY * (ch / zoomLevel);
                targetViewportX = wx - normX * (cw / newZoom);
                targetViewportY = wy - normY * (ch / newZoom);
            } else {
                targetViewportX = viewportX;
                targetViewportY = viewportY;
            }
            targetZoom = newZoom;
        },

        getZoom: function () {
            return zoomLevel;
        },

        setMapSize: function (w, h) {
            mapWidth = w;
            mapHeight = h;
        },

        getMapSize: function () {
            return { w: mapWidth, h: mapHeight };
        },

        getCanvas: function () {
            if (!app) return null;
            return app.canvas || app.view || null;
        },

        getWidth: function () {
            return app && app.renderer ? app.renderer.width : 0;
        },

        getHeight: function () {
            return app && app.renderer ? app.renderer.height : 0;
        }
    };
})();
