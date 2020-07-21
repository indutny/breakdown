# Breakdown

## GET http://127.0.0.1:8000/

Request count: 1

|                     | mean | stddev | median | p10  | p25  | p75  | p90  |
| ------------------- | ---- | ------ | ------ | ---- | ---- | ---- | ---- |
| Requests per Second | 1.00 | 0.00   | 1.00   | 1.00 | 1.00 | 1.00 | 1.00 |

|                | mean   | stddev | median | p90    | p95    | p99    |
| -------------- | ------ | ------ | ------ | ------ | ------ | ------ |
| Spin           | 19.1ms | 0.0ms  | 19.1ms | 19.1ms | 19.1ms | 19.1ms |
| Latency        | 46.0ms | 0.0ms  | 46.0ms | 46.0ms | 46.0ms | 46.0ms |
| Remote Latency | 27.0ms | 0.0ms  | 27.0ms | 27.0ms | 27.0ms | 27.0ms |

### DNS

|                           | mean | stddev | median | p10  | p25  | p75  | p90  |
| ------------------------- | ---- | ------ | ------ | ---- | ---- | ---- | ---- |
| Total Queries per Request | 1.00 | 0.00   | 1.00   | 1.00 | 1.00 | 1.00 | 1.00 |

|                           | mean   | stddev | median | p90    | p95    | p99    |
| ------------------------- | ------ | ------ | ------ | ------ | ------ | ------ |
| Total Latency per Request | 13.0ms | 0.0ms  | 13.0ms | 13.0ms | 13.0ms | 13.0ms |

### Remote Endpoints

#### GET example.com/

Request count: 1

|                     | mean | stddev | median | p10  | p25  | p75  | p90  |
| ------------------- | ---- | ------ | ------ | ---- | ---- | ---- | ---- |
| Requests per Second | 1.00 | 0.00   | 1.00   | 1.00 | 1.00 | 1.00 | 1.00 |

|         | mean   | stddev | median | p90    | p95    | p99    |
| ------- | ------ | ------ | ------ | ------ | ------ | ------ |
| latency | 27.0ms | 0.0ms  | 27.0ms | 27.0ms | 27.0ms | 27.0ms |

