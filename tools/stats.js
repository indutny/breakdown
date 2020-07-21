'use strict';

exports.computeStats = (list) => {
  list = list.slice().sort();

  const percentile = (cutoff) => {
    return list[Math.floor(list.length * cutoff)];
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
    [ 'p90', percentile(0.9) ],
    [ 'p95', percentile(0.95) ],
    [ 'p99', percentile(0.99) ],
  ];
};
