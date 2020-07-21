# breakdown
[![Build Status](https://secure.travis-ci.org/indutny/breakdown.svg)](http://travis-ci.org/indutny/breakdown)
[![npm version](https://badge.fury.io/js/%40indutny%2Fbreakdown.svg)](https://badge.fury.io/js/%40indutny%2Fbreakdown)

Trace outgoing http requests for an http server and track the time spent
doing CPU intensive workload during each such request and more.

## Why?

When optimizing app's performance, requests to a remote server can turn out to
be the bottleneck. `breakdown` helps identify such scenarios and provides
insights into the latency and CPU usage for such requests as well as for the
server endpoints themselves.

## Usage

```js
const http = require('http');
const Breakdown = require('@indutny/breakdown');

const b = new Breakdown();

b.start('/path/to/log');

const middleware = b.middleware();

http.createServer((req, res) => {
  // NOTE: Necessary only for Node < v12
  middleware(req, res);

  // ....
}).listen(8000);
```

## Analysis

Resulting log can be formatted into a (arguably) pretty [markdown file][sample]
using (inarguably) ugly procedure (to be improved in the future):
```sh
git clone git://github.com/indutny/breakdown
cd breakdown
npm i
node tools/analyze.js /path/to/log > pretty.md
```

## Output Format

Events are logged into a newline separated JSON objects:
```json
{"type":"start","id":1,"ts":1594931478.984,"payload":{"parentId":null,"type":"HTTP_SERVER_REQUEST","meta":{"method":"GET","headers":{"host":"127.0.0.1:8000","user-agent":"curl/7.54.0","accept":"*/*"},"url":"/a"}}}
{"type":"start","id":2,"ts":1594931478.992,"payload":{"parentId":1,"type":"DNS_LOOKUP","meta":{"family":"any","hostname":"example.com"}}}
{"type":"start","id":3,"ts":1594931478.994,"payload":{"parentId":1,"type":"HTTP_CLIENT_REQUEST","meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}}
{"type":"log","id":2,"ts":1594931479.003,"payload":{"error":false,"address":"93.184.216.34"}}
{"type":"end","id":2,"ts":1594931479.003,"payload":{"spin":0.0005950850000000001,"selfSpin":0.0005950850000000001}}
{"type":"log","id":3,"ts":1594931479.011,"payload":{"remoteAddress":"93.184.216.34","remotePort":80}}
{"type":"end","id":3,"ts":1594931479.032,"payload":{"spin":0.006975610000000001,"selfSpin":0.006975610000000001}}
{"type":"end","id":1,"ts":1594931479.032,"payload":{"spin":0.018026091,"selfSpin":0.010455395999999999}}
```

Field description:

* `type` - either `start`, `log`, or `end`
* `id` - unique event id
* `ts` - timestamp of the event in seconds (unix time)
* `payload` - a payload object dependent on the `type` field.

`start` payload:
* `type` - type of the event
* `parentId` - event id of the parent or `null`
* `meta` - various fields pertaining to particular type of event.

`log` payload:
- anything specific to particular event type.

`end` payload:
* `spin` - total CPU time in seconds spent during this event and its children
* `selfSpin` - total CPU time in seconds spent during this event.

## Supported Asynchronous Events

So far the only supported events are:

* HTTP Server requests
* HTTP Client requests
* DNS lookups

## How does this work?

This work through use of [`async_hooks`][0] APIs and some unfortunate use of
Node.js (semi-) internal code.

## Which Node.js versions are supported?

The module was tested on Node.js versions starting from v10 and up to v14.

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2020.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[0]: https://nodejs.org/api/async_hooks.html
[sample]: https://github.com/indutny/breakdown/blob/master/sample.md
