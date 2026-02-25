/**
 * Minimal math/vector helpers. Replaces p5 globals so simulation can run in main thread or worker.
 */
var TWO_PI = Math.PI * 2;

function random() {
    if (arguments.length === 0) return Math.random();
    if (arguments.length === 1) return Math.random() * arguments[0];
    var lo = arguments[0];
    var hi = arguments[1];
    return lo + Math.random() * (hi - lo);
}

function vec2(x, y) {
    return { x: x, y: y };
}

function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function getGenes(d) {
    return (d.dna && d.dna.genes) ? d.dna.genes : (d.genes || []);
}
