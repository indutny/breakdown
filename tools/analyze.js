'use strict';

const fs = require('fs');
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
  const uri = `http://${host}${url}`.replace(/\?.*/, '');

  const latency = end.ts - start.ts;
  const spin = end.payload.spin;

  let remote = 0;
  for (const child of entry.children) {
    if (child.start.payload.type !== 'HTTP_CLIENT_REQUEST') {
      continue;
    }

    remote += child.end.ts - child.start.ts;
  }

  let value;
  if (endpoints.has(uri)) {
    value = endpoints.get(uri);
  } else {
    value = {
      spin: [],
      latency: [],
      remote: [],
      first: Infinity,
      last: -Infinity,
      rps: 0,
    };
    endpoints.set(uri, value);
  }
  value.spin.push(spin);
  value.latency.push(latency);
  value.remote.push(remote);
  value.first = Math.min(start.ts, value.first);
  value.last = Math.max(start.ts, value.last);
}

for (const [ key, value ] of endpoints) {
  endpoints.set(key, {
    rps: value.spin.length / (value.last - value.first),
    spin: computeStats(value.spin),
    latency: computeStats(value.latency),
    remote: computeStats(value.remote),
  });
}
console.log(endpoints);
