/**
 * Raycast system for agent perception.
 * Returns { type, normDist } per ray: type 0=Empty, 0.5=Wall, 1=Agent; normDist 0-1.
 * Optimized to use spatial index: pass candidates from queryCircle(origin, length).
 * Depends on math-utils (dist).
 */
var RAYCAST = (function () {
    var NUM_RAYS = 8;
    var EMPTY = 0;
    var WALL = 0.5;
    var AGENT = 1;

    function rayCircleIntersect(ox, oy, dx, dy, cx, cy, r) {
        var ax = ox - cx;
        var ay = oy - cy;
        var ad = ax * dx + ay * dy;
        var aa = ax * ax + ay * ay;
        var disc = ad * ad - aa + r * r;
        if (disc < 0) return -1;
        var sqrt = Math.sqrt(disc);
        var t1 = -ad - sqrt;
        var t2 = -ad + sqrt;
        if (t1 >= 0) return t1;
        if (t2 >= 0) return t2;
        return -1;
    }

    function raySegmentIntersect(ox, oy, dx, dy, segAx, segAy, segBx, segBy) {
        // Ray:  O + t * D,  t >= 0
        // Seg:  A + u * (B - A), 0 <= u <= 1
        var r_px = dx;
        var r_py = dy;
        var s_px = segBx - segAx;
        var s_py = segBy - segAy;
        var denom = r_px * s_py - r_py * s_px;
        if (Math.abs(denom) < 1e-10) return -1;

        var diff_x = segAx - ox;
        var diff_y = segAy - oy;

        var t = (diff_x * s_py - diff_y * s_px) / denom; // along ray
        var u = (diff_x * r_py - diff_y * r_px) / denom; // along segment [0,1]

        if (t >= 0 && u >= 0 && u <= 1) return t;
        return -1;
    }

    function rayMapBounds(ox, oy, dx, dy, mapWidth, mapHeight) {
        var tMin = -1;
        var edges = [
            [0, 0, mapWidth, 0],
            [mapWidth, 0, mapWidth, mapHeight],
            [mapWidth, mapHeight, 0, mapHeight],
            [0, mapHeight, 0, 0]
        ];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            var t = raySegmentIntersect(ox, oy, dx, dy, e[0], e[1], e[2], e[3]);
            if (t >= 0 && (tMin < 0 || t < tMin)) tMin = t;
        }
        return tMin;
    }

    /**
     * Cast 8 rays uniformly around agent. Uses spatial index via candidate list.
     * @param {Object} origin - { x, y }
     * @param {number} agentAngle - Agent's current heading (radians)
     * @param {number} raycastLength - Max ray length
     * @param {number} mapWidth - Map width
     * @param {number} mapHeight - Map height
     * @param {Array} candidateAgents - Agents from spatial index queryCircle(origin, raycastLength)
     * @param {Object} selfAgent - The agent casting rays (excluded from hits)
     * @returns {Array} 8 elements: { type: 0|0.5|1, normDist: 0-1 }
     */
    function cast8(origin, agentAngle, raycastLength, mapWidth, mapHeight, candidateAgents, selfAgent) {
        var results = [];
        for (var i = 0; i < NUM_RAYS; i++) {
            var rayAngle = agentAngle + (i / NUM_RAYS) * Math.PI * 2;
            var dx = Math.cos(rayAngle);
            var dy = Math.sin(rayAngle);
            var ox = origin.x;
            var oy = origin.y;

            var bestT = raycastLength + 1;
            var bestType = EMPTY;

            var wallT = rayMapBounds(ox, oy, dx, dy, mapWidth, mapHeight);
            if (wallT >= 0 && wallT < bestT) {
                bestT = wallT;
                bestType = WALL;
            }

            for (var j = 0; j < candidateAgents.length; j++) {
                var a = candidateAgents[j];
                if (a === selfAgent) continue;
                var r = a.size / 2;
                var t = rayCircleIntersect(ox, oy, dx, dy, a.position.x, a.position.y, r);
                if (t >= 0 && t < bestT) {
                    bestT = t;
                    bestType = AGENT;
                }
            }

            var normDist = bestT <= raycastLength ? bestT / raycastLength : 1;
            if (bestType === EMPTY) normDist = 1;
            results.push({ type: bestType, normDist: normDist });
        }
        return results;
    }

    return {
        NUM_RAYS: NUM_RAYS,
        EMPTY: EMPTY,
        WALL: WALL,
        AGENT: AGENT,
        cast8: cast8
    };
})();
