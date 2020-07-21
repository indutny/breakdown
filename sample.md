# Breakdown

## GET http://127.0.0.1:8000/

Request count: 6753

|                     | mean   | stddev | median | p10    | p25    | p75    | p90    |
| ------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Requests per Second | 250.11 | 23.85  | 255.00 | 240.00 | 244.00 | 265.00 | 270.00 |

|                | mean   | stddev | median | p90    | p95    | p99     |
| -------------- | ------ | ------ | ------ | ------ | ------ | ------- |
| Spin           | 1.0ms  | 0.4ms  | 0.9ms  | 1.4ms  | 1.6ms  | 2.1ms   |
| Latency        | 61.7ms | 79.6ms | 55.0ms | 70.0ms | 84.0ms | 105.0ms |
| Remote Latency | 61.5ms | 79.6ms | 55.0ms | 70.0ms | 84.0ms | 105.0ms |

### DNS

|                           | mean | stddev | median | p10  | p25  | p75  | p90  |
| ------------------------- | ---- | ------ | ------ | ---- | ---- | ---- | ---- |
| Total Queries per Request | 1.00 | 0.00   | 1.00   | 1.00 | 1.00 | 1.00 | 1.00 |

|                           | mean  | stddev | median | p90   | p95   | p99   |
| ------------------------- | ----- | ------ | ------ | ----- | ----- | ----- |
| Total Latency per Request | 1.6ms | 1.0ms  | 1.0ms  | 3.0ms | 3.0ms | 4.0ms |

### Remote Endpoints

#### GET example.com/

Request count: 6753

|                     | mean   | stddev | median | p10    | p25    | p75    | p90    |
| ------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Requests per Second | 250.11 | 24.60  | 253.00 | 241.00 | 245.00 | 264.00 | 270.00 |

|         | mean   | stddev | median | p90    | p95    | p99     |
| ------- | ------ | ------ | ------ | ------ | ------ | ------- |
| latency | 61.5ms | 79.6ms | 55.0ms | 70.0ms | 84.0ms | 105.0ms |

