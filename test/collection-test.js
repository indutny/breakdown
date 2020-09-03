/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');
const net = require('net');

const Breakdown = require('../');

function stringifyEvents(events, port, includeHeaders) {
  return events
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
          content += ` ${meta.method} ${meta.url}`;
          if (includeHeaders) {
            content += ` ${JSON.stringify(meta.headers)}`;
          }
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
}

function sanitize(value) {
  if (typeof value === 'string') {
    return value.replace(/bad/g, 'good');
  }

  if (typeof value === 'object') {
    const copy = { ...value };
    for (const key of Object.keys(copy)) {
      assert.strictEqual(typeof copy[key], 'string',
        'non-shallow sanitize input');

      if (key.includes('bad')) {
        copy[key] = '[sanitized]';
      } else {
        copy[key] = sanitize(copy[key]);
      }
    }
    return copy;
  }

  throw new Error('Unexpected sanitize input: ' + JSON.stringify(value));
}

describe('Breakdown', () => {
  let b;
  let events;

  beforeEach(() => {
    b = new Breakdown({
      sanitize,
    });
    events = [];

    b.start(events);
  });

  afterEach(() => {
    b.stop();

    b = null;
    events = null;
  });

  it('should collect data from HTTP server', (callback) => {
    let port;

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
      const parsed = stringifyEvents(events, port);

      assert.deepStrictEqual(parsed, [
        [ 1, 'start', 'DNS_LOOKUP null localhost' ],
        [ 2, 'start', 'HTTP_CLIENT_REQUEST null GET /main' ],
        [ 1, 'log', { error: false, address: '127.0.0.1' } ],
        [ 1, 'end', null ],
        [ 2, 'log', { remoteAddress: '127.0.0.1', remotePort: 0 } ],
        [ 3, 'start', 'HTTP_SERVER_REQUEST null GET /main' ],
        [ 4, 'start', 'DNS_LOOKUP 3 localhost' ],
        [ 5, 'start', 'HTTP_CLIENT_REQUEST 3 GET /sub' ],
        [ 4, 'log', { error: false, address: '127.0.0.1' } ],
        [ 4, 'end', null ],
        [ 5, 'log', { remoteAddress: '127.0.0.1', remotePort: 0 } ],
        [ 6, 'start', 'HTTP_SERVER_REQUEST null GET /sub' ],
        [ 6, 'end', null ],
        [ 5, 'end', null ],
        [ 3, 'end', null ],
        [ 2, 'end', null ],
      ]);

      callback();
    };
  });

  it('should collect logs on aborted server request', (callback) => {
    let port;

    const middleware = b.middleware();

    const server = http.createServer((req, res) => {
      middleware(req, res);

      req.resume();
      res.flushHeaders();

      req.on('close', () => {
        setImmediate(() => {
          server.close(() => check(callback));
        });
      });
    }).listen(0, () => {
      port = server.address().port;

      shoot();
    });

    const shoot = () => {
      const socket = net.connect(port, () => {
        socket.write(
          'POST /main HTTP/1.1\r\nContent-Length: 42\r\n\r\n',
          () => socket.destroy());
      });
    };

    const check = (callback) => {
      const parsed = stringifyEvents(events, port);

      assert.deepStrictEqual(parsed, [
        [ 1, 'start', 'DNS_LOOKUP null localhost' ],
        [ 1, 'log', { address: '127.0.0.1', error: false } ],
        [ 1, 'end', null ],
        [ 2, 'start', 'HTTP_SERVER_REQUEST null POST /main' ],
        [ 2, 'log', { type: 'aborted' } ],
        [ 2, 'end', null ],
      ]);

      callback();
    };
  });

  it('should collect logs on keep-alive requests', (callback) => {
    let port;

    const middleware = b.middleware();

    let waiting = 2;

    let client;

    const server = http.createServer((req, res) => {
      middleware(req, res);

      res.end();
      if (--waiting === 0) {
        client.end();
        server.close(() => check(callback));
      }
    }).listen(0, () => {
      port = server.address().port;

      shoot();
    });

    const shoot = () => {
      client = net.connect(port, () => {
        client.write(
          'GET /first HTTP/1.1\r\n\r\n' +
            'GET /second HTTP/1.1\r\n\r\n');
      });
    };

    const check = (callback) => {
      const parsed = stringifyEvents(events, port);

      assert.deepStrictEqual(parsed, [
        [ 1, 'start', 'DNS_LOOKUP null localhost' ],
        [ 1, 'log', { address: '127.0.0.1', error: false } ],
        [ 1, 'end', null ],
        [ 2, 'start', 'HTTP_SERVER_REQUEST null GET /first' ],
        [ 2, 'end', null ],
        [ 3, 'start', 'HTTP_SERVER_REQUEST null GET /second' ],
        [ 3, 'end', null ],
      ]);

      callback();
    };
  });

  it('should sanitize logs', (callback) => {
    let port;

    const middleware = b.middleware();

    let waiting = 2;

    let client;

    const server = http.createServer((req, res) => {
      middleware(req, res);

      res.end();
      if (--waiting === 0) {
        client.end();
        server.close(() => check(callback));
      }
    }).listen(0, () => {
      port = server.address().port;

      shoot();
    });

    const shoot = () => {
      client = net.connect(port, () => {
        client.write(
          'GET /bad HTTP/1.1\r\n\r\n' +
            'GET /other HTTP/1.1\r\nBad: hello\r\nGood: okay\r\n\r\n');
      });
    };

    const check = (callback) => {
      const parsed = stringifyEvents(events, port, true);

      assert.deepStrictEqual(parsed, [
        [ 1, 'start', 'DNS_LOOKUP null localhost' ],
        [ 1, 'log', { address: '127.0.0.1', error: false } ],
        [ 1, 'end', null ],
        [ 2, 'start', 'HTTP_SERVER_REQUEST null GET /good {}' ],
        [ 2, 'end', null ],
        [
          3,
          'start',
          'HTTP_SERVER_REQUEST null GET /other ' +
            '{"bad":"[sanitized]","good":"okay"}',
        ],
        [ 3, 'end', null ],
      ]);

      callback();
    };
  });
});
