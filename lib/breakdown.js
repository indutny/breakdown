'use strict';
const fs = require('fs');
const http = require('http');
const async_hooks = require('async_hooks');

const { waitForProperty } = require('./utils');

class Breakdown {
  constructor() {
    this.hook = async_hooks.createHook({
      init: (id, type, triggerId, resource) => {
        this._onInit(id, type, triggerId, resource);
      },
      before: (id) => this._onBefore(id),
      after: (id) => this._onAfter(id),
      destroy: (id) => this._onDestroy(id),
    });

    this.stream = null;
    this.events = new Map();
    this.stack = [];
    this.onResponse = new WeakMap();

    this.parentById = new Map();

    this.lastID = 0;
  }

  start(path) {
    if (this.stream) {
      throw new Error('Already started');
    }

    this.stream = fs.createWriteStream(path);
    this.hook.enable();
  }

  stop() {
    this.hook.disable();
    if (this.stream) {
      this.stream.end();
    }
    this.events.clear();
    this.stream = null;
  }

  track(req, res) {
    if (this.onResponse.has(req)) {
      this.onResponse.get(req)(res);
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
    const stackTop = this.stack.length === 0 ? triggerId :
      this.stack[this.stack.length - 1].id;
    this.parentById.set(id, stackTop);

    if (type !== 'HTTPPARSER' &&
        type !== 'HTTPINCOMINGMESSAGE' &&
        type !== 'HTTPCLIENTREQUEST' &&
        type !== 'GETADDRINFOREQWRAP') {
      return;
    }

    const parent = this._findParent(stackTop);

    const event = {
      eventId: this._nextID(),

      parent,
      parentId: parent ? parent.eventId : null,

      started: false,
      start: 0,

      selfSpin: 0,
      spin: 0,
      spinStart: null,
    };
    this.events.set(id, event);

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

  _onBefore(id) {
    this.stack.push({ id, spinStart: process.hrtime() });
  }

  _onAfter(id) {
    const { spinStart } = this.stack.pop();
    let spin = process.hrtime(spinStart);
    spin = spin[0]  + spin[1] * 1e-9;

    const event = this._findParent(id);
    if (!event) {
      return;
    }
    event.selfSpin += spin;

    let parentId = event.eventId;
    let parent = event;
    do {
      if (parent.eventId === parentId) {
        parent.spin += spin;
      }

      parentId = parent.parentId;
      parent = parent.parent;
    } while (parent);
  }

  _onDestroy(id) {
    this.parentById.delete(id);

    if (!this.events.has(id)) {
      return;
    }

    const event = this.events.get(id)
    this.events.delete(id);

    this._onEventEnd(event);
  }

  //
  // Private methods
  //

  _startEvent(id, type, meta) {
    const event = this.events.get(id);
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
    const event = this.events.get(id);
    if (!event || !event.started) {
      return;
    }

    this._emit('log', event.eventId, payload);
  }

  _restart(id) {
    const event = this.events.get(id);
    if (!event) {
      return;
    }

    this._onEventEnd(event);

    event.started = false;
    event.eventId = this._nextID();
    event.spin = 0;
    event.selfSpin = 0;
  }

  _onEventEnd(event) {
    if (!event.started) {
      return;
    }

    this._emit('end', event.eventId, {
      spin: event.spin,
      selfSpin: event.selfSpin,
    });
  }

  _emit(type, id, payload, now) {
    if (!this.stream) {
      return;
    }

    this.stream.write(JSON.stringify({
      type,
      id,
      ts: (now || Date.now()) / 1000,
      payload,
    }) + '\n');
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
    const self = this;

    waitForProperty(parser, 'onIncoming', (onIncoming) => {
      // Just a clean-up on parser re-use
      if (!onIncoming) {
        return onIncoming;
      }

      return function(incoming) {
        self._onIncomingRequest(id, this, incoming);
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

    const onFinish = () => {
      setImmediate(() => {
        // New request or null
        this._restart(id);
      });
    };

    incoming.once('close', onFinish);

    // Legacy node
    this.onResponse.set(incoming, (res) => {
      res.once('finish', onFinish);
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
    const self = this;
    const callback = resource.callback;
    resource.callback = function(error, address) {
      resource.callback = callback;

      self._logEvent(id, {
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
    this.lastID = (this.lastID + 1) >>> 0;
    return this.lastID;
  }

  _findParent(parentId) {
    let parent;
    while (parentId !== null) {
      if (this.events.has(parentId)) {
        return this.events.get(parentId);
      }

      if (this.parentById.has(parentId)) {
        parentId = this.parentById.get(parentId);
      } else {
        parentId = null;
      }
    }
  }
}
module.exports = Breakdown;
