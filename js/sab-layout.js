/**
 * SharedArrayBuffer layout for worker–main state transfer.
 * Both main.js and simulation-worker.js use these constants.
 */
var SAB_LAYOUT = {
    MAX_AGENTS: 512,
    FLOATS_PER_AGENT: 11,
    getByteLength: function () {
        var floatsPerBuffer = this.FLOATS_PER_AGENT * this.MAX_AGENTS;
        var bytesPerBuffer = 4 + floatsPerBuffer * 4;
        return 4 + bytesPerBuffer * 2;
    },
    getOffsets: function () {
        var floatsPerBuffer = this.FLOATS_PER_AGENT * this.MAX_AGENTS;
        var bytesPerBuffer = 4 + floatsPerBuffer * 4;
        return {
            readIndex: 0,
            buf0Count: 4,
            buf0Data: 8,
            buf0End: 8 + bytesPerBuffer,
            buf1Count: 8 + bytesPerBuffer,
            buf1Data: 12 + bytesPerBuffer,
            buf1End: 12 + bytesPerBuffer * 2
        };
    }
};
