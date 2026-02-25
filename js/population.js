/**
 * Population: list of individuals, run(dt), eat(pop). Depends on Individual, CONFIG, math-utils.
 */
function Population(populationSize) {
    this.individuals = [];
    var canvasWidth = CONSTANTS.canvasWidth;
    var canvasHeight = CONSTANTS.canvasHeight;
    for (var i = 0; i < populationSize; i++) {
        this.individuals.push(new Individual(vec2(random(canvasWidth), random(canvasHeight))));
    }
}

Population.prototype.run = function (dt) {
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

Population.prototype.eat = function (individuals) {
    var toRemove = [];
    for (var i = individuals.length - 1; i >= 0; i--) {
        for (var j = individuals.length - 1; j >= 0; j--) {
            if (j !== i) {
                var d = dist(individuals[i].position, individuals[j].position);
                if (
                    d < individuals[i].size / 2 &&
                    individuals[i].size > individuals[j].size * CONFIG.compareCoefficient
                ) {
                    individuals[i].hp += Math.floor(individuals[j].hp * CONFIG.eatCoefficient);
                    toRemove.push(individuals[j]);
                }
            }
        }
    }
    return individuals.filter(function (agent) { return toRemove.indexOf(agent) === -1; });
};
