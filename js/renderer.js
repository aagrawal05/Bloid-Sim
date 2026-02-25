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
    var ZOOM_LERP_SPEED = 0.18;
    var ZOOM_LEVELS = [0.25, 0.35, 0.5, 0.71, 1, 1.41, 2, 2.83, 4];
    var ARROW_LEN = 12;
    var ARROW_WIDTH = 6;

    function rgbToHex(r, g, b) {
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        return (r << 16) | (g << 8) | b;
    }

    function drawGrid() {
        if (!gridGraphics || !worldContainer) return;
        gridGraphics.clear();
        var minorCell = THEME.gridMinorCell;
        var majorCell = THEME.gridMajorCell;
        var lineColor = THEME.gridLineHex;
        var lineAlpha = THEME.gridLineAlpha;
        var cw = app.renderer.width;
        var ch = app.renderer.height;
        var visW = cw / zoomLevel;
        var visH = ch / zoomLevel;
        var startX = Math.max(0, Math.floor(viewportX / minorCell) * minorCell);
        var startY = Math.max(0, Math.floor(viewportY / minorCell) * minorCell);
        var endX = Math.min(mapWidth, viewportX + visW + minorCell);
        var endY = Math.min(mapHeight, viewportY + visH + minorCell);

        gridGraphics.beginFill(THEME.gridBgHex);
        gridGraphics.drawRect(0, 0, mapWidth, mapHeight);
        gridGraphics.endFill();

        var minorLineWidth = Math.max(0.5, 1 / zoomLevel);
        var majorLineWidth = Math.max(1, 2.5 / zoomLevel);
        var clipY1 = Math.max(0, viewportY);
        var clipY2 = Math.min(mapHeight, viewportY + visH);
        var clipX1 = Math.max(0, viewportX);
        var clipX2 = Math.min(mapWidth, viewportX + visW);

        function drawVerticalLines(step, lw, color, alpha) {
            gridGraphics.lineStyle(lw, color, alpha);
            for (var x = Math.floor(viewportX / step) * step; x <= mapWidth; x += step) {
                if (x < clipX1 - step || x > clipX2 + step) continue;
                gridGraphics.moveTo(x, clipY1);
                gridGraphics.lineTo(x, clipY2);
            }
        }
        function drawHorizontalLines(step, lw, color, alpha) {
            gridGraphics.lineStyle(lw, color, alpha);
            for (var y = Math.floor(viewportY / step) * step; y <= mapHeight; y += step) {
                if (y < clipY1 - step || y > clipY2 + step) continue;
                gridGraphics.moveTo(clipX1, y);
                gridGraphics.lineTo(clipX2, y);
            }
        }

        drawVerticalLines(minorCell, minorLineWidth, lineColor, lineAlpha);
        drawHorizontalLines(minorCell, minorLineWidth, lineColor, lineAlpha);
        drawVerticalLines(majorCell, majorLineWidth, lineColor, Math.min(1, lineAlpha + 0.2));
        drawHorizontalLines(majorCell, majorLineWidth, lineColor, Math.min(1, lineAlpha + 0.2));
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
            graphics.lineStyle(2, THEME.hoverOutlineHex, 1);
            graphics.drawCircle(h.x, h.y, h.size / 2 + 2);
            graphics.lineStyle(0);
            if (h.raycastResults && h.raycastResults.length > 0 && typeof h.raycastLength === 'number') {
                var angle = typeof h.angle === 'number' ? h.angle : 0;
                var len = h.raycastLength || 150;
                var forwardRayEndX = h.x;
                var forwardRayEndY = h.y;
                for (var ri = 0; ri < h.raycastResults.length; ri++) {
                    var r = h.raycastResults[ri];
                    var rayAngle = angle + (ri / h.raycastResults.length) * Math.PI * 2;
                    var dist = (r.normDist != null ? r.normDist : 1) * len;
                    var endX = h.x + Math.cos(rayAngle) * dist;
                    var endY = h.y + Math.sin(rayAngle) * dist;
                    var lineColor = r.type === 0 ? THEME.rayEmptyHex : (r.type === 0.5 ? THEME.rayWallHex : THEME.rayAgentHex);
                    var lineAlpha = r.type === 0 ? THEME.rayEmptyAlpha : THEME.rayHitAlpha;
                    graphics.lineStyle(2, lineColor, lineAlpha);
                    graphics.moveTo(h.x, h.y);
                    graphics.lineTo(endX, endY);
                    if (ri === 0) {
                        forwardRayEndX = endX;
                        forwardRayEndY = endY;
                    }
                }
                var arrowLen = ARROW_LEN;
                var arrowWidth = ARROW_WIDTH;
                var tipX = forwardRayEndX;
                var tipY = forwardRayEndY;
                var backX = tipX - arrowLen * Math.cos(angle);
                var backY = tipY - arrowLen * Math.sin(angle);
                var leftX = backX + arrowWidth * Math.sin(angle);
                var leftY = backY - arrowWidth * Math.cos(angle);
                var rightX = backX - arrowWidth * Math.sin(angle);
                var rightY = backY + arrowWidth * Math.cos(angle);
                graphics.lineStyle(2, THEME.arrowFillHex, 0.95);
                graphics.beginFill(THEME.arrowFillHex, 0.6);
                graphics.moveTo(tipX, tipY);
                graphics.lineTo(leftX, leftY);
                graphics.lineTo(rightX, rightY);
                graphics.closePath();
                graphics.endFill();
                graphics.lineStyle(0);
            }
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
        zoomLevel += (targetZoom - zoomLevel) * ZOOM_LERP_SPEED;
        if (Math.abs(zoomLevel - targetZoom) < 0.001) zoomLevel = targetZoom;
        viewportX += (targetViewportX - viewportX) * ZOOM_LERP_SPEED;
        viewportY += (targetViewportY - viewportY) * ZOOM_LERP_SPEED;
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
                app = new PIXI.Application({ width: w, height: h, background: THEME.canvasBgHex });
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
        },

        screenToWorld: function (normX, normY) {
            var cw = app ? app.renderer.width : 0;
            var ch = app ? app.renderer.height : 0;
            return {
                x: viewportX + normX * (cw / zoomLevel),
                y: viewportY + normY * (ch / zoomLevel)
            };
        }
    };
})();
