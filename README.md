# breakdown
[![Build Status](https://secure.travis-ci.org/@indutny/breakdown.svg)](http://travis-ci.org/@indutny/breakdown)
[![npm version](https://badge.fury.io/js/%40indutny%2Fbreakdown.svg)](https://badge.fury.io/js/%40indutny%2Fbreakdown)

Trace outgoing http requests for an http server and track the time spent
doing CPU intensive workload during each request.

## Why?

When optimizing app's performance requests to a remote server can turn out to be
the bottleneck. `breakdown` helps identify such scenarios and provides insights
into the latency and CPU usage for such requests as well as for the server
endpoints themselves.

## Usage

```js
const http = require('http');
const Breakdown = require('@indutny/breakdown');

const b = new Breakdown();

b.start('/path/to/log');

http.createServer((req, res) => {
  // ....
}).listen(8000);
```

## Output Format

Events are logged into a newline separated JSON objects:
```json
{"event":"start","id":1,"type":"HTTP_SERVER_REQUEST","path":[],"timestamp":1594860179495,"meta":{"method":"GET","headers":{"host":"127.0.0.1:8000","user-agent":"curl/7.54.0","accept":"*/*"},"url":"/"}}
{"event":"start","id":6,"type":"DNS_LOOKUP","path":[4,1],"timestamp":1594860179504,"meta":{"family":"any","hostname":"example.com"}}
{"event":"start","id":9,"type":"HTTP_CLIENT_REQUEST","path":[7,1],"timestamp":1594860179505,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":6,"type":"DNS_LOOKUP","spin":0.000486735,"selfSpin":0.000486735,"timestamp":1594860179514,"duration":10}
{"event":"start","id":22,"type":"HTTP_CLIENT_REQUEST","path":[21,20,4,1],"timestamp":1594860179535,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":9,"type":"HTTP_CLIENT_REQUEST","spin":0.001136993,"selfSpin":0.00046993200000000005,"timestamp":1594860179535,"duration":30}
{"event":"end","id":22,"type":"HTTP_CLIENT_REQUEST","spin":0.008475709000000001,"selfSpin":0.006659208,"timestamp":1594860179555,"duration":20}
{"event":"end","id":1,"type":"HTTP_SERVER_REQUEST","spin":0.031560152,"selfSpin":0.010891764,"timestamp":1594860179555,"duration":60}
```

Field description:

* `event` - either `start` or `end`
* `id` - unique event id
* `type` - event type
* `path` - inverse list of parent event ids. Note that some event ids in this
  list are internal and do not correspond to reported events (This may change
  in the future)
* `timestamp` - time of the event in milliseconds (unix time)
* `meta` - various fields pertaining to particular type of event
* `duration` - difference between `end.timestamp` and `start.timestamp`
* `spin` - total CPU time in seconds spent during this event and its children
* `selfSpin` - total CPU time in seconds spent during this event.

## Supported Asynchronous Evenst

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
