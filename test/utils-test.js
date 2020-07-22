/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const utils = require('../lib/utils');

describe('utils', () => {
  describe('waitForProperty()', () => {
    const waitForProperty = utils.waitForProperty;

    it('should invoke callback on property addition', () => {
      const obj = {};

      let emitted;
      waitForProperty(obj, 'value', false, (value) => {
        emitted = value;
      });

      assert.strictEqual(obj.value, undefined);
      obj.value = 42;
      assert.strictEqual(emitted, 42);
      assert.strictEqual(obj.value, 42);
    });

    it('should invoke callback on property change', () => {
      const obj = { value: 1 };

      let emitted;
      waitForProperty(obj, 'value', false, (value) => {
        emitted = value;
      });

      assert.strictEqual(obj.value, 1);
      obj.value = 42;
      assert.strictEqual(emitted, 42);
      assert.strictEqual(obj.value, 42);
    });

    it('should preserve property descriptor', () => {
      let setterValue;

      const obj = {};
      Object.defineProperty(obj, 'value', {
        enumerable: false,
        configurable: true,
        get() {
          return 1;
        },
        set(value) {
          setterValue = value;
        },
      });

      let emitted;
      waitForProperty(obj, 'value', false, (value) => {
        emitted = value;
      });

      assert.strictEqual(obj.value, 1);
      obj.value = 42;
      assert.strictEqual(emitted, 42);
      assert.strictEqual(obj.value, 1);
      assert.strictEqual(setterValue, 42);

      assert.strictEqual(
        Object.getOwnPropertyDescriptor(obj, 'value').enumerable,
        false);
    });

    it('should stack', () => {
      const obj = { value: 1 };

      let emitted1;
      waitForProperty(obj, 'value', false, (value) => {
        emitted1 = value;
      });

      let emitted2;
      waitForProperty(obj, 'value', false, (value) => {
        emitted2 = value;
      });

      assert.strictEqual(obj.value, 1);
      obj.value = 42;
      assert.strictEqual(emitted1, 42);
      assert.strictEqual(emitted2, 42);
      assert.strictEqual(obj.value, 42);
    });

    it('should do replacement', () => {
      const obj = { value: 1 };

      waitForProperty(obj, 'value', (value) => {
        return value * 2;
      });

      assert.strictEqual(obj.value, 1);
      obj.value = 23;
      assert.strictEqual(obj.value, 46);
    });
  });
});
