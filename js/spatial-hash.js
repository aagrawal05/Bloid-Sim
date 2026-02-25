/**
 * Lightweight 2D spatial hash for broad-phase collision detection.
 * Works in worker or main thread. Cell key: "cx,cy".
 * @param {number} cellSize - Cell size in world units (e.g. max agent radius * 2).
 */
function SpatialHash(cellSize) {
    this.cellSize = Math.max(1, cellSize);
    this.buckets = Object.create(null);
}

SpatialHash.prototype._key = function (cx, cy) {
    return cx + ',' + cy;
};

SpatialHash.prototype._cell = function (x) {
    return Math.floor(x / this.cellSize);
};

/**
 * Insert an agent. Expects agent.position.x, agent.position.y, agent.size (radius or diameter used as AABB half-size).
 */
SpatialHash.prototype.insert = function (agent) {
    var x = agent.position.x;
    var y = agent.position.y;
    var half = (agent.size || 0) / 2;
    var minX = this._cell(x - half);
    var minY = this._cell(y - half);
    var maxX = this._cell(x + half);
    var maxY = this._cell(y + half);
    for (var cx = minX; cx <= maxX; cx++) {
        for (var cy = minY; cy <= maxY; cy++) {
            var k = this._key(cx, cy);
            if (!this.buckets[k]) this.buckets[k] = [];
            this.buckets[k].push(agent);
        }
    }
};

/**
 * Query agents in cells overlapping the circle at (x, y) with radius r.
 * Returns a Set or array of agents (no duplicates). Use Set for dedupe.
 */
SpatialHash.prototype.queryCircle = function (x, y, r) {
    var minX = this._cell(x - r);
    var minY = this._cell(y - r);
    var maxX = this._cell(x + r);
    var maxY = this._cell(y + r);
    var seen = Object.create(null);
    var out = [];
    for (var cx = minX; cx <= maxX; cx++) {
        for (var cy = minY; cy <= maxY; cy++) {
            var k = this._key(cx, cy);
            var list = this.buckets[k];
            if (!list) continue;
            for (var i = 0; i < list.length; i++) {
                var a = list[i];
                var id = a.id != null ? a.id : a;
                if (!seen[id]) {
                    seen[id] = true;
                    out.push(a);
                }
            }
        }
    }
    return out;
};

SpatialHash.prototype.clear = function () {
    this.buckets = Object.create(null);
};
