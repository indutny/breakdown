# Performance comparison

## Server with remote request

About 5.08ms added latency per request.

## With breakdown started

```sh
$ wrk --latency -c 128 -t 16 -d 60 http://127.0.0.1:8000/abc
Running 1m test @ http://127.0.0.1:8000/abc
  16 threads and 128 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency   296.65ms  197.13ms   1.97s    92.72%
    Req/Sec    29.16     13.04    80.00     73.28%
  Latency Distribution
     50%  204.76ms
     75%  329.94ms
     90%  358.35ms
     99%    1.33s
  27519 requests in 1.00m, 2.60MB read
  Socket errors: connect 0, read 0, write 0, timeout 37
Requests/sec:    457.95
Transfer/sec:     44.27KB
```

## Without breakdown started

```sh
$ wrk --latency -c 128 -t 16 -d 60 http://127.0.0.1:8000/abc
Running 1m test @ http://127.0.0.1:8000/abc
  16 threads and 128 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency   291.57ms  193.56ms   1.91s    93.41%
    Req/Sec    29.49     13.00    79.00     73.67%
  Latency Distribution
     50%  203.01ms
     75%  329.61ms
     90%  348.86ms
     99%    1.33s
  28115 requests in 1.00m, 2.65MB read
  Socket errors: connect 0, read 0, write 0, timeout 43
Requests/sec:    467.80
Transfer/sec:     45.23KB
```

## Static server

About 4.28ms added latency per request.

## With breakdown started

```sh
$ wrk --latency -c 128 -t 16 -d 60 http://127.0.0.1:8000/abc
Running 1m test @ http://127.0.0.1:8000/abc
  16 threads and 128 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     7.04ms    1.37ms  73.74ms   91.33%
    Req/Sec     1.15k    82.57     1.46k    91.80%
  Latency Distribution
     50%    6.68ms
     75%    7.09ms
     90%    8.27ms
     99%   10.36ms
  1096633 requests in 1.00m, 108.77MB read
Requests/sec:  18254.95
Transfer/sec:      1.81MB
```

## Without breakdown started

```sh
$ wrk --latency -c 128 -t 16 -d 60 http://127.0.0.1:8000/abc
Running 1m test @ http://127.0.0.1:8000/abc
  16 threads and 128 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     2.76ms  659.44us  46.80ms   96.12%
    Req/Sec     2.92k   173.99     4.15k    93.34%
  Latency Distribution
     50%    2.64ms
     75%    2.77ms
     90%    3.08ms
     99%    4.03ms
  2793481 requests in 1.00m, 277.06MB read
Requests/sec:  46536.20
Transfer/sec:      4.62MB
```
