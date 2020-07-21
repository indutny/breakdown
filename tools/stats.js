'use strict';

function computeStats(list, mode = 'latency') {
  list = list.slice().sort((a, b) => a - b);

  const percentile = (cutoff) => {
    return list[Math.min(Math.round(list.length * cutoff), list.length - 1)];
  };

  let mean = 0;
  let stddev = 0;

  for (const value of list) {
    mean += value;
    stddev += value ** 2;
  }
  mean /= list.length;
  stddev /= list.length;
  stddev -= (mean ** 2);
  stddev = Math.sqrt(stddev);

  return [
    [ 'mean', mean ],
    [ 'stddev', stddev ],
    [ 'median', percentile(0.5) ],
  ].concat(mode === 'latency' ? [
    [ 'p90', percentile(0.9) ],
    [ 'p95', percentile(0.95) ],
    [ 'p99', percentile(0.99) ],
  ] : [
    [ 'p10', percentile(0.1) ],
    [ 'p25', percentile(0.25) ],
    [ 'p75', percentile(0.75) ],
    [ 'p90', percentile(0.9) ],
  ]);
}
exports.computeStats = computeStats;

function computeRPSStats(timestamps, window = 1) {
  timestamps = timestamps.slice().sort();

  const result = [];

  let end = timestamps[0] + window;

  let count = 0;
  for (const ts of timestamps) {
    if (ts >= end) {
      result.push(count / window);
      count = 0;

      while (ts >= end) {
        end += window;
      }
    }

    count++;
  }

  if (count !== 0) {
    result.push(count / window);
  }

  return computeStats(result, 'rps');
}
exports.computeRPSStats = computeRPSStats;
