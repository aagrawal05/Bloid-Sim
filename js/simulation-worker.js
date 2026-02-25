/**
 * Web Worker: runs simulation (eat, update, reproduce, death). No DOM/canvas.
 * Uses math-utils; CONFIG/CONSTANTS come from messages.
 * When sab is provided, writes state to SharedArrayBuffer instead of postMessage.
 */
importScripts('math-utils.js');
importScripts('spatial-hash.js');
try { importScripts('https://unpkg.com/js-quadtree'); } catch (e) { /* quadtree optional; fallback to brute force */ }

var cfg = {};
var cst = { canvasWidth: 640, canvasHeight: 480, mapWidth: 3200, mapHeight: 2400 };
var population = null;
var sab = null;
var sabLayout = null;

function WorkerDNA(inheritedGenes) {
    if (inheritedGenes != null) {
        this.genes = inheritedGenes;
    } else {
        this.genes = [
            random(cst.minSize, 1),
            random(cst.minSpeed, 1),
            random(cst.minAngleSpeed, 1),
        ];
    }
}

WorkerDNA.prototype.mutate = function () {
    for (var i = 0; i < this.genes.length; i++) {
        if (random() < cfg.mutationRate) {
            switch (i) {
                case 0: this.genes[i] = random(cst.minSize, 1); break;
                case 1: this.genes[i] = random(cst.minSpeed, 1); break;
                case 2: this.genes[i] = random(cst.minAngleSpeed, 1); break;
            }
        }
    }
};

function WorkerIndividual(initialPosition, dna) {
    this.position = initialPosition;
    this.dna = dna != null ? dna : new WorkerDNA();
    this.size = Math.floor(this.dna.genes[0] * cfg.sizeCoefficient);
    this.speed = Math.floor(this.dna.genes[1] * cfg.speedCoefficient);
    this.angleSpeed = this.dna.genes[2] * TWO_PI;
    this.hp = Math.floor(this.dna.genes[0] * cfg.hpCoefficient);
    this.angle = random(TWO_PI);
}

WorkerIndividual.prototype.update = function (dt) {
    this.angle += random(-this.angleSpeed * dt, this.angleSpeed * dt);
    this.position.x += Math.cos(this.angle) * this.speed * dt;
    this.position.y += Math.sin(this.angle) * this.speed * dt;
    var w = cst.mapWidth;
    var h = cst.mapHeight;
    var r = this.size / 2;
    if (this.position.x < r) {
        this.position.x = r;
        this.angle = Math.PI - this.angle;
    }
    if (this.position.y < r) {
        this.position.y = r;
        this.angle = -this.angle;
    }
    if (this.position.x > w - r) {
        this.position.x = w - r;
        this.angle = Math.PI - this.angle;
    }
    if (this.position.y > h - r) {
        this.position.y = h - r;
        this.angle = -this.angle;
    }
    this.hp -= this.dna.genes[0] * cfg.costCoefficient * dt;
};

WorkerIndividual.prototype.toDrawable = function () {
    var g = this.dna.genes;
    return {
        x: this.position.x,
        y: this.position.y,
        size: this.size,
        r: g[0] * 255,
        g: g[1] * 255,
        b: g[2] * 255,
        a: this.hp,
        genes: g.slice(0),
        hp: this.hp
    };
};

WorkerIndividual.prototype.reproduce = function (dt) {
    if (random() < cfg.reproductionRate * dt) {
        var childDNA = new WorkerDNA(JSON.parse(JSON.stringify(this.dna.genes)));
        childDNA.mutate();
        return new WorkerIndividual(
            vec2(random(cst.mapWidth), random(cst.mapHeight)),
            childDNA
        );
    }
    return null;
};

WorkerIndividual.prototype.run = function (dt) {
    this.update(dt);
};

WorkerIndividual.prototype.dead = function () {
    return this.hp <= 0;
};

function WorkerPopulation(populationSize) {
    this.individuals = [];
    for (var i = 0; i < populationSize; i++) {
        this.individuals.push(new WorkerIndividual(vec2(random(cst.mapWidth), random(cst.mapHeight))));
    }
}

