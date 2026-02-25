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
    var mapWidth = 3200;
    var mapHeight = 2400;

    function rgbToHex(r, g, b) {
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        return (r << 16) | (g << 8) | b;
    }

    function drawGrid() {
        if (!gridGraphics || !worldContainer) return;
        gridGraphics.clear();
        var spacing = 100;
        var lineColor = 0x444444;
        var lineAlpha = 0.5;
        gridGraphics.lineStyle(1, lineColor, lineAlpha);
        var cw = app.renderer.width;
        var ch = app.renderer.height;
        var visW = cw / zoomLevel;
        var visH = ch / zoomLevel;
        var startX = Math.floor(viewportX / spacing) * spacing;
        var startY = Math.floor(viewportY / spacing) * spacing;
        var endX = Math.min(mapWidth, viewportX + visW + spacing);
        var endY = Math.min(mapHeight, viewportY + visH + spacing);
        var x;
        var y;
        for (x = startX; x <= endX; x += spacing) {
            gridGraphics.moveTo(x, startY);
            gridGraphics.lineTo(x, endY);
        }
        for (y = startY; y <= endY; y += spacing) {
            gridGraphics.moveTo(startX, y);
            gridGraphics.lineTo(endX, y);
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

    function updateCamera() {
        if (!worldContainer) return;
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
            viewportX = x;
            viewportY = y;
            clampViewport();
        },

        getViewport: function () {
            return { x: viewportX, y: viewportY };
        },

        setZoom: function (level) {
            zoomLevel = Math.max(0.25, Math.min(4, level));
            clampViewport();
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
