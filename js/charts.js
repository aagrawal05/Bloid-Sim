/**
 * Chart creation: population chart and gene charts (size, agility).
 * Uses getPopulation() in refresh callbacks; guards against empty population.
 */
var Charts = (function () {
    var WINDOW_SECONDS = 300; // visible window in simulated seconds

    function createPopulationChart(ctx) {
        return new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    data: [{ x: 0, y: CONFIG.initialPopulation }],
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
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Sim time (s)',
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

    function createGeneChart(ctx, label, geneIndex, color, fillColor, yAxisDivisor, yAxisMin, yAxisMax) {
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
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Sim time (s)',
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

    function addGeneSample(chart, individuals, geneIndex, yAxisDivisor, yAxisMin, yAxisMax, simTime) {
        if (!individuals || individuals.length === 0) return;
        var grace = 0.05;
        var getGenes = function (ind) { return (ind.dna && ind.dna.genes ? ind.dna.genes : ind.genes) || []; };
        var sum = individuals.reduce(function (acc, curr) { var g = getGenes(curr); return acc + (g[geneIndex] != null ? g[geneIndex] : 0); }, 0);
        var average = sum / individuals.length;
        var minIndividual = individuals.reduce(function (prev, curr) {
            var pg = getGenes(prev);
            var cg = getGenes(curr);
            return (pg[geneIndex] != null ? pg[geneIndex] : 1) < (cg[geneIndex] != null ? cg[geneIndex] : 1) ? prev : curr;
        });
        var maxIndividual = individuals.reduce(function (prev, curr) {
            var pg = getGenes(prev);
            var cg = getGenes(curr);
            return (pg[geneIndex] != null ? pg[geneIndex] : 0) > (cg[geneIndex] != null ? cg[geneIndex] : 0) ? prev : curr;
        });
        var gMin = getGenes(minIndividual)[geneIndex];
        var gMax = getGenes(maxIndividual)[geneIndex];
        var avgY = average / yAxisDivisor;
        var minY = (gMin != null ? gMin : 0) / yAxisDivisor;
        var maxY = (gMax != null ? gMax : 0) / yAxisDivisor;
        chart.data.datasets[0].data.push({ x: simTime, y: avgY });
        chart.data.datasets[1].data.push({ x: simTime, y: minY });
        chart.data.datasets[2].data.push({ x: simTime, y: maxY });

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
    }

    function trimWindow(chart, simTime) {
        var cutoff = simTime - WINDOW_SECONDS;
        for (var d = 0; d < chart.data.datasets.length; d++) {
            var pts = chart.data.datasets[d].data;
            while (pts.length > 0 && pts[0].x < cutoff) {
                pts.shift();
            }
        }
    }

    var populationChartRef, sizeChartRef, agilityChartRef, obsRangeChartRef;

    function createAll(getPopulation) {
        var populationCtx = document.getElementById('populationChart').getContext('2d');
        populationChartRef = createPopulationChart(populationCtx);
        sizeChartRef = createGeneChart(
            document.getElementById('sizeChart').getContext('2d'),
            'Size Gene', 0, '#ff6b6b', 'rgba(255, 107, 107, 0.2)', 1, CONSTANTS.minSize, 1
        );
        agilityChartRef = createGeneChart(
            document.getElementById('agilityChart').getContext('2d'),
            'Agility Gene', 1, '#51cf66', 'rgba(81, 207, 102, 0.2)', 1, CONSTANTS.minAgility, 1
        );
        obsRangeChartRef = createGeneChart(
            document.getElementById('obsRangeChart').getContext('2d'),
            'Observation Range Gene', 2, '#74c0fc', 'rgba(116, 192, 252, 0.2)', 1, CONSTANTS.minObservationRange, 1
        );

        function sample(simTime) {
            if (window.app && window.app.paused) return;
            var population = getPopulation();
            if (!population || !population.individuals) return;
            var individuals = population.individuals;

            if (populationChartRef) {
                populationChartRef.data.datasets[0].data.push({ x: simTime, y: individuals.length });
                trimWindow(populationChartRef, simTime);
                populationChartRef.update('none');
            }

            if (sizeChartRef) {
                addGeneSample(sizeChartRef, individuals, 0, 1, CONSTANTS.minSize, 1, simTime);
                trimWindow(sizeChartRef, simTime);
                sizeChartRef.update('none');
            }

            if (agilityChartRef) {
                addGeneSample(agilityChartRef, individuals, 1, 1, CONSTANTS.minAgility, 1, simTime);
                trimWindow(agilityChartRef, simTime);
                agilityChartRef.update('none');
            }

            if (obsRangeChartRef) {
                addGeneSample(obsRangeChartRef, individuals, 2, 1, CONSTANTS.minObservationRange, 1, simTime);
                trimWindow(obsRangeChartRef, simTime);
                obsRangeChartRef.update('none');
            }
        }

        return {
            populationChart: populationChartRef,
            sizeChart: sizeChartRef,
            agilityChart: agilityChartRef,
            obsRangeChart: obsRangeChartRef,
            sample: sample,
        };
    }

    return { createAll: createAll };
})();
