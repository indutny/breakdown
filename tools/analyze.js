'use strict';

const fs = require('fs');
const util = require('util');
const { computeStats } = require('./stats');

const log = fs.readFileSync(process.argv[2]).toString().split(/\n/g)
  .map((line) => line.trim())
  .filter((line) => line)
  .map((line) => JSON.parse(line));

//
// Create a map from id to all entries pertaining to it
//

const entriesById = new Map();
for (const line of log) {
  let entry;
  if (entriesById.has(line.id)) {
    entry = entriesById.get(line.id);
  } else {
    entry = { start: null, end: null, log: [], children: [] };
    entriesById.set(line.id, entry);
  }

  if (line.type === 'start') {
    entry.start = line;
  } else if (line.type === 'end') {
    entry.end = line;
  } else if (line.type === 'log') {
    entry.log.push(line);
  }
}

//
// Prune incomplete entries
//
for (const [ id, entry ] of entriesById) {
  if (!entry.start || !entry.end) {
    entriesById.delete(id);
  }
}

//
// Assign direct children of each entry
//
for (const entry of entriesById.values()) {
  const start = entry.start;

  const parentId = start.payload.parentId;
  if (parentId !== null && entriesById.has(parentId)) {
    entriesById.get(parentId).children.push(entry);
  }
}

//
// Process requests
//
const endpoints = new Map();
for (const entry of entriesById.values()) {
  const start = entry.start;
  if (start.payload.type !== 'HTTP_SERVER_REQUEST') {
    continue;
  }

  const { method, url, headers } = start.payload.meta;
  const end = entry.end;

  const host = (headers.host || '').toLowerCase();
  const endpoint = `${method} http://${host}${url}`.replace(/\?.*/, '');

  const latency = end.ts - start.ts;
  const spin = end.payload.spin;

  let value;
  if (endpoints.has(endpoint)) {
    value = endpoints.get(endpoint);
  } else {
    value = {
      spin: [],
      latency: [],
      remoteLatency: [],
      remote: new Map(),
      first: Infinity,
      last: -Infinity,
      rps: 0,
    };
    endpoints.set(endpoint, value);
  }

  let remoteLatency = 0;
  for (const child of entry.children) {
    if (child.start.payload.type !== 'HTTP_CLIENT_REQUEST') {
      continue;
    }
    const {
      method: remoteMethod, path: remotePath, headers,
    } = child.start.payload.meta;
    const childLatency = child.end.ts - child.start.ts;

    const remoteEndpoint =
      `${remoteMethod} ${headers.host}${remotePath.replace(/\?.*/, '')}`;

    remoteLatency += childLatency;

    let remoteValue;
    if (value.remote.has(remoteEndpoint)) {
      remoteValue = value.remote.get(remoteEndpoint);
    } else {
      remoteValue = { latency: [], count: 0 };
      value.remote.set(remoteEndpoint, remoteValue);
    }
    remoteValue.latency.push(remoteLatency);
    remoteValue.count++;
  }

  value.spin.push(spin);
  value.latency.push(latency);
  value.remoteLatency.push(remoteLatency);
  value.first = Math.min(start.ts, value.first);
  value.last = Math.max(start.ts, value.last);
}

for (const [ key, value ] of endpoints) {
  const remote = value.remote;
  for (const [ remoteKey, remoteValue ] of remote) {
    remote.set(remoteKey, {
      count: remoteValue.count,
      rps: remoteValue.count / (value.last - value.first),
      latency: computeStats(remoteValue.latency),
    });
  }

  endpoints.set(key, {
    count: value.spin.length,
    rps: value.spin.length / (value.last - value.first),
    spin: computeStats(value.spin),
    latency: computeStats(value.latency),
    remoteLatency: computeStats(value.remoteLatency),
    remote,
  });
}
console.log(util.inspect(endpoints, {
  depth: 300,
  colors: true,
}));
