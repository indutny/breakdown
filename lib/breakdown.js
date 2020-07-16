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
    this.tree = new Map();
    this.onResponse = new WeakMap();

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
    this.tree.clear();
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

  _onInit(id, type, triggerId, resource) {
    if (!this.tree.has(triggerId) &&
        type !== 'HTTPPARSER' &&
        type !== 'HTTPINCOMINGMESSAGE') {
      return;
    }

    const parent = this.tree.get(triggerId);

    this.tree.set(id, {
      id: this._nextID(),
      triggerId,
      parent,

      type,

      path: null,
      started: false,
      start: null,

      parentId: parent ? parent.id : null,

      selfSpin: 0,
      spin: 0,
      spinStart: null,
    });

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
    if (!this.tree.has(id)) {
      return;
    }

    const node = this.tree.get(id);
    node.spinStart = process.hrtime();
  }

  _onAfter(id) {
    if (!this.tree.has(id)) {
      return;
    }

    const node = this.tree.get(id);
    let spin = process.hrtime(node.spinStart);
    spin = spin[0]  + spin[1] * 1e-9;

    node.spinStart = null;
    node.selfSpin += spin;

    let parentId = node.id;
    let parent = node;
    do {
      if (parent.id === parentId) {
        parent.spin += spin;
      }

      parentId = parent.parentId;
      parent = parent.parent;
    } while (parent);
  }

  _onDestroy(id) {
    if (!this.tree.has(id)) {
      return;
    }

    const node = this.tree.get(id)
    this.tree.delete(id);

    this._onEventEnd(node);
  }

  _startEvent(id, type, meta) {
    const node = this.tree.get(id);
    if (!node || node.started) {
      return;
    }

    node.start = Date.now();
    node.started = true;

    if (!node.path) {
      const path = [];
      let current = node;
      while (current) {
        if (current.parentId !== null) {
          path.push(current.parentId);
        }
        current = current.parent;
      }
      node.path = path;
    }

    this._emit('start', node.id, {
      type,
      path: node.path,
      meta,
    }, node.start);
  }

  _logEvent(id, payload) {
    const node = this.tree.get(id);
    if (!node || !node.started) {
      return;
    }

    this._emit('log', node.id, payload);
  }

  _restart(id) {
    const node = this.tree.get(id);
    if (!node) {
      return;
    }

    this._onEventEnd(node);

    node.started = false;
    node.id = this._nextID();
    node.spin = 0;
    node.selfSpin = 0;
  }

  _onEventEnd(node) {
    if (!node.started) {
      return;
    }

    this._emit('end', node.id, {
      spin: node.spin,
      selfSpin: node.selfSpin,
    });
  }

  _emit(type, id, payload, now) {
    if (!this.stream) {
      return;
    }

    this.stream.write(JSON.stringify({
      type,
      id,
      timestamp: (now || Date.now()) / 1000,
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
      this._logEvent(id, { remoteAddress: socket.remoteAddress });
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
}
module.exports = Breakdown;
