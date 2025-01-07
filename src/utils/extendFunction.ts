export const extendFunction = <
  T extends Function,
  A extends { [key: string]: any },
>(
  fn: T,
  addedProperties: A = {} as A
): T & A => {
  const clone = ((...args) => {
    return fn.call(null, ...args);
  }) as unknown as T & A;

  for (const key in fn) {
    if (Object.prototype.hasOwnProperty.call(fn, key)) {
      Object.assign(clone, { [key]: fn[key] });
    }
  }

  for (const key in addedProperties) {
    if (Object.prototype.hasOwnProperty.call(addedProperties, key)) {
      Object.assign(clone, { [key]: addedProperties[key] });
    }
  }

  return clone;
};
