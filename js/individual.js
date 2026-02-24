/**
 * Individual: position, size, speed, angle, hp. Depends on DNA, CONFIG, CONSTANTS, p5 globals.
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
    this.position.x += cos(this.angle) * this.speed * dt;
    this.position.y += sin(this.angle) * this.speed * dt;
    var canvasWidth = CONSTANTS.canvasWidth;
    var canvasHeight = CONSTANTS.canvasHeight;
    if (this.position.x < -this.size) this.position.x = canvasWidth + this.size;
    if (this.position.y < -this.size) this.position.y = canvasHeight + this.size;
    if (this.position.x > canvasWidth + this.size) this.position.x = -this.size;
    if (this.position.y > canvasHeight + this.size) this.position.y = -this.size;
    this.hp -= this.dna.genes[0] * CONFIG.costCoefficient * dt;
};

Individual.prototype.show = function () {
    ellipseMode(CENTER);
    stroke(55, 58, 64, 120);
    strokeWeight(1);
    fill(
        this.dna.genes[0] * 255,
        this.dna.genes[1] * 255,
        this.dna.genes[2] * 255,
        this.hp
    );
    ellipse(this.position.x, this.position.y, this.size, this.size);
};

Individual.prototype.reproduce = function (dt) {
    if (random() < CONFIG.reproductionRate * dt) {
        var childDNA = new DNA(JSON.parse(JSON.stringify(this.dna.genes)));
        childDNA.mutate();
        var canvasWidth = CONSTANTS.canvasWidth;
        var canvasHeight = CONSTANTS.canvasHeight;
        return new Individual(createVector(random(canvasWidth), random(canvasHeight)), childDNA);
    }
    return null;
};

Individual.prototype.run = function (dt) {
    this.update(dt);
    this.show();
};

Individual.prototype.dead = function () {
    return this.hp <= 0;
};