WorkerPopulation.prototype.run = function (dt) {
    this.individuals = this.eat(this.individuals);
    for (var i = this.individuals.length - 1; i >= 0; i--) {
        this.individuals[i].run(dt);
        var child = this.individuals[i].reproduce(dt);
        if (child != null) this.individuals.push(child);
        if (this.individuals[i].dead()) {
            this.individuals.splice(i, 1);
        }
    }
};

WorkerPopulation.prototype.eatBruteForce = function (individuals) {
    var toRemove = [];
    for (var i = individuals.length - 1; i >= 0; i--) {
        for (var j = individuals.length - 1; j >= 0; j--) {
            if (j !== i) {
                var d = dist(individuals[i].position, individuals[j].position);
                if (
                    d < individuals[i].size / 2 &&
                    individuals[i].size > individuals[j].size * cfg.compareCoefficient
                ) {
                    individuals[i].hp += Math.floor(individuals[j].hp * cfg.eatCoefficient);
                    toRemove.push(individuals[j]);
                }
            }
        }
    }
    return individuals.filter(function (agent) { return toRemove.indexOf(agent) === -1; });
};

WorkerPopulation.prototype.eatQuadtree = function (individuals) {
    if (individuals.length === 0) return individuals;
    if (typeof QT === 'undefined') return this.eatBruteForce(individuals);
    var toRemove = [];
    var box = new QT.Box(0, 0, cst.mapWidth, cst.mapHeight);
    var qt = new QT.QuadTree(box);
    for (var i = 0; i < individuals.length; i++) {
        var ind = individuals[i];
        qt.insert(new QT.Point(ind.position.x, ind.position.y, { agent: ind }));
    }
    for (var i = 0; i < individuals.length; i++) {
        var a = individuals[i];
        var r = a.size / 2;
        var nearby = qt.query(new QT.Circle(a.position.x, a.position.y, r));
        for (var n = 0; n < nearby.length; n++) {
            var other = nearby[n].data && nearby[n].data.agent;
            if (!other || other === a) continue;
            if (dist(a.position, other.position) < r && a.size > other.size * cfg.compareCoefficient) {
                a.hp += Math.floor(other.hp * cfg.eatCoefficient);
                toRemove.push(other);
            }
        }
    }
    return individuals.filter(function (agent) { return toRemove.indexOf(agent) === -1; });
};

WorkerPopulation.prototype.eatSpatialHash = function (individuals) {
    if (individuals.length === 0) return individuals;
    var cellSize = 80;
    for (var i = 0; i < individuals.length; i++) {
        var s = individuals[i].size / 2;
        if (s > cellSize / 2) cellSize = Math.ceil(s * 2);
    }
    var hash = new SpatialHash(cellSize);
    for (var i = 0; i < individuals.length; i++) {
        individuals[i]._id = i;
        hash.insert(individuals[i]);
    }
    var toRemove = [];
    for (var i = 0; i < individuals.length; i++) {
        var a = individuals[i];
        var r = a.size / 2;
        var nearby = hash.queryCircle(a.position.x, a.position.y, r);
        for (var n = 0; n < nearby.length; n++) {
            var other = nearby[n];
            if (other === a) continue;
            if (dist(a.position, other.position) < r && a.size > other.size * cfg.compareCoefficient) {
                a.hp += Math.floor(other.hp * cfg.eatCoefficient);
                toRemove.push(other);
            }
        }
    }
    return individuals.filter(function (agent) { return toRemove.indexOf(agent) === -1; });
};

WorkerPopulation.prototype.eat = function (individuals) {
    var mode = (cfg.spatialIndex === 'quadtree' || cfg.spatialIndex === 'spatialhash') ? cfg.spatialIndex : 'none';
    if (mode === 'quadtree') return this.eatQuadtree(individuals);
    if (mode === 'spatialhash') return this.eatSpatialHash(individuals);
    return this.eatBruteForce(individuals);
};

