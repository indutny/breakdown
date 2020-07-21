'use strict';

const http = require('http');

const Breakdown = require('../');

const b = new Breakdown();

b.start('sample.log');

process.on('SIGINT', () => {
  b.stop();
  process.exit();
});

http.createServer((req, res) => {
  http.get('http://example.com/', (remote) => {
    remote.pipe(res);
  });
}).listen(8000);
