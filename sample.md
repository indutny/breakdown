# Breakdown

## GET http://127.0.0.1:8000/

Request count: 7934

|                     | mean   | stddev | median | p10    | p25    | p75    | p90    |
| ------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Requests per Second | 172.48 | 50.24  | 174.00 | 130.00 | 161.00 | 218.00 | 239.00 |

|               | mean   | stddev | median | p90    | p95    | p99     |
| ------------- | ------ | ------ | ------ | ------ | ------ | ------- |
| spin          | 1.0ms  | 0.4ms  | 0.9ms  | 1.4ms  | 1.5ms  | 2.0ms   |
| latency       | 31.4ms | 57.2ms | 25.0ms | 34.0ms | 44.0ms | 162.0ms |
| remoteLatency | 31.2ms | 57.2ms | 24.0ms | 34.0ms | 44.0ms | 161.0ms |

### Remote Endpoints

#### GET example.com/

Request count: 7934

|                     | mean   | stddev | median | p10    | p25    | p75    | p90    |
| ------------------- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| Requests per Second | 172.48 | 50.76  | 175.00 | 132.00 | 162.00 | 218.00 | 238.00 |

|         | mean   | stddev | median | p90    | p95    | p99     |
| ------- | ------ | ------ | ------ | ------ | ------ | ------- |
| latency | 31.2ms | 57.2ms | 24.0ms | 34.0ms | 44.0ms | 161.0ms |

