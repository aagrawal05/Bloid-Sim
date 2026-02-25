/**
 * PixiJS-based renderer: canvas in #canvasParent, draws agents from state array.
 * State items: { x, y, size, r, g, b, a } (and optionally genes, hp for inspector).
 */
var Renderer = (function () {
    var app = null;
    var graphics = null;
    var currentState = [];
    var stateProvider = null;
    var hoveredIndex = null;
    var containerEl = null;

    function rgbToHex(r, g, b) {
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        return (r << 16) | (g << 8) | b;
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

    function loop() {
        if (stateProvider) {
            var provided = stateProvider();
            currentState = Array.isArray(provided) ? provided : [];
        }
        draw();
        if (app) app.renderer.render(app.stage);
        requestAnimationFrame(loop);
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
                graphics = new PIXI.Graphics();
                app.stage.addChild(graphics);
                if (typeof CONSTANTS !== 'undefined') {
                    CONSTANTS.canvasWidth = app.renderer.width;
                    CONSTANTS.canvasHeight = app.renderer.height;
                }
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
