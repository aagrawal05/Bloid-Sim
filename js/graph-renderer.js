/**
 * Custom neural network graph renderer with D3 Force Layout
 * Interactive force-directed layout with dark theme aesthetic
 */
(function (global) {
    var GraphRenderer = {
        // Configuration
        nodeRadius: 12,
        gateRadius: 5,
        linkDistance: 80,
        charge: -300,  // Repulsion between nodes
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

        // Node colors by activation type - distinct colors matching dark theme
        activationColors: {
            INPUT: '#4dabf7',           // Bright blue (accent)
            OUTPUT: '#ff6b6b',          // Bright red (danger)
            LOGISTIC: '#ff922b',        // Vibrant orange
            TANH: '#ffd43b',            // Bright yellow
            IDENTITY: '#9775fa',        // Vibrant purple
            STEP: '#94d82d',            // Bright lime green
            RELU: '#51cf66',            // Bright green
            SOFTSIGN: '#20c997',        // Vibrant teal/cyan
            SINUSOID: '#b197fc',        // Light purple/violet
            GAUSSIAN: '#a8e6cf',        // Mint green
            BENT_IDENTITY: '#ffa94d',   // Peach/light orange
            BIPOLAR: '#06b6d4',         // Bright cyan
            BIPOLAR_SIGMOID: '#da77f2', // Magenta
            HARD_TANH: '#f06595',       // Hot pink
            ABSOLUTE: '#fd7e14',        // Deep orange
            GATE: '#b5f236',            // Lime yellow-green
            CONSTANT: '#74c0fc',        // Sky blue
            INVERSE: '#ff6b9d',         // Coral pink
            SELU: '#5c7cfa',            // Indigo blue
            DEFAULT: '#868e96'          // Neutral gray
        },

        /**
         * Assign layers using longest path algorithm (Sugiyama method)
         * Each node's layer is determined by the longest path from any input to that node
         * @param {Object} graph - Network graph data with nodes and links
         * @returns {Object} Nodes organized by layer
         */
        assignLayersBySugiyama: function (graph) {
            var layers = {};
            var nodeToLayer = {};

            // Initialize all nodes with layer -1 (unassigned)
            graph.nodes.forEach(function (d) {
                nodeToLayer[d.id] = -1;
            });

            // Build adjacency map for easier traversal
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

            // Assign layer 0 to all input nodes
            var inputs = graph.nodes.filter(function (d) { return d.name === 'INPUT'; });
            inputs.forEach(function (d) {
                nodeToLayer[d.id] = 0;
                if (!layers[0]) layers[0] = [];
                layers[0].push(d);
            });

            // Propagate layers forward using longest path
            var visited = {};
            var queue = inputs.slice();

            while (queue.length > 0) {
                var node = queue.shift();
                var nodeId = node.id;
                var currentLayer = nodeToLayer[nodeId];

                if (!visited[nodeId]) {
                    visited[nodeId] = true;

                    // Visit all outgoing neighbors
                    outgoing[nodeId].forEach(function (targetId) {
                        var targetNode = graph.nodes.find(function (n) { return n.id === targetId; });
                        var newLayer = currentLayer + 1;

                        // Update layer if this is a longer path
                        if (nodeToLayer[targetId] < newLayer) {
                            nodeToLayer[targetId] = newLayer;

                            // Add to layers index
                            if (!layers[newLayer]) layers[newLayer] = [];
                            // Remove from old layer if it was there
                            if (nodeToLayer[targetId] >= 0 && layers[nodeToLayer[targetId]]) {
                                layers[nodeToLayer[targetId]] = layers[nodeToLayer[targetId]].filter(
                                    function (n) { return n.id !== targetId; }
                                );
                            }
                            layers[newLayer].push(targetNode);

                            // Add to queue to propagate further
                            if (queue.indexOf(targetNode) === -1) {
                                queue.push(targetNode);
                            }
                        }
                    });
                }
            }

            // Assign unvisited/output nodes to their calculated layers
            graph.nodes.forEach(function (d) {
                if (nodeToLayer[d.id] === -1) {
                    // Nodes with no incoming edges from inputs
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

            return {
                layers: layers,
                nodeToLayer: nodeToLayer,
                numLayers: Object.keys(layers).length
            };
        },

        /**
         * Draw the network graph on an SVG element using D3 force layout
         * @param {Object} graph - Network graph data with nodes and links
         * @param {HTMLElement} panel - SVG element to draw on
         */
        draw: function (graph, panel) {
            if (!graph || !graph.nodes || !panel) return;

            var svg = d3.select(panel);
            svg.selectAll('*').remove();

            var width = panel.clientWidth || 400;
            var height = panel.clientHeight || 450;

            var self = this;

            // Assign layers using Sugiyama algorithm
            var layering = this.assignLayersBySugiyama(graph);
            var layers = layering.layers;
            var nodeToLayer = layering.nodeToLayer;
            var numLayers = layering.numLayers;

            // Calculate x positions for each layer (spread evenly across width)
            var layerPositions = {};
            var layerKeys = Object.keys(layers).map(function (k) { return parseInt(k); }).sort(function (a, b) { return a - b; });

            layerKeys.forEach(function (layerIndex, i) {
                // Spread layers from left (15%) to right (85%)
                var minX = width * 0.15;
                var maxX = width * 0.85;
                layerPositions[layerIndex] = minX + (maxX - minX) * (i / (layerKeys.length - 1 || 1));
            });

            // Apply layer-based positioning
            graph.nodes.forEach(function (d) {
                var layer = nodeToLayer[d.id];
                d.fx = layerPositions[layer];
                // Initialize y randomly within viewport
                if (!d.y) {
                    d.y = Math.random() * (height * 0.7) + height * 0.15;
                }
            });

            // Link distance encourages separation between nodes in different layers
            var linkForce = d3.forceLink(graph.links)
                .id(function (d) { return d.id; })
                .distance(function (d) {
                    var sourceLayer = nodeToLayer[typeof d.source === 'object' ? d.source.id : d.source];
                    var targetLayer = nodeToLayer[typeof d.target === 'object' ? d.target.id : d.target];
                    var layerDist = Math.abs(sourceLayer - targetLayer);
                    // Edges between distant layers should be longer
                    return self.linkDistance * (0.8 + layerDist * 0.3);
                });

            // Strong repulsion to keep nodes separated within layers
            var chargeForce = d3.forceManyBody().strength(this.charge);

            // Create force simulation (D3 v7 API)
            var simulation = d3.forceSimulation(graph.nodes)
                .force('link', linkForce)
                .force('charge', chargeForce)
                .force('gravity', d3.forceCenter(width / 2, height / 2).strength(this.gravity))
                .force('collision', d3.forceCollide().radius(function (d) {
                    var baseRadius = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    return baseRadius + 3;
                }));

            // Define arrow marker
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

            // Create link elements
            var link = svg.selectAll('.network-link')
                .data(graph.links)
                .enter()
                .append('path')
                .attr('class', 'network-link')
                .attr('fill', 'none')
                .attr('marker-end', 'url(#end-arrow)');

            // Add tooltips to links
            link.append('title')
                .text(function (d) {
                    var text = '';
                    text += 'Weight: ' + (Math.round(d.weight * 1000) / 1000) + '\n';
                    var sourceIdx = d.source.index != null ? '(' + d.source.index + ')' : d.source.id;
                    var targetIdx = d.target.index != null ? '(' + d.target.index + ')' : d.target.id;
                    text += 'From: ' + sourceIdx + '\n';
                    text += 'To: ' + targetIdx;
                    return text;
                });

            // Create node elements
            var node = svg.selectAll('.network-node')
                .data(graph.nodes)
                .enter()
                .append('circle')
                .attr('class', function (d) {
                    return 'network-node ' + d.name;
                })
                .attr('r', function (d) {
                    return d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                })
                .attr('fill', function (d) {
                    return self.activationColors[d.name] || self.activationColors.DEFAULT;
                })
                .attr('stroke', self.theme.border)
                .attr('stroke-width', 2)
                .call(d3.drag()
                    .on('start', dragstarted)
                    .on('drag', dragged)
                    .on('end', dragended));

            // Add tooltips to nodes
            node.append('title')
                .text(function (d) {
                    var text = '';
                    text += 'Activation: ' + (Math.round(d.activation * 1000) / 1000) + '\n';
                    text += 'Bias: ' + (Math.round(d.bias * 1000) / 1000) + '\n';
                    text += 'Layer: ' + nodeToLayer[d.id] + '\n';
                    text += 'ID: ' + d.id;
                    return text;
                });

            // Create type labels below nodes
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
                .text(function (d) {
                    return d.name;
                });

            // Create node index labels
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
                .text(function (d) {
                    return d.index != null ? d.index : '';
                });

            // Drag handlers
            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fy = d.y;
                // Keep x fixed to layer
            }

            function dragged(event, d) {
                d.fy = event.y;
                // x stays fixed
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fy = null;
            }

            // Tick function: update positions
            simulation.on('tick', function () {
                // Update links
                link.attr('d', function (d) {
                    if (!d.source || !d.target || !isFinite(d.source.x) || !isFinite(d.target.x)) {
                        return '';
                    }

                    var deltaX = d.target.x - d.source.x;
                    var deltaY = d.target.y - d.source.y;
                    var dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

                    if (dist < 1) return '';

                    var normX = deltaX / dist;
                    var normY = deltaY / dist;

                    var sourceRad = d.source.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    var targetRad = d.target.name === 'GATE' ? self.gateRadius : self.nodeRadius;

                    var sourceX = d.source.x + normX * (sourceRad + 1);
                    var sourceY = d.source.y + normY * (sourceRad + 1);
                    var targetX = d.target.x - normX * (targetRad + 3);
                    var targetY = d.target.y - normY * (targetRad + 3);

                    return 'M' + sourceX + ',' + sourceY + 'L' + targetX + ',' + targetY;
                });

                // Color links by weight
                link.attr('stroke', function (d) {
                    var weight = d.weight != null ? d.weight : 0;
                    var absWeight = Math.abs(weight);
                    var hue = weight > 0 ? 200 : 0;
                    return 'hsla(' + hue + ',60%,50%,' + Math.min(0.6, 0.2 + absWeight * 0.4) + ')';
                })
                    .attr('stroke-width', function (d) {
                        var weight = d.weight != null ? d.weight : 0;
                        return 1 + Math.abs(weight) * 1.5;
                    });

                // Update node positions
                node.attr('cx', function (d) {
                    var radius = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                    return d.x = Math.max(radius, Math.min(width - radius, d.x));
                })
                    .attr('cy', function (d) {
                        var radius = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                        return d.y = Math.max(radius, Math.min(height - radius, d.y));
                    });

                // Update node index label positions
                label.attr('x', function (d) {
                    return d.x;
                })
                    .attr('y', function (d) {
                        return d.y;
                    });

                // Update type label positions (below nodes)
                typeLabel.attr('x', function (d) {
                    return d.x;
                })
                    .attr('y', function (d) {
                        var nodeRad = d.name === 'GATE' ? self.gateRadius : self.nodeRadius;
                        return d.y + nodeRad + 12;
                    });
            });
        }
    };

    // Export
    if (typeof global !== 'undefined') {
        global.GraphRenderer = GraphRenderer;
    }
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
