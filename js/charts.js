/**
 * Chart creation: population chart and gene charts (size, speed, angular speed).
 * Uses getPopulation() in refresh callbacks; guards against empty population.
 */
var Charts = (function () {
    function createPopulationChart(ctx, getPopulation) {
        return new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    data: [{ x: Date.now(), y: CONFIG.initialPopulation }],
                    label: 'Population',
                    fill: true,
                    backgroundColor: 'rgba(77, 171, 247, 0.15)',
                    borderColor: '#4dabf7',
                    cubicInterpolationMode: 'monotone',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'realtime',
                        realtime: {
                            onRefresh: function (chart) {
                                var population = getPopulation();
                                if (!population || !population.individuals) return;
                                chart.data.datasets[0].data.push({
                                    x: Date.now(),
                                    y: population.individuals.length,
                                });
                            },
                        },
                    },
                    y: {
                        suggestedMin: 0,
                        suggestedMax: Math.max(CONFIG.initialPopulation * 1.5, 50),
                    },
                },
            },
        });
    }

    function createGeneChart(ctx, getPopulation, label, geneIndex, color, fillColor, yAxisDivisor, yAxisMin, yAxisMax) {
        yAxisDivisor = yAxisDivisor || 1;
        yAxisMin = yAxisMin != null ? yAxisMin : 0;
        yAxisMax = yAxisMax != null ? yAxisMax : 1;
        var grace = 0.05;

        return new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { data: [], label: 'Average ' + label, fill: false, borderColor: color, cubicInterpolationMode: 'monotone' },
                    { data: [], label: 'Min ' + label, fill: false, borderColor: color, cubicInterpolationMode: 'monotone' },
                    { data: [], label: 'Max ' + label, fill: '-1', backgroundColor: fillColor, borderColor: color, cubicInterpolationMode: 'monotone' },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'realtime',
                        realtime: {
                            onRefresh: function (chart) {
                                var population = getPopulation();
                                if (!population || !population.individuals || population.individuals.length === 0) return;
                                var individuals = population.individuals;
                                var sum = individuals.reduce(function (acc, curr) { return acc + curr.dna.genes[geneIndex]; }, 0);
                                var average = sum / individuals.length;
                                var minIndividual = individuals.reduce(function (prev, curr) {
                                    return prev.dna.genes[geneIndex] < curr.dna.genes[geneIndex] ? prev : curr;
                                });
                                var maxIndividual = individuals.reduce(function (prev, curr) {
                                    return prev.dna.genes[geneIndex] > curr.dna.genes[geneIndex] ? prev : curr;
                                });
                                var timestamp = Date.now();
                                var avgY = average / yAxisDivisor;
                                var minY = minIndividual.dna.genes[geneIndex] / yAxisDivisor;
                                var maxY = maxIndividual.dna.genes[geneIndex] / yAxisDivisor;
                                chart.data.datasets[0].data.push({ x: timestamp, y: avgY });
                                chart.data.datasets[1].data.push({ x: timestamp, y: minY });
                                chart.data.datasets[2].data.push({ x: timestamp, y: maxY });

                                var dataMin = yAxisMax;
                                var dataMax = yAxisMin;
                                var pointCount = 0;
                                for (var d = 0; d < chart.data.datasets.length; d++) {
                                    var pts = chart.data.datasets[d].data;
                                    for (var p = 0; p < pts.length; p++) {
                                        var yVal = pts[p].y;
                                        if (yVal < dataMin) dataMin = yVal;
                                        if (yVal > dataMax) dataMax = yVal;
                                        pointCount++;
                                    }
                                }
                                if (pointCount > 0) {
                                    var range = dataMax - dataMin;
                                    if (range < 1e-6) range = (yAxisMax - yAxisMin) * 0.2;
                                    var padding = Math.max(range * grace, (yAxisMax - yAxisMin) * 0.02);
                                    var scaleMin = Math.max(yAxisMin, dataMin - padding);
                                    var scaleMax = Math.min(yAxisMax, dataMax + padding);
                                    if (scaleMax <= scaleMin) {
                                        scaleMin = Math.max(yAxisMin, dataMin - (yAxisMax - yAxisMin) * 0.1);
                                        scaleMax = Math.min(yAxisMax, dataMax + (yAxisMax - yAxisMin) * 0.1);
                                    }
                                    chart.options.scales.y.min = scaleMin;
                                    chart.options.scales.y.max = scaleMax;
                                }
                            },
                        },
                    },
                    y: {
                        suggestedMin: yAxisMin,
                        suggestedMax: yAxisMax,
                        ticks: {
                            precision: 2,
                            maxTicksLimit: 6,
                        },
                    },
                },
            },
        });
    }

    function createAll(getPopulation) {
        var populationCtx = document.getElementById('populationChart').getContext('2d');
        var populationChart = createPopulationChart(populationCtx, getPopulation);
        var sizeChart = createGeneChart(
            document.getElementById('sizeChart').getContext('2d'),
            getPopulation, 'Size Gene', 0, '#ff6b6b', 'rgba(255, 107, 107, 0.2)', 1, CONSTANTS.minSize, 1
        );
        var speedChart = createGeneChart(
            document.getElementById('speedChart').getContext('2d'),
            getPopulation, 'Speed Gene', 1, '#51cf66', 'rgba(81, 207, 102, 0.2)', 1, CONSTANTS.minSpeed, 1
        );
        var angleSpeedChart = createGeneChart(
            document.getElementById('angularSpeedChart').getContext('2d'),
            getPopulation, 'Angular Speed Gene', 2, '#74c0fc', 'rgba(116, 192, 252, 0.2)', Math.PI / 2, CONSTANTS.minAngleSpeed / (Math.PI / 2), 1 / (Math.PI / 2)
        );
        return { populationChart: populationChart, sizeChart: sizeChart, speedChart: speedChart, angleSpeedChart: angleSpeedChart };
    }

    return { createAll: createAll };
})();
