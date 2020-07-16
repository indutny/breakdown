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
{"event":"start","id":1,"type":"HTTP_SERVER_REQUEST","path":[],"timestamp":45710.847671222,"meta":{"method":"GET","headers":{"host":"127.0.0.1:8000","user-agent":"curl/7.54.0","accept":"*/*"},"url":"/"}}
{"event":"start","id":6,"type":"DNS_LOOKUP","path":[4,1],"timestamp":45710.857322863,"meta":{"family":"any","hostname":"example.com"}}
{"event":"start","id":9,"type":"HTTP_CLIENT_REQUEST","path":[7,1],"timestamp":45710.85938596,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":6,"type":"DNS_LOOKUP","spin":0.00042712200000000005,"selfSpin":0.00042712200000000005,"timestamp":45710.875317811995,"duration":0.017994949}
{"event":"start","id":22,"type":"HTTP_CLIENT_REQUEST","path":[21,20,4,1],"timestamp":45710.897285088,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":9,"type":"HTTP_CLIENT_REQUEST","spin":0.0014479620000000001,"selfSpin":0.000574541,"timestamp":45710.897618582,"duration":0.038232622}
{"event":"end","id":22,"type":"HTTP_CLIENT_REQUEST","spin":0.018362921000000008,"selfSpin":0.011661248,"timestamp":45710.927409515,"duration":0.030124427000000002}
{"event":"end","id":1,"type":"HTTP_SERVER_REQUEST","spin":0.048288974999999984,"selfSpin":0.012087876000000001,"timestamp":45710.927619161,"duration":0.07994793900000001}
```

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
