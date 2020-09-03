'use strict';
const fs = require('fs');
const asyncHooks = require('async_hooks');

const { waitForProperty } = require('./utils');

class Breakdown {
  constructor(options = {}) {
    this.options = {
      buffer: {
        maxLength: 64 * 1024,
        flushInterval: 1000,

        ...(options.buffer || {}),
      },
    };

    this._hook = asyncHooks.createHook({
      init: (id, type, triggerId, resource) => {
        this._onInit(id, type, triggerId, resource);
      },
      before: (id) => this._onBefore(id),
      after: (id) => this._onAfter(id),
      destroy: (id) => this._onDestroy(id),
    });

    this._stream = null;
    this._events = new Map();
    this._stack = [];
    this._onResponse = new WeakMap();

    this._parentsById = new Map();
    this._buffer = '';
    this._bufferFlush = null;

    this._lastID = 0;
  }

  start(path) {
    if (this._stream) {
      throw new Error('Already started');
    }

    // Array `path` is mostly for testing
    this._stream = Array.isArray(path) ?
      path :
      fs.createWriteStream(path);
    this._bufferFlush = setInterval(() => {
      this._flush();
    }, this.options.buffer.flushInterval);

    this._hook.enable();
  }

  stop() {
    if (!this._stream) {
      return;
    }

    this._hook.disable();
    this._flush();
    if (!Array.isArray(this._stream)) {
      this._stream.end();
    }
    this._stream = null;

    clearInterval(this._bufferFlush);
    this._bufferFlush = null;

    this._events.clear();
  }

  track(req, res) {
    if (this._onResponse.has(req)) {
      this._onResponse.get(req)(res);
    }
  }

  middleware() {
    return (req, res, next) => {
      this.track(req, res);
      if (next) {
        next();
      }
    };
  }

  //
  // Hooks
  //

  _onInit(id, type, triggerId, resource) {
    let executionId = asyncHooks.executionAsyncId();
    if (executionId === 0) {
      executionId = triggerId;
    }

    const parents = {
      current: executionId,
      previous: this._parentsById.get(executionId) || null,
    };
    this._parentsById.set(id, parents);

    if (type !== 'HTTPPARSER' &&
        type !== 'HTTPINCOMINGMESSAGE' &&
        type !== 'HTTPCLIENTREQUEST' &&
        type !== 'GETADDRINFOREQWRAP') {
      return;
    }

    const parent = this._findParent(parents);
    const event = {
      eventId: this._nextID(),

      parent,
      parentId: parent ? parent.eventId : null,

      started: false,
      start: 0,

      selfSpin: 0n,
      spin: 0n,
    };
    this._events.set(id, event);

    // Node ~ v10
    // XXX(indutny): which exact version of node?
    if (type === 'HTTPPARSER') {
      this._watchParser(id, resource);

    // Modern Node
    } else if (type === 'HTTPINCOMINGMESSAGE') {
      this._waitForParser(id, resource);
    } else if (type === 'HTTPCLIENTREQUEST') {
      this._onClientRequest(id, resource.req);
    } else if (type === 'GETADDRINFOREQWRAP') {
      this._onGetAddrInfo(id, resource);
    }
  }

  _onBefore() {
    this._stack.push(process.hrtime.bigint());
  }

  _onAfter(id) {
    if (this._stack.length === 0) {
      return;
    }

    const spinStart = this._stack.pop();
    const spinEnd = process.hrtime.bigint();
    let spin = spinEnd - spinStart;
    if (spin < 0n) {
      spin = 0n;
    }

    // Make sure to subtract spin time from the stack
    for (let i = 0; i < this._stack.length; i++) {
      this._stack[i] += spin;
    }

    const event = this._findParent(this._parentsById.get(id) || null);
    if (!event) {
      return;
    }
    event.selfSpin += spin;

    let parentId = event.eventId;
    let parent = event;
    do {
      // The parent ended and was reset - do not propagate spin time to it
      if (parent.eventId !== parentId) {
        break;
      }
      parent.spin += spin;

      parentId = parent.parentId;
      parent = parent.parent;
    } while (parent);
  }

  _onDestroy(id) {
    this._parentsById.delete(id);

    if (!this._events.has(id)) {
      return;
    }

    const event = this._events.get(id);
    this._events.delete(id);

    this._onEventEnd(event);
  }

  //
  // Private methods
  //

  _startEvent(id, type, meta) {
    const event = this._events.get(id);
    if (!event || event.started) {
      return;
    }

    event.start = Date.now();
    event.started = true;

    this._emit('start', event.eventId, {
      id: event.id,
      parentId: event.parentId,
      type,
      meta,
    }, event.start);
  }