function applyConfigAndConstants(msg) {
    if (msg.config) {
        cfg.fps = msg.config.fps;
        cfg.simulationSpeed = msg.config.simulationSpeed;
        cfg.mutationRate = msg.config.mutationRate;
        cfg.reproductionRate = msg.config.reproductionRate;
        cfg.initialPopulation = msg.config.initialPopulation;
        cfg.sizeCoefficient = msg.config.sizeCoefficient;
        cfg.speedCoefficient = msg.config.speedCoefficient;
        cfg.hpCoefficient = msg.config.hpCoefficient;
        cfg.eatCoefficient = msg.config.eatCoefficient;
        cfg.compareCoefficient = msg.config.compareCoefficient;
        cfg.costCoefficient = msg.config.costCoefficient;
        if (msg.config.spatialIndex !== undefined) cfg.spatialIndex = msg.config.spatialIndex;
    }
    if (msg.constants) {
        cst.minSize = msg.constants.minSize;
        cst.minSpeed = msg.constants.minSpeed;
        cst.minAngleSpeed = msg.constants.minAngleSpeed;
    }
    if (typeof msg.canvasWidth === 'number') cst.canvasWidth = msg.canvasWidth;
    if (typeof msg.canvasHeight === 'number') cst.canvasHeight = msg.canvasHeight;
    if (typeof msg.mapWidth === 'number') cst.mapWidth = msg.mapWidth;
    if (typeof msg.mapHeight === 'number') cst.mapHeight = msg.mapHeight;
}

function buildState() {
    if (!population) return [];
    return population.individuals.map(function (ind) { return ind.toDrawable(); });
}

function writeStateToSAB() {
    if (!sab || !sabLayout || !population) return;
    var layout = sabLayout;
    var MAX = layout.MAX_AGENTS;
    var FPA = layout.FLOATS_PER_AGENT;
    var floatsPerBuffer = FPA * MAX;
    var bytesPerBuffer = 4 + floatsPerBuffer * 4;
    var i32 = new Int32Array(sab);
    var f32 = new Float32Array(sab);
    var readIdx = Atomics.load(i32, 0);
    var writeIdx = 1 - readIdx;
    var individuals = population.individuals;
    var n = Math.min(individuals.length, MAX);
    var countOffset = writeIdx === 0 ? 1 : 1 + (bytesPerBuffer / 4);
    var dataOffset = writeIdx === 0 ? 2 : 2 + (bytesPerBuffer / 4);
    i32[countOffset] = n;
    for (var i = 0; i < n; i++) {
        var d = individuals[i].toDrawable();
        var base = dataOffset + i * FPA;
        f32[base] = d.x;
        f32[base + 1] = d.y;
        f32[base + 2] = d.size;
        f32[base + 3] = d.r;
        f32[base + 4] = d.g;
        f32[base + 5] = d.b;
        f32[base + 6] = d.a;
        f32[base + 7] = d.genes[0];
        f32[base + 8] = d.genes[1];
        f32[base + 9] = d.genes[2];
        f32[base + 10] = d.hp;
    }
    Atomics.store(i32, 0, writeIdx);
}

self.onmessage = function (e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    applyConfigAndConstants(msg);

    if (msg.type === 'init' || msg.type === 'restart') {
        sab = msg.sab || null;
        sabLayout = msg.sabLayout || null;
        population = new WorkerPopulation(cfg.initialPopulation || 100);
        if (sab) {
            writeStateToSAB();
        } else {
            self.postMessage({ type: 'state', individuals: buildState() });
        }
        return;
    }

    if (msg.type === 'tick') {
        if (!population) {
            population = new WorkerPopulation(cfg.initialPopulation || 100);
        }
        var dt = typeof msg.dt === 'number' ? msg.dt : 1 / 60;
        population.run(dt);
        if (population.individuals.length === 0) {
            population = new WorkerPopulation(cfg.initialPopulation || 100);
        }
        if (sab) {
            writeStateToSAB();
        } else {
            self.postMessage({ type: 'state', individuals: buildState() });
        }
    }
};
