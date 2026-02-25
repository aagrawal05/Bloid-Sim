/**
 * Custom neural network graph renderer with D3 Force Layout.
 * Interactive force-directed layout with dark theme aesthetic.
 */
var GraphRenderer = (function () {
    var GraphRenderer = {
        // Configuration
        nodeRadius: 12,
        gateRadius: 5,
        linkDistance: 80,
        charge: -300,
        gravity: 0.05,

        // Theme colors (matching styles.css)
        theme: {
            bg: '#1a1b1e',
            surface: '#25262b',
            border: '#373a40',
            text: '#e8e9ed',
            textMuted: '#9a9ca5',
            accent: '#4dabf7',
            accentHover: '#74c0fc'
        },

        // Node colors by activation type
        activationColors: {
            INPUT: '#4dabf7',
            OUTPUT: '#ff6b6b',
            LOGISTIC: '#ff922b',
            TANH: '#ffd43b',
            IDENTITY: '#9775fa',
            STEP: '#94d82d',
            RELU: '#51cf66',
            SOFTSIGN: '#20c997',
            SINUSOID: '#b197fc',
            GAUSSIAN: '#a8e6cf',
            BENT_IDENTITY: '#ffa94d',
            BIPOLAR: '#06b6d4',
            BIPOLAR_SIGMOID: '#da77f2',
            HARD_TANH: '#f06595',
            ABSOLUTE: '#fd7e14',
            GATE: '#b5f236',
            CONSTANT: '#74c0fc',
            INVERSE: '#ff6b9d',
            SELU: '#5c7cfa',
            DEFAULT: '#868e96'
        },

        /**
         * Assign layers using longest path algorithm (Sugiyama method).
         */
        assignLayersBySugiyama: function (graph) {
            var layers = {};
            var nodeToLayer = {};

            graph.nodes.forEach(function (d) { nodeToLayer[d.id] = -1; });

            var outgoing = {};
            var incoming = {};
            graph.nodes.forEach(function (d) {
                outgoing[d.id] = [];
                incoming[d.id] = [];
            });

            graph.links.forEach(function (d) {
                var sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                var targetId = typeof d.target === 'object' ? d.target.id : d.target;
                outgoing[sourceId].push(targetId);
                incoming[targetId].push(sourceId);
            });

            var inputs = graph.nodes.filter(function (d) { return d.name === 'INPUT'; });
            inputs.forEach(function (d) {
                nodeToLayer[d.id] = 0;
                if (!layers[0]) layers[0] = [];
                layers[0].push(d);
            });

            var visited = {};
            var queue = inputs.slice();

            while (queue.length > 0) {
                var node = queue.shift();
                var nodeId = node.id;
                var currentLayer = nodeToLayer[nodeId];

                if (!visited[nodeId]) {
                    visited[nodeId] = true;

                    outgoing[nodeId].forEach(function (targetId) {
                        var targetNode = graph.nodes.find(function (n) { return n.id === targetId; });
                        var newLayer = currentLayer + 1;

                        if (nodeToLayer[targetId] < newLayer) {
                            nodeToLayer[targetId] = newLayer;
                            if (!layers[newLayer]) layers[newLayer] = [];
                            if (nodeToLayer[targetId] >= 0 && layers[nodeToLayer[targetId]]) {
                                layers[nodeToLayer[targetId]] = layers[nodeToLayer[targetId]].filter(
                                    function (n) { return n.id !== targetId; }
                                );
                            }
                            layers[newLayer].push(targetNode);
                            if (queue.indexOf(targetNode) === -1) {
                                queue.push(targetNode);
                            }
                        }
                    });
                }
            }

            graph.nodes.forEach(function (d) {
                if (nodeToLayer[d.id] === -1) {
                    var maxIncomingLayer = -1;
                    incoming[d.id].forEach(function (sourceId) {
                        maxIncomingLayer = Math.max(maxIncomingLayer, nodeToLayer[sourceId]);
                    });
                    var assignedLayer = maxIncomingLayer + 1;
                    nodeToLayer[d.id] = assignedLayer;
                    if (!layers[assignedLayer]) layers[assignedLayer] = [];
                    layers[assignedLayer].push(d);
                }
            });

            return { layers: layers, nodeToLayer: nodeToLayer, numLayers: Object.keys(layers).length };
        },

        /**
         * Calculate x positions per layer and assign initial node positions.
         */
        _applyLayerPositions: function (graph, layering, width, height) {
            var layers = layering.layers;
            var nodeToLayer = layering.nodeToLayer;
            var layerPositions = {};
            var layerKeys = Object.keys(layers).map(function (k) { return parseInt(k); }).sort(function (a, b) { return a - b; });

            layerKeys.forEach(function (layerIndex, i) {
                var minX = width * 0.15;
                var maxX = width * 0.85;
                layerPositions[layerIndex] = minX + (maxX - minX) * (i / (layerKeys.length - 1 || 1));
            });

            graph.nodes.forEach(function (d) {
                var layer = nodeToLayer[d.id];
                d.fx = layerPositions[layer];
                if (!d.y) {
                    d.y = Math.random() * (height * 0.7) + height * 0.15;
                }
            });

            return layerPositions;
        },

        /**
         * Create and configure the D3 force simulation.
         */
        _createSimulation: function (graph, layering, width, height) {
            var self = this;
            var nodeToLayer = layering.nodeToLayer;

            var linkForce = d3.forceLink(graph.links)
                .id(function (d) { return d.id; })
                .distance(function (d) {
                    var sourceLayer = nodeToLayer[typeof d.source === 'object' ? d.source.id : d.source];
                    var targetLayer = nodeToLayer[typeof d.target === 'object' ? d.target.id : d.target];
                    var layerDist = Math.abs(sourceLayer - targetLayer);
                    return self.linkDistance * (0.8 + layerDist * 0.3);
                });

            var chargeForce = d3.forceManyBody().strength(this.charge);

            return d3.forceSimulation(graph.nodes)
                .force('link', linkForce)
                .force('charge', chargeForce)
                .force('gravity', d3.forceCenter(width / 2, height / 2).strength(this.gravity))
                .force('collision', d3.forceCollide().radius(function (d) {
                    return (d.name === 'GATE' ? self.gateRadius : self.nodeRadius) + 3;
                }));
        },

        /**
         * Render SVG elements (links, nodes, labels) and wire up tick/drag handlers.
         */
        _renderElements: function (svg, graph, layering, simulation, width, height) {
            var self = this;
            var nodeToLayer = layering.nodeToLayer;

            // Arrow marker
            svg.append('defs').append('marker')
                .attr('id', 'end-arrow')
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('markerWidth', 3)
                .attr('markerHeight', 3)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-5L10,0L0,5')
                .attr('fill', this.theme.textMuted);

            // Links
            var link = svg.selectAll('.network-link')
                .data(graph.links)
                .enter()
                .append('path')
                .attr('class', 'network-link')
                .attr('fill', 'none')
                .attr('marker-end', 'url(#end-arrow)');

            link.append('title')
                .text(function (d) {
                    var sourceIdx = d.source.index != null ? '(' + d.source.index + ')' : d.source.id;
                    var targetIdx = d.target.index != null ? '(' + d.target.index + ')' : d.target.id;
                    return 'Weight: ' + (Math.round(d.weight * 1000) / 1000) + '\nFrom: ' + sourceIdx + '\nTo: ' + targetIdx;
                });

            // Nodes
            var node = svg.selectAll('.network-node')
                .data(graph.nodes)
                .enter()
                .append('circle')
                .attr('class', function (d) { return 'network-node ' + d.name; })
                .attr('r', function (d) { return d.name === 'GATE' ? self.gateRadius : self.nodeRadius; })
                .attr('fill', function (d) { return self.activationColors[d.name] || self.activationColors.DEFAULT; })
                .attr('stroke', self.theme.border)
                .attr('stroke-width', 2)
                .call(d3.drag()
                    .on('start', function (event, d) {
                        if (!event.active) simulation.alphaTarget(0.3).restart();
                        d.fy = d.y;
                    })
                    .on('drag', function (event, d) { d.fy = event.y; })
                    .on('end', function (event, d) {
                        if (!event.active) simulation.alphaTarget(0);
                        d.fy = null;
                    }));

            node.append('title')
                .text(function (d) {
                    return 'Activation: ' + (Math.round(d.activation * 1000) / 1000) +
                        '\nBias: ' + (Math.round(d.bias * 1000) / 1000) +
                        '\nLayer: ' + nodeToLayer[d.id] + '\nID: ' + d.id;
                });

            // Type labels
            var typeLabel = svg.selectAll('.network-type-label')
                .data(graph.nodes)
                .enter()
                .append('text')
                .attr('class', 'network-type-label')
                .attr('text-anchor', 'middle')
                .attr('fill', self.theme.text)
                .attr('font-size', '9px')
                .attr('font-family', '"DM Sans", system-ui, sans-serif')
                .attr('pointer-events', 'none')
                .text(function (d) { return d.name; });

            // Index labels
            var label = svg.selectAll('.network-label')
                .data(graph.nodes)
                .enter()
                .append('text')
                .attr('class', 'network-label')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.3em')
                .attr('fill', self.theme.surface)
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('font-family', '"DM Sans", system-ui, sans-serif')
                .attr('pointer-events', 'none')
                .text(function (d) { return d.index != null ? d.index : ''; });

            // Tick handler
            simulation.on('tick', function () {
                link.attr('d', function (d) {
                    if (!d.source || !d.target || !isFinite(d.source.x) || !isFinite(d.target.x)) return '';
                    var deltaX = d.target.x - d.source.x;
                    var deltaY = d.target.y - d.source.y;
                    var len = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    if (len < 1) return '';
                    var nx = deltaX / len;
                    var ny = deltaY / len;
                    var sourceRad = d.source.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    var targetRad = d.target.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    return 'M' + (d.source.x + nx * (sourceRad + 1)) + ',' + (d.source.y + ny * (sourceRad + 1)) +
                           'L' + (d.target.x - nx * (targetRad + 3)) + ',' + (d.target.y - ny * (targetRad + 3));
                });

                link.attr('stroke', function (d) {
                    var weight = d.weight != null ? d.weight : 0;
                    var hue = weight > 0 ? 200 : 0;
                    return 'hsla(' + hue + ',60%,50%,' + Math.min(0.6, 0.2 + Math.abs(weight) * 0.4) + ')';
                }).attr('stroke-width', function (d) {
                    return 1 + Math.abs(d.weight != null ? d.weight : 0) * 1.5;
                });

                node.attr('cx', function (d) {
                    var r = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    return d.x = Math.max(r, Math.min(width - r, d.x));
                }).attr('cy', function (d) {
                    var r = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    return d.y = Math.max(r, Math.min(height - r, d.y));
                });

                label.attr('x', function (d) { return d.x; })
                     .attr('y', function (d) { return d.y; });

                typeLabel.attr('x', function (d) { return d.x; })
                         .attr('y', function (d) {
                             return d.y + (d.name === 'GATE' ? self.gateRadius : self.nodeRadius) + 12;
                         });
            });
        },

        /**
         * Draw the network graph on an SVG element.
         */
        draw: function (graph, panel) {
            if (!graph || !graph.nodes || !panel) return;
            if (typeof d3 === 'undefined') return;

            try {
                var svg = d3.select(panel);
                svg.selectAll('*').remove();

                var width = panel.clientWidth || 400;
                var height = panel.clientHeight || 450;

                var layering = this.assignLayersBySugiyama(graph);
                this._applyLayerPositions(graph, layering, width, height);
                var simulation = this._createSimulation(graph, layering, width, height);
                this._renderElements(svg, graph, layering, simulation, width, height);
            } catch (e) {
                console.error('GraphRenderer.draw failed:', e);
            }
        }
    };

    return GraphRenderer;
})();
