'use strict';

const http = require('http');

const Breakdown = require('../');

const b = new Breakdown();

b.start('log.json');

process.on('SIGINT', () => {
  b.stop();
  process.exit();
});

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 1,
  maxFreeSockets: 1,
  timeout: 60 * 1000,
});

const get = (path, callback) => {
  http.request({
    agent,
    host: 'example.com',

    method: 'GET',
    path,
  }, callback).end();
};

http.createServer((req, res) => {
  get('/', (remote) => {
    remote.resume();
    remote.on('end', () => {
      get('/', (remote) => {
        remote.pipe(res);
      });
    });
  });
}).listen(8000);
