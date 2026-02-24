var population;
var populationChart, sizeChart, speedChart, angleSpeedChart;
var canvasWidth = CONSTANTS.canvasWidth;
var canvasHeight = CONSTANTS.canvasHeight;
var lastHoveredIndividual = null;

function sizeCanvasToContainer() {
    var container = document.getElementById("canvasParent");
    if (!container) return;
    var w = container.clientWidth;
    var h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (typeof resizeCanvas === "function") {
        resizeCanvas(w, h);
    }
    canvasWidth = w;
    canvasHeight = h;
    CONSTANTS.canvasWidth = w;
    CONSTANTS.canvasHeight = h;
}

function setup() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#9a9ca5';
        Chart.defaults.font.family = '"DM Sans", system-ui, sans-serif';
        Chart.defaults.borderColor = '#373a40';
        Chart.defaults.backgroundColor = '#25262b';
    }
    var container = document.getElementById("canvasParent");
    var w = (container && container.clientWidth > 0) ? container.clientWidth : CONSTANTS.canvasWidth;
    var h = (container && container.clientHeight > 0) ? container.clientHeight : CONSTANTS.canvasHeight;
    var simulationCanvas = createCanvas(w, h);
    simulationCanvas.parent("canvasParent");
    canvasWidth = w;
    canvasHeight = h;
    CONSTANTS.canvasWidth = w;
    CONSTANTS.canvasHeight = h;

    if (container && typeof ResizeObserver !== "undefined") {
        var resizeObserver = new ResizeObserver(function () {
            sizeCanvasToContainer();
        });
        resizeObserver.observe(container);
    }
    requestAnimationFrame(function () {
        sizeCanvasToContainer();
    });

    frameRate(CONFIG.fps);
    population = new Population(CONFIG.initialPopulation);

    window.app.mouseSketchX = null;
    window.app.mouseSketchY = null;
    var canvasEl = document.querySelector("#canvasParent canvas");
    if (canvasEl) {
        canvasEl.addEventListener("mousemove", function (e) {
            var rect = canvasEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            var scaleX = canvasWidth / rect.width;
            var scaleY = canvasHeight / rect.height;
            window.app.mouseSketchX = (e.clientX - rect.left) * scaleX;
            window.app.mouseSketchY = (e.clientY - rect.top) * scaleY;
        });
        canvasEl.addEventListener("mouseleave", function () {
            window.app.mouseSketchX = null;
            window.app.mouseSketchY = null;
        });
    }

    var getPopulation = function () { return population; };
    var charts = Charts.createAll(getPopulation);
    populationChart = charts.populationChart;
    sizeChart = charts.sizeChart;
    speedChart = charts.speedChart;
    angleSpeedChart = charts.angleSpeedChart;

    if (window.app.updateInspector) {
        window.app.updateInspector(null);
    }
}

function restart() {
    population = new Population(CONFIG.initialPopulation);
    lastHoveredIndividual = null;
    if (window.app.updateInspector) {
        window.app.updateInspector(null);
    }
}

var inspectorTooltips = {
    size: 'Body size, health pool, and metabolic cost. Larger = more HP and bite radius, can eat smaller agents; pays more cost per timestep. Gene × sizeCoefficient → display size.',
    speed: 'Movement speed in pixels per time. Higher = chase or flee faster. No direct cost; gene × speedCoefficient.',
    angularSpeed: 'Turn rate (heading wobble per step). Higher = more erratic movement; lower = straighter paths. Gene × 2π radians per step.',
    hp: 'Current health. Decreases each step from metabolic cost (size_gene × costCoefficient × dt); eating restores it (prey HP × eatCoefficient).'
};

function updateInspector(individual) {
    var el = document.getElementById("inspectorContent");
    if (!el) return;
    if (!individual) {
        el.innerHTML = '<p class="inspector-placeholder">Hover over an individual</p>';
        return;
    }
    var g = individual.dna.genes;
    el.innerHTML =
        '<dl class="inspector-dl">' +
        '<dt>Size<span class="info-trigger" tabindex="0" role="button" aria-label="Size gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.size + '</span></span></dt><dd>' + g[0].toFixed(3) + '</dd>' +
        '<dt>Speed<span class="info-trigger" tabindex="0" role="button" aria-label="Speed gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.speed + '</span></span></dt><dd>' + g[1].toFixed(3) + '</dd>' +
        '<dt>Angular speed<span class="info-trigger" tabindex="0" role="button" aria-label="Angular speed gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.angularSpeed + '</span></span></dt><dd>' + g[2].toFixed(3) + '</dd>' +
        '<dt>HP<span class="info-trigger" tabindex="0" role="button" aria-label="HP description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + inspectorTooltips.hp + '</span></span></dt><dd>' + individual.hp + '</dd>' +
        '</dl>';
}

window.app = {
    restart: restart,
    updateInspector: updateInspector,
    hoveredIndividual: null,
    mouseSketchX: null,
    mouseSketchY: null
};

function draw() {
    background(37, 38, 43);
    if (population.individuals.length === 0) {
        restart();
    }
    var deltaTime = CONFIG.simulationSpeed / CONFIG.fps;
    population.run(deltaTime);

    var mx = window.app.mouseSketchX;
    var my = window.app.mouseSketchY;
    var hovered = null;
    if (mx != null && my != null) {
        for (var i = 0; i < population.individuals.length; i++) {
            var ind = population.individuals[i];
            var d = dist(mx, my, ind.position.x, ind.position.y);
            if (d < ind.size / 2) {
                hovered = ind;
                break;
            }
        }
    }
    window.app.hoveredIndividual = hovered;
    if (hovered !== lastHoveredIndividual) {
        lastHoveredIndividual = hovered;
        if (window.app.updateInspector) {
            window.app.updateInspector(hovered);
        }
    }

    if (hovered) {
        noFill();
        stroke(77, 171, 247);
        strokeWeight(2);
        ellipse(hovered.position.x, hovered.position.y, hovered.size + 4, hovered.size + 4);
    }

    frameRate(CONFIG.fps);
}
