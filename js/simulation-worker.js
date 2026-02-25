/**
 * Web Worker: runs simulation (eat, update, reproduce, death). No DOM/canvas.
 * Uses math-utils; CONFIG/CONSTANTS come from messages.
 * When sab is provided, writes state to SharedArrayBuffer instead of postMessage.
 */
importScripts('math-utils.js');
importScripts('spatial-hash.js');
importScripts('raycast.js');
try { importScripts('https://cdnjs.cloudflare.com/ajax/libs/neataptic/1.4.0/neataptic.min.js'); } catch (e) { /* neataptic optional */ }
try { importScripts('behaviour-network.js'); } catch (e) { /* behaviour-network optional */ }
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
            random(cst.minAgility, 1),
            random(cst.minObservationRange, 1),
        ];
    }
}

WorkerDNA.prototype.mutate = function () {
    for (var i = 0; i < this.genes.length; i++) {
        if (random() < cfg.mutationRate) {
            switch (i) {
                case 0: this.genes[i] = random(cst.minSize, 1); break;
                case 1: this.genes[i] = random(cst.minAgility, 1); break;
                case 2: this.genes[i] = random(cst.minObservationRange, 1); break;
            }
        }
    }
};

function WorkerIndividual(initialPosition, dna, parentNetwork) {
    this.position = initialPosition;
    this.dna = dna != null ? dna : new WorkerDNA();
    this.size = Math.floor(this.dna.genes[0] * cfg.sizeCoefficient);
    var agility = this.dna.genes[1];
    this.speed = Math.floor(agility * cfg.agilitySpeedCoefficient);
    this.angleSpeed = agility * cfg.agilityAngleCoefficient;
    var obsRangeGene = this.dna.genes[2] != null ? this.dna.genes[2] : 0.5;
    this.raycastLength = Math.max(50, obsRangeGene * (cfg.observationRangeCoefficient || 300));
    this.hp = Math.floor(this.dna.genes[0] * cfg.hpCoefficient);
    this.angle = random(TWO_PI);
    if (typeof BEHAVIOUR_NETWORK !== 'undefined' && BEHAVIOUR_NETWORK.createNetwork) {
        if (parentNetwork && parentNetwork.toJSON) {
            try {
                this.network = BEHAVIOUR_NETWORK.createFromParent(parentNetwork.toJSON());
            } catch (e) {
                this.network = BEHAVIOUR_NETWORK.createNetwork();
            }
        } else {
            this.network = BEHAVIOUR_NETWORK.createNetwork();
        }
    } else {
        this.network = null;
    }
}

WorkerIndividual.prototype.update = function (dt) {
    var deltaAngle = 0;
    if (this.network && typeof BEHAVIOUR_NETWORK !== 'undefined' && this.raycastResults) {
        var input = BEHAVIOUR_NETWORK.raycastToInput(this.raycastResults);
        var out = BEHAVIOUR_NETWORK.activate(this.network, input);
        var speedMult = 0.5 + (out[0] || 0.5);
        deltaAngle = (out[1] || 0) * this.angleSpeed * dt;
        this.position.x += Math.cos(this.angle) * this.speed * speedMult * dt;
        this.position.y += Math.sin(this.angle) * this.speed * speedMult * dt;
    } else {
        deltaAngle = random(-this.angleSpeed * dt, this.angleSpeed * dt);
        this.position.x += Math.cos(this.angle) * this.speed * dt;
        this.position.y += Math.sin(this.angle) * this.speed * dt;
    }
    this.angle += deltaAngle;
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
    var obsCost = (cfg.observationCostCoefficient || 0.5) * (this.raycastLength / 150) * dt;
    this.hp -= obsCost;
};

WorkerIndividual.prototype.toDrawable = function () {
    var g = this.dna.genes;
    return {
        x: this.position.x,
        y: this.position.y,
        size: this.size,
        r: g[0] * 255,
        g: g[1] * 255,
        b: (g[2] != null ? g[2] : 0.5) * 255,
        a: this.hp,
        genes: g.slice(0),
        hp: this.hp,
        raycastResults: this.raycastResults || [],
        raycastLength: this.raycastLength,
        angle: this.angle,
        networkJSON: this.network && this.network.toJSON ? this.network.toJSON() : null
    };
};

