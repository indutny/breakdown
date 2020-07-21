'use strict';

const http = require('http');

const Breakdown = require('../');

const b = new Breakdown();
const middleware = b.middleware();

b.start('sample.log');

process.on('SIGINT', () => {
  b.stop();
  process.exit();
});

http.createServer((req, res) => {
  middleware(req, res, () => {
    http.get('http://example.com/', (remote) => {
      remote.pipe(res);
    });
  });
}).listen(8000);
