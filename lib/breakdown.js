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
      asyncId: id,
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
      this._watchParser(event, resource);

    // Modern Node
    } else if (type === 'HTTPINCOMINGMESSAGE') {
      this._waitForParser(event, resource);
    } else if (type === 'HTTPCLIENTREQUEST') {
      this._onClientRequest(event, resource.req);
    } else if (type === 'GETADDRINFOREQWRAP') {
      this._onGetAddrInfo(event, resource);
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

  _startEvent(event, type, meta) {
    if (event.started) {
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

  _logEvent(event, payload) {
    if (!event.started) {
      return;
    }

    this._emit('log', event.eventId, payload);
  }

  _restart(event) {
    if (!event.started) {
      return event;
    }

    const newEvent = {
      ...event,
      started: false,
      eventId: this._nextID(),
      spin: 0n,
      selfSpin: 0n,
    };

    if (this._events.has(newEvent.asyncId)) {
      this._events.set(newEvent.asyncId, newEvent);
    }

    // End old event
    this._onEventEnd(event);

    return newEvent;
  }

  _onEventEnd(event) {
    if (!event.started) {
      return;
    }
    event.started = false;

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

  _waitForParser(event, resource) {
    waitForProperty(resource.socket, 'parser', false, (parser) => {
      // Clean-up?
      if (!parser) {
        return this._waitForParser(event, resource);
      }

      this._watchParser(event, parser);
    });
  }

  _watchParser(event, parser) {
    this._waitForOnIncoming(event, parser);
    this._waitForOutgoing(event, parser);
  }

  _waitForOnIncoming(event, parser) {
    // eslint-disable-next-line consistent-this
    const breakdown = this;

    waitForProperty(parser, 'onIncoming', (onIncoming) => {
      // Just a clean-up on parser re-use
      if (!onIncoming) {
        return onIncoming;
      }

      return function(incoming) {
        // Server incoming request
        if (!parser.outgoing) {
          event = breakdown._restart(event);
          breakdown._onIncomingRequest(event, this, incoming);
        }

        return onIncoming.apply(this, arguments);
      };
    }, (onIncoming) => {
      // Clean-up detected - wait again
      if (!onIncoming) {
        return this._waitForOnIncoming(event, parser);
      }
    });
  }

  _onIncomingRequest(event, parser, incoming) {
    let isClosed = false;
    const onClose = () => {
      if (isClosed) {
        return;
      }
      isClosed = true;

      setImmediate(() => {
        // New request or null
        this._onEventEnd(event);
      });
    };

    this._onResponse.set(incoming, (res) => {
      res.once('close', onClose);

      // Needed only for Node v10, because the order of events changed.
      res.once('finish', onClose);
    });

    // eslint-disable-next-line consistent-this
    const breakdown = this;
    incoming.once('close', function(isAborted) {
      if (isAborted || this.aborted) {
        breakdown._logEvent(event, { type: 'aborted' });
      }
    });

    this._startEvent(event, 'HTTP_SERVER_REQUEST', {
      method: incoming.method,
      headers: incoming.headers,
      url: incoming.url,
    });
  }

  _waitForOutgoing(event, parser) {
    waitForProperty(parser, 'outgoing', false, (outgoing) => {
      // Just a clean-up on parser re-use
      if (!outgoing) {
        this._waitForOutgoing(event, parser);
        return;
      }

      this._onClientRequest(event, outgoing);
      return;
    });
  }

  _onClientRequest(event, outgoing) {
    const onConnect = (socket) => {
      this._logEvent(event, {
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

    this._startEvent(event, 'HTTP_CLIENT_REQUEST', {
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

  _onGetAddrInfo(event, resource) {
    const family = resource.family === 0 ? 'any' :
      resource.family === 4 ? 'IPv4' : 'IPv6';

    // Override handle callback
    // eslint-disable-next-line consistent-this
    const breakdown = this;
    const callback = resource.callback;
    resource.callback = function(error, address) {
      resource.callback = callback;

      breakdown._logEvent(event, {
        error: error ? error.message : false,
        address,
      });
      return resource.callback.apply(this, arguments);
    };

    this._startEvent(event, 'DNS_LOOKUP', {
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