WorkerIndividual.prototype.reproduce = function (dt) {
    if (random() < cfg.reproductionRate * dt) {
        var childDNA = new WorkerDNA(JSON.parse(JSON.stringify(this.dna.genes)));
        childDNA.mutate();
        return new WorkerIndividual(
            vec2(random(cst.mapWidth), random(cst.mapHeight)),
            childDNA,
            this.network
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

WorkerPopulation.prototype.buildSpatialIndex = function (individuals) {
    var mode = (cfg.spatialIndex === 'quadtree' || cfg.spatialIndex === 'spatialhash') ? cfg.spatialIndex : 'none';
    if (mode === 'quadtree' && typeof QT !== 'undefined') {
        var box = new QT.Box(0, 0, cst.mapWidth, cst.mapHeight);
        var qt = new QT.QuadTree(box);
        for (var i = 0; i < individuals.length; i++) {
            var ind = individuals[i];
            qt.insert(new QT.Point(ind.position.x, ind.position.y, { agent: ind }));
        }
        return { mode: 'quadtree', qt: qt };
    }
    if (mode === 'spatialhash') {
        var cellSize = 80;
        for (var i = 0; i < individuals.length; i++) {
            var s = individuals[i].size / 2;
            if (s > cellSize / 2) cellSize = Math.ceil(s * 2);
        }
        var hash = new SpatialHash(Math.max(cellSize, 50));
        for (var i = 0; i < individuals.length; i++) {
            individuals[i]._id = i;
            hash.insert(individuals[i]);
        }
        return { mode: 'spatialhash', hash: hash };
    }
    return { mode: 'none' };
};

WorkerPopulation.prototype.queryNearbyAgents = function (x, y, r, index) {
    if (!index || index.mode === 'none') return this.individuals;
    if (index.mode === 'quadtree' && index.qt) {
        var pts = index.qt.query(new QT.Circle(x, y, r));
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].data && pts[i].data.agent) out.push(pts[i].data.agent);
        }
        return out;
    }
    if (index.mode === 'spatialhash' && index.hash) {
        return index.hash.queryCircle(x, y, r);
    }
    return this.individuals;
};

WorkerPopulation.prototype.run = function (dt) {
    var individuals = this.individuals;
    var index = this.buildSpatialIndex(individuals);
    this.individuals = this.eat(individuals, index);
    individuals = this.individuals;
    for (var i = individuals.length - 1; i >= 0; i--) {
        var agent = individuals[i];
        var len = agent.raycastLength || 150;
        var candidates = this.queryNearbyAgents(agent.position.x, agent.position.y, len, index);
        if (typeof RAYCAST !== 'undefined' && RAYCAST.cast8) {
            agent.raycastResults = RAYCAST.cast8(
                agent.position, agent.angle, len, cst.mapWidth, cst.mapHeight, candidates, agent
            );
        } else {
            agent.raycastResults = [];
        }
        agent.run(dt);
        var child = agent.reproduce(dt);
        if (child != null) this.individuals.push(child);
        if (agent.dead()) {
            this.individuals.splice(i, 1);
        }
    }
};

function applyEat(eater, prey, toRemove) {
    if (dist(eater.position, prey.position) < eater.size / 2 &&
            eater.size > prey.size * cfg.compareCoefficient) {
        eater.hp += Math.floor(prey.hp * cfg.eatCoefficient);
        toRemove.push(prey);
    }
}

WorkerPopulation.prototype.eat = function (individuals, index) {
    if (individuals.length === 0) return individuals;
    var toRemove = [];
    for (var i = 0; i < individuals.length; i++) {
        var a = individuals[i];
        var nearby = this.queryNearbyAgents(a.position.x, a.position.y, a.size / 2, index);
        for (var n = 0; n < nearby.length; n++) {
            if (nearby[n] !== a) applyEat(a, nearby[n], toRemove);
        }
    }
    return individuals.filter(function (agent) { return toRemove.indexOf(agent) === -1; });
};

function applyConfigAndConstants(msg) {
    if (msg.config) {
        var keys = Object.keys(msg.config);
        for (var i = 0; i < keys.length; i++) {
            if (msg.config[keys[i]] !== undefined) cfg[keys[i]] = msg.config[keys[i]];
        }
    }
    if (msg.constants) {
        var ckeys = Object.keys(msg.constants);
        for (var i = 0; i < ckeys.length; i++) {
            if (msg.constants[ckeys[i]] !== undefined) cst[ckeys[i]] = msg.constants[ckeys[i]];
        }
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
    var F = layout.FIELD;
    for (var i = 0; i < n; i++) {
        var d = individuals[i].toDrawable();
        var base = dataOffset + i * FPA;
        f32[base + F.X] = d.x;
        f32[base + F.Y] = d.y;
        f32[base + F.SIZE] = d.size;
        f32[base + F.R] = d.r;
        f32[base + F.G] = d.g;
        f32[base + F.B] = d.b;
        f32[base + F.A] = d.a;
        f32[base + F.GENE_0] = d.genes[0];
        f32[base + F.GENE_1] = d.genes[1];
        f32[base + F.GENE_2] = d.genes[2];
        f32[base + F.HP] = d.hp;
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
