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
        var sum = 0;
        var gMin = Infinity;
        var gMax = -Infinity;
        for (var i = 0; i < individuals.length; i++) {
            var g = getGenes(individuals[i]);
            var val = g[geneIndex] != null ? g[geneIndex] : 0;
            sum += val;
            if (val < gMin) gMin = val;
            if (val > gMax) gMax = val;
        }
        var avgY = (sum / individuals.length) / yAxisDivisor;
        var minY = gMin / yAxisDivisor;
        var maxY = gMax / yAxisDivisor;
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

    var MAX_POINTS = 600;

    function trimWindow(chart, simTime) {
        var cutoff = simTime - WINDOW_SECONDS;
        for (var d = 0; d < chart.data.datasets.length; d++) {
            var pts = chart.data.datasets[d].data;
            var trimCount = 0;
            while (trimCount < pts.length && pts[trimCount].x < cutoff) {
                trimCount++;
            }
            if (trimCount > 0) pts.splice(0, trimCount);
            if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS);
        }
    }

    var populationChartRef, sizeChartRef, agilityChartRef, obsRangeChartRef;

    function getCtx(id) {
        var el = document.getElementById(id);
        return el ? el.getContext('2d') : null;
    }

    var noopResult = {
        populationChart: null, sizeChart: null, agilityChart: null, obsRangeChart: null,
        sample: function () {}
    };

    function createAll(getPopulation) {
        if (typeof Chart === 'undefined' || typeof CONSTANTS === 'undefined') return noopResult;

        var populationCtx = getCtx('populationChart');
        var sizeCtx = getCtx('sizeChart');
        var agilityCtx = getCtx('agilityChart');
        var obsRangeCtx = getCtx('obsRangeChart');
        if (!populationCtx || !sizeCtx || !agilityCtx || !obsRangeCtx) return noopResult;

        populationChartRef = createPopulationChart(populationCtx);
        sizeChartRef = createGeneChart(
            sizeCtx, 'Size Gene', 0, '#ff6b6b', 'rgba(255, 107, 107, 0.2)', 1, CONSTANTS.minSize, 1
        );
        agilityChartRef = createGeneChart(
            agilityCtx, 'Agility Gene', 1, '#51cf66', 'rgba(81, 207, 102, 0.2)', 1, CONSTANTS.minAgility, 1
        );
        obsRangeChartRef = createGeneChart(
            obsRangeCtx, 'Observation Range Gene', 2, '#74c0fc', 'rgba(116, 192, 252, 0.2)', 1, CONSTANTS.minObservationRange, 1
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
