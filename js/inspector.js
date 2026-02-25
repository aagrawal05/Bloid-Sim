/**
 * Inspector panel: displays genes, HP bar, raycast table, and network graph
 * for the currently hovered/locked agent.
 */
var Inspector = (function () {
    var tooltips = {
        size: 'Body size, health pool, and metabolic cost. Larger = more HP and bite radius, can eat smaller agents; pays more cost per timestep. Gene × sizeCoefficient → display size.',
        agility: 'Agility codes for both movement speed and turn rate. Higher = faster movement and quicker turning. Gene × agilitySpeedCoefficient → speed; gene × agilityAngleCoefficient → angle change per step.',
        observationRange: 'Raycast length gene. Longer range = more environmental info but higher energy cost per timestep.',
        hp: 'Current health. Decreases each step from metabolic cost (size_gene × costCoefficient × dt) and observation cost; eating restores it (prey HP × eatCoefficient).'
    };

    var _genesKey = null;
    var _hpFillEl = null;
    var _hpTextEl = null;
    var _raycastsEl = null;
    var _lastHpFrac = null;
    var _lastHpText = null;
    var _lastRaycastKey = null;
    var _networkKey = null;

    function renderNetwork(networkJSON) {
        var netWrap = document.getElementById('inspectorNetworkWrap');
        var netSvg = document.getElementById('inspectorNetwork');
        if (!netWrap || !netSvg) return;

        if (!networkJSON) return;

        var net = neataptic.Network.fromJSON(networkJSON);
        var graphData = net.graph(100, 100);

        GraphRenderer.draw(graphData, netSvg);
        netWrap.style.display = 'block';
    }

    function update(individual) {
        var el = document.getElementById('inspectorContent');
        if (!el) return;

        if (!individual) {
            _genesKey = null;
            _hpFillEl = null;
            _hpTextEl = null;
            _raycastsEl = null;
            _lastHpFrac = null;
            _lastHpText = null;
            _lastRaycastKey = null;
            _networkKey = null;
            el.innerHTML = '<p class="inspector-placeholder">Hover over an individual</p>';
            var netWrap = document.getElementById('inspectorNetworkWrap');
            var netStatus = document.getElementById('inspectorNetworkStatus');
            if (netWrap) netWrap.style.display = 'none';
            if (netStatus) netStatus.textContent = '';
            return;
        }

        var g = getGenes(individual);
        if (!g) return;

        var genesKey = g[0].toFixed(3) + '|' + g[1].toFixed(3) + '|' + (g[2] != null ? g[2].toFixed(3) : 'na');

        // Rebuild static gene/network UI only when the selected agent changes
        if (genesKey !== _genesKey || !_hpFillEl || !_raycastsEl) {
            _genesKey = genesKey;
            _lastHpFrac = null;
            _lastHpText = null;
            _lastRaycastKey = null;
            _networkKey = null;

            var obsHtml = g[2] != null
                ? '<dt>Observation range<span class="info-trigger" tabindex="0" role="button" aria-label="Observation range gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' +
                (tooltips.observationRange || 'Raycast length gene. Longer range = more info but higher energy cost.') +
                '</span></span></dt><dd>' + g[2].toFixed(3) + '</dd>'
                : '';

            el.innerHTML =
                '<dl class="inspector-dl inspector-dl--genes">' +
                '<dt>Size<span class="info-trigger" tabindex="0" role="button" aria-label="Size gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + tooltips.size + '</span></span></dt><dd>' + g[0].toFixed(3) + '</dd>' +
                '<dt>Agility<span class="info-trigger" tabindex="0" role="button" aria-label="Agility gene description"><span class="info-icon" aria-hidden="true">i</span><span class="tooltip-dropdown" role="tooltip">' + tooltips.agility + '</span></span></dt><dd>' + g[1].toFixed(3) + '</dd>' +
                obsHtml +
                '</dl>' +
                '<div class="inspector-status">' +
                '  <div class="inspector-hp-row">' +
                '    <div class="inspector-hp-label">HP</div>' +
                '    <div class="inspector-hp-body">' +
                '      <div class="inspector-hp-bar"><div class="inspector-hp-bar-fill" id="inspectorHpFill"></div></div>' +
                '      <div class="inspector-hp-text" id="inspectorHpText"></div>' +
                '    </div>' +
                '  </div>' +
                '  <div class="inspector-raycasts-wrap">' +
                '    <h3 class="inspector-raycasts-heading">Raycast detections</h3>' +
                '    <div id="inspectorRaycasts" class="inspector-raycasts"></div>' +
                '  </div>' +
                '</div>';

            _hpFillEl = document.getElementById('inspectorHpFill');
            _hpTextEl = document.getElementById('inspectorHpText');
            _raycastsEl = document.getElementById('inspectorRaycasts');

            if (genesKey !== _networkKey) {
                _networkKey = genesKey;
                renderNetwork(individual.networkJSON);
            }
        }

        // Dynamic HP status — only write DOM if value changed
        var sizeGene = g[0] != null ? g[0] : 0;
        var maxHp = Math.max(1, Math.round(sizeGene * CONFIG.hpCoefficient));
        var hp = individual.hp != null ? individual.hp : 0;
        if (hp < 0) hp = 0;
        if (hp > maxHp) hp = maxHp;

        var frac = maxHp > 0 ? (hp / maxHp) : 0;
        var hpFracStr = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
        var hpText = Math.round(hp) + ' / ' + maxHp;
        if (_hpFillEl && hpFracStr !== _lastHpFrac) {
            _hpFillEl.style.width = hpFracStr;
            _lastHpFrac = hpFracStr;
        }
        if (_hpTextEl && hpText !== _lastHpText) {
            _hpTextEl.textContent = hpText;
            _lastHpText = hpText;
        }

        // Dynamic raycasts — only rebuild DOM if ray data changed
        if (_raycastsEl) {
            var raycastResults = individual.raycastResults || [];
            var raycastKey = '';
            for (var i = 0; i < raycastResults.length; i++) {
                var rk = raycastResults[i];
                raycastKey += rk.type + ':' + (rk.normDist != null ? rk.normDist.toFixed(2) : '-') + '|';
            }
            if (raycastKey !== _lastRaycastKey) {
                _lastRaycastKey = raycastKey;
                if (!raycastResults.length) {
                    _raycastsEl.innerHTML = '<p class="inspector-placeholder">No raycast detections</p>';
                } else {
                    var maxRange = (g[2] != null ? g[2] : 0) * CONFIG.observationRangeCoefficient;
                    var html = '<table class="raycast-table"><tr><th>Ray</th><th>Type</th><th>Dist</th></tr>';
                    for (var i = 0; i < raycastResults.length; i++) {
                        var r = raycastResults[i];
                        var typeStr = r.type === 0 ? 'Empty' : (r.type === 0.5 ? 'Wall' : 'Agent');
                        var cell;
                        if (r.normDist == null || !maxRange) {
                            cell = '-';
                        } else {
                            var fraction = Math.max(0, Math.min(1, r.normDist));
                            var distAbs = Math.round(fraction * maxRange);
                            var emptyClass = r.type === 0 ? ' raycast-bar--empty' : '';
                            cell = '<div class="raycast-bar' + emptyClass + '"><div class="raycast-bar-fill" style="width:' +
                                (fraction * 100) + '%"></div><span class="raycast-bar-text">' +
                                distAbs + ' / ' + Math.round(maxRange) + '</span></div>';
                        }
                        html += '<tr><td>' + (i + 1) + '</td><td>' + typeStr + '</td><td>' + cell + '</td></tr>';
                    }
                    html += '</table>';
                    _raycastsEl.innerHTML = html;
                }
            }
        }
    }

    return {
        update: update,
        renderNetwork: renderNetwork
    };
})();