  _logEvent(id, payload) {
    const event = this._events.get(id);
    if (!event || !event.started) {
      return;
    }

    this._emit('log', event.eventId, payload);
  }

  _restart(id) {
    const event = this._events.get(id);
    if (!event) {
      return;
    }

    this._onEventEnd(event);

    event.started = false;
    event.eventId = this._nextID();
    event.spin = 0n;
    event.selfSpin = 0n;
  }

  _onEventEnd(event) {
    if (!event.started) {
      return;
    }

    this._emit('end', event.eventId, {
      spin: Number(event.spin) * 1e-9,
      selfSpin: Number(event.selfSpin) * 1e-9,
    });
  }

  _emit(type, id, payload, now) {
    if (!this._stream) {
      return;
    }

    const str = JSON.stringify({
      type,
      id,
      ts: (now || Date.now()) / 1000,
      payload,
    });

    if (Array.isArray(this._stream)) {
      this._stream.push(str);
      return;
    }

    this._buffer += str + '\n';

    if (this._buffer.length > this.options.buffer.maxLength) {
      this._flush();
    }
  }

  _flush() {
    if (this._buffer.length === 0) {
      return;
    }

    this._stream.write(this._buffer);
    this._buffer = '';
  }

  _waitForParser(id, resource) {
    waitForProperty(resource.socket, 'parser', false, (parser) => {
      // Clean-up?
      if (!parser) {
        return this._waitForParser(id, resource);
      }

      this._watchParser(id, parser);
    });
  }

  _watchParser(id, parser) {
    this._waitForOnIncoming(id, parser);
    this._waitForOutgoing(id, parser);
  }

  _waitForOnIncoming(id, parser) {
    // eslint-disable-next-line consistent-this
    const breakdown = this;

    waitForProperty(parser, 'onIncoming', (onIncoming) => {
      // Just a clean-up on parser re-use
      if (!onIncoming) {
        return onIncoming;
      }

      return function(incoming) {
        breakdown._onIncomingRequest(id, this, incoming);
        return onIncoming.apply(this, arguments);
      };
    }, (onIncoming) => {
      // Clean-up detected - wait again
      if (!onIncoming) {
        return this._waitForOnIncoming(id, parser);
      }
    });
  }

  _onIncomingRequest(id, parser, incoming) {
    // Client response
    if (parser.outgoing) {
      return;
    }

    const onClose = () => {
      setImmediate(() => {
        // New request or null
        this._restart(id);
      });
    };

    this._onResponse.set(incoming, (res) => {
      res.once('finish', onClose);
    });

    this._startEvent(id, 'HTTP_SERVER_REQUEST', {
      method: incoming.method,
      headers: incoming.headers,
      url: incoming.url,
    });
  }

  _waitForOutgoing(id, parser) {
    waitForProperty(parser, 'outgoing', false, (outgoing) => {
      // Just a clean-up on parser re-use
      if (!outgoing) {
        this._waitForOutgoing(id, parser);
        return;
      }

      this._onClientRequest(id, outgoing);
      return;
    });
  }

  _onClientRequest(id, outgoing) {
    const onConnect = (socket) => {
      this._logEvent(id, {
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
      });
    };

    const onSocket = (socket) => {
      if (outgoing.socket.pending) {
        socket.once('connect', () => onConnect(socket));
      } else {
        onConnect(socket);
      }
    };

    this._startEvent(id, 'HTTP_CLIENT_REQUEST', {
      method: outgoing.method,
      path: outgoing.path,
      headers: outgoing.getHeaders(),
    });

    if (outgoing.socket) {
      onSocket(outgoing.socket);
    } else {
      outgoing.once('socket', onSocket);
    }
  }

  _onGetAddrInfo(id, resource) {
    const family = resource.family === 0 ? 'any' :
      resource.family === 4 ? 'IPv4' : 'IPv6';

    // Override handle callback
    // eslint-disable-next-line consistent-this
    const breakdown = this;
    const callback = resource.callback;
    resource.callback = function(error, address) {
      resource.callback = callback;

      breakdown._logEvent(id, {
        error: error ? error.message : false,
        address,
      });
      return resource.callback.apply(this, arguments);
    };

    this._startEvent(id, 'DNS_LOOKUP', {
      family,
      hostname: resource.hostname,
    });
  }

  _nextID() {
    this._lastID = (this._lastID + 1) >>> 0;
    return this._lastID;
  }

  _findParent(parents) {
    while (parents !== null) {
      const parentId = parents.current;

      if (this._events.has(parentId)) {
        return this._events.get(parentId);
      }

      parents = parents.previous;
    }
    return null;
  }
}
module.exports = Breakdown;
