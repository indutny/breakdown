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
    const retry = () => {
      http.get('http://microsoft.com/', (remote) => {
        remote.pipe(res);
      }).on('error', retry);
    };

    retry();
  });
}).listen(8000);
