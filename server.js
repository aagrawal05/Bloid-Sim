#!/usr/bin/env node
/**
 * Static server with COOP/COEP headers required for SharedArrayBuffer.
 * Run: node server.js
 * Then open http://localhost:8765
 */
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 8765;
var ROOT = path.resolve(__dirname);

var MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

var server = http.createServer(function (req, res) {
    var url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    var file = path.join(ROOT, url);

    fs.readFile(file, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        var ext = path.extname(file);
        var contentType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless'
        });
        res.end(data);
    });
});

server.listen(PORT, function () {
    console.log('Server at http://localhost:' + PORT);
    console.log('COOP/COEP headers enabled for SharedArrayBuffer');
});
