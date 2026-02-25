/**
 * Individual: position, size, speed, angle, hp. Depends on DNA, CONFIG, CONSTANTS, math-utils.
 * No drawing; use toDrawable() for renderer/worker state.
 */
function Individual(initialPosition, dna) {
    this.position = initialPosition;
    if (dna != null) {
        this.dna = dna;
    } else {
        this.dna = new DNA();
    }
    this.size = Math.floor(this.dna.genes[0] * CONFIG.sizeCoefficient);
    this.speed = Math.floor(this.dna.genes[1] * CONFIG.speedCoefficient);
    this.angleSpeed = this.dna.genes[2] * TWO_PI;
    this.hp = Math.floor(this.dna.genes[0] * CONFIG.hpCoefficient);
    this.angle = random(TWO_PI);
}

Individual.prototype.update = function (dt) {
    this.angle += random(-this.angleSpeed * dt, this.angleSpeed * dt);
    this.position.x += Math.cos(this.angle) * this.speed * dt;
    this.position.y += Math.sin(this.angle) * this.speed * dt;
    var canvasWidth = CONSTANTS.canvasWidth;
    var canvasHeight = CONSTANTS.canvasHeight;
    if (this.position.x < -this.size) this.position.x = canvasWidth + this.size;
    if (this.position.y < -this.size) this.position.y = canvasHeight + this.size;
    if (this.position.x > canvasWidth + this.size) this.position.x = -this.size;
    if (this.position.y > canvasHeight + this.size) this.position.y = -this.size;
    this.hp -= this.dna.genes[0] * CONFIG.costCoefficient * dt;
};

Individual.prototype.toDrawable = function () {
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

Individual.prototype.reproduce = function (dt) {
    if (random() < CONFIG.reproductionRate * dt) {
        var childDNA = new DNA(JSON.parse(JSON.stringify(this.dna.genes)));
        childDNA.mutate();
        var canvasWidth = CONSTANTS.canvasWidth;
        var canvasHeight = CONSTANTS.canvasHeight;
        return new Individual(vec2(random(canvasWidth), random(canvasHeight)), childDNA);
    }
    return null;
};

Individual.prototype.run = function (dt) {
    this.update(dt);
};

Individual.prototype.dead = function () {
    return this.hp <= 0;
};
