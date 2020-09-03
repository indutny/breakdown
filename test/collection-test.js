/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');

const Breakdown = require('../');

describe('Breakdown', () => {
  it('should collect data from HTTP server', (callback) => {
    const b = new Breakdown();
    const events = [];

    let port;

    b.start(events);

    const middleware = b.middleware();

    const server = http.createServer((req, res) => {
      middleware(req, res);

      if (req.url === '/main') {
        http.get({
          port,

          path: '/sub',
        }, (clientRes) => {
          clientRes.pipe(res);
        });
      } else {
        res.end('okay');
      }
    }).listen(0, () => {
      port = server.address().port;

      shoot(() => {
        check(callback);
      });
    });

    const shoot = (callback) => {
      http.get({
        port,
        path: '/main',
      }, (res) => {
        res.resume();
        res.on('close', () => {
          server.close(callback);
        });
      });
    };

    const check = (callback) => {
      b.stop();

      const parsed = events
        .map((raw) => JSON.parse(raw))
        .map(({ id, type, payload }) => {
          let content;

          if (type === 'start') {
            const meta = payload.meta;

            content = `${payload.type} ${payload.parentId}`;
            if (payload.type === 'DNS_LOOKUP') {
              content += ` ${meta.hostname}`;
            } else if (payload.type === 'HTTP_CLIENT_REQUEST') {
              content += ` ${meta.method} ${meta.path}`;
            } else if (payload.type === 'HTTP_SERVER_REQUEST') {
              content += ` ${meta.method} ${meta.path}`;
            }
          } else if (type === 'log') {
            content = JSON.parse(
              JSON.stringify(payload)
                .replace(port.toString(), '0'));
          } else {
            assert.strictEqual(type, 'end');
            content = null;
          }

          return [
            id,
            type,
            content,
          ];
        });

      assert.deepStrictEqual(parsed, [
        [ 1, 'start', 'DNS_LOOKUP null localhost' ],
        [ 2, 'start', 'HTTP_CLIENT_REQUEST null GET /main' ],
        [ 1, 'log', { error: false, address: '127.0.0.1' } ],
        [ 1, 'end', null ],
        [ 2, 'log', { remoteAddress: '127.0.0.1', remotePort: 0 } ],
        [ 3, 'start', 'HTTP_SERVER_REQUEST null GET undefined' ],
        [ 4, 'start', 'DNS_LOOKUP 3 localhost' ],
        [ 5, 'start', 'HTTP_CLIENT_REQUEST 3 GET /sub' ],
        [ 4, 'log', { error: false, address: '127.0.0.1' } ],
        [ 4, 'end', null ],
        [ 5, 'log', { remoteAddress: '127.0.0.1', remotePort: 0 } ],
        [ 6, 'start', 'HTTP_SERVER_REQUEST null GET undefined' ],
        [ 6, 'end', null ],
        [ 5, 'end', null ],
        [ 3, 'end', null ],
        [ 2, 'end', null ],
      ]);

      callback();
    };
  });
});
