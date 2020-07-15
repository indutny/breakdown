'use strict';

exports.waitForProperty = (object, property, replace, callback) => {
  const old = Object.getOwnPropertyDescriptor(object, property) || {
    enumerable: true,
    configurable: true,
    writable: true,
    value: undefined,
  };

  Object.defineProperty(object, property, {
    get: () => {
      if (old.get) {
        return old.get();
      }
      return old.value;
    },

    set: (value) => {
      delete object[property];
      if (old) {
        Object.defineProperty(object, property, old);
      }

      if (replace) {
        value = replace(value);
      }
      object[property] = value;

      if (callback) {
        callback(value);
      }
    },

    configurable: old.configurable,
    enumerable: old.enumerable,
  });
};
