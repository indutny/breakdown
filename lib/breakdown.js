'use strict';
const fs = require('fs');
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
      meta: null,
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

    // Miscellaneous
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
    if (!node || node.meta) {
      return;
    }

    node.start = Date.now();
    node.type = type;
    node.meta = meta;

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

    if (!this.stream) {
      return;
    }

    this.stream.write(JSON.stringify({
      event: 'start',

      id: node.id,
      type: node.type,
      path: node.path,
      timestamp: node.start,
      meta: node.meta,
    }) + '\n');
  }

  _restart(id) {
    const node = this.tree.get(id);
    if (!node) {
      return;
    }

    this._onEventEnd(node);

    node.meta = null;
    node.id = this._nextID();
    node.start = Date.now();
    node.spin = 0;
    node.selfSpin = 0;
  }

  _onEventEnd(node) {
    if (!node.meta) {
      return;
    }

    const timestamp = Date.now();
    const duration = timestamp - node.start;

    if (!this.stream) {
      return;
    }

    this.stream.write(JSON.stringify({
      event: 'end',
      id: node.id,
      type: node.type,
      spin: node.spin,
      selfSpin: node.selfSpin,
      timestamp,
      duration,
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

    waitForProperty(parser, 'incoming', false, () => {
      setImmediate(() => {
        // New request or null
        this._restart(id);
      });
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
    this._startEvent(id, 'HTTP_CLIENT_REQUEST', {
      method: outgoing.method,
      path: outgoing.path,
      headers: outgoing.getHeaders(),
    });
  }

  _onGetAddrInfo(id, resource) {
    const family = resource.family === 0 ? 'any' :
      resource.family === 4 ? 'IPv4' : 'IPv6';
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
