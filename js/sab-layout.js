/**
 * SharedArrayBuffer layout for worker–main state transfer.
 * Both main.js and simulation-worker.js use these constants.
 * All values are plain data (no functions) so the object is postMessage-safe.
 */
var SAB_LAYOUT = (function () {
    var MAX_AGENTS = 512;
    var FLOATS_PER_AGENT = 11;
    var floatsPerBuffer = FLOATS_PER_AGENT * MAX_AGENTS;
    var bytesPerBuffer = 4 + floatsPerBuffer * 4;

    return {
        MAX_AGENTS: MAX_AGENTS,
        FLOATS_PER_AGENT: FLOATS_PER_AGENT,
        FIELD: { X: 0, Y: 1, SIZE: 2, R: 3, G: 4, B: 5, A: 6, GENE_0: 7, GENE_1: 8, GENE_2: 9, HP: 10 },
        BYTE_LENGTH: 4 + bytesPerBuffer * 2
    };
})();
