/**
 * Behaviour policy: NEAT neural network per agent.
 * Uses neataptic (loaded in worker or main). Architect: 16 inputs (8 rays × type + dist), 2 outputs (deltaSpeed, deltaAngle).
 */
(function (global) {
    var neataptic = (global && global.neataptic) || null;
    if (!neataptic) return;

    var Architect = neataptic.architect;
    var Network = neataptic.Network;
    var Methods = neataptic.methods;

    var INPUTS = 16;
    var OUTPUTS = 2;

    function createNetwork() {
        return new Architect.Perceptron(INPUTS, 8, 8, OUTPUTS);
    }

    function mutateNetwork(net) {
        var randomMethodIdx = Math.floor(Math.random() * Methods.mutation.ALL.length);
        var randomMethod = Methods.mutation.ALL[randomMethodIdx];
        net.mutate(randomMethod);
        return net;
    }

    function createNetworkFromParent(parentNetwork) {
        if (!parentNetwork) {
            return createNetwork();
        }
        var childJSON = parentNetwork.toJSON();
        return Network.fromJSON(childJSON);
    }

    function raycastToInput(raycastResults) {
        var input = [];
        if (!raycastResults || raycastResults.length === 0) {
            for (var i = 0; i < INPUTS; i++) input.push(0.5);
            return input;
        }
        for (var i = 0; i < 8; i++) {
            var r = raycastResults[i] || { type: 0, normDist: 1 };
            input.push(r.type);
            input.push(r.normDist);
        }
        return input;
    }

    function activate(network, input) {
        if (!network || !network.activate) return [0.5, 0];
        var out = network.activate(input);
        var deltaSpeedMult = (out[0] != null ? out[0] : 0.5);
        var deltaAngle = (out[1] != null ? out[1] : 0.5) * 2 - 1;
        return [deltaSpeedMult, deltaAngle];
    }

    var _target = (typeof self !== 'undefined' && self.document === undefined) ? self
        : (typeof window !== 'undefined') ? window
            : this;
    _target.BEHAVIOUR_NETWORK = {
        createNetwork: createNetwork,
        createNetworkFromParent: createNetworkFromParent,
        mutateNetwork: mutateNetwork,
        raycastToInput: raycastToInput,
        activate: activate
    };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
