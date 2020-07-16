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
{"event":"start","id":7,"type":"HTTP_SERVER_REQUEST","path":[],"timestamp":44001121.574406,"meta":{"method":"GET","headers":{"host":"127.0.0.1:8000","user-agent":"curl/7.54.0","accept":"*/*"},"url":"/"}}
{"event":"start","id":13,"type":"DNS_LOOKUP","path":[11,7],"timestamp":44001132.18957,"meta":{"family":"any","hostname":"example.com"}}
{"event":"start","id":16,"type":"HTTP_CLIENT_REQUEST","path":[7],"timestamp":44001133.957034,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":13,"type":"DNS_LOOKUP","spin":0.465782,"selfSpin":0.465782,"timestamp":44001143.588424005,"duration":11.398854}
{"event":"start","id":30,"type":"HTTP_CLIENT_REQUEST","path":[11,7],"timestamp":44001168.393151,"meta":{"method":"GET","path":"/","headers":{"host":"example.com"}}}
{"event":"end","id":16,"type":"HTTP_CLIENT_REQUEST","spin":1.067104,"selfSpin":0.826454,"timestamp":44001168.914907,"duration":34.957873}
{"event":"end","id":30,"type":"HTTP_CLIENT_REQUEST","spin":14.873516999999998,"selfSpin":12.892622,"timestamp":44001197.395594,"duration":29.002443}
{"event":"end","id":7,"type":"HTTP_SERVER_REQUEST","spin":29.239529999999995,"selfSpin":12.927838,"timestamp":44001197.857574,"duration":76.283168}
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
