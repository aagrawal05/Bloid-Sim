/**
 * DNA: genes [size, speed, angularSpeed]. Mutates based on CONFIG.mutationRate.
 */
function DNA(inheritedGenes) {
    if (inheritedGenes != null) {
        this.genes = inheritedGenes;
    } else {
        this.genes = [
            random(CONSTANTS.minSize, 1),       // SIZE
            random(CONSTANTS.minSpeed, 1),      // SPEED
            random(CONSTANTS.minAngleSpeed, 1), // ANGLESPEED
        ];
    }
}

DNA.prototype.mutate = function () {
    for (var i = 0; i < this.genes.length; i++) {
        if (random() < CONFIG.mutationRate) {
            switch (i) {
                case 0:
                    this.genes[i] = random(CONSTANTS.minSize, 1);
                    break;
                case 1:
                    this.genes[i] = random(CONSTANTS.minSpeed, 1);
                    break;
                case 2:
                    this.genes[i] = random(CONSTANTS.minAngleSpeed, 1);
                    break;
            }
        }
    }
};
