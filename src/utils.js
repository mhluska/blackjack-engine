export default class Utils {
  static arraySum(array) {
    return array.reduce((acc, current) => acc + current, 0);
  }

  // Fisher–Yates shuffle algorithm.
  // See https://stackoverflow.com/a/6274381/659910
  static arrayShuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  static arraySample(array) {
    return array[this.random(0, array.length - 1)];
  }

  static arrayMove(array, fromIndex, toIndex) {
    const element = array[fromIndex];
    array.splice(fromIndex, 1);
    array.splice(toIndex, 0, element);
  }

  static arrayFlatten(array) {
    return array.reduce((flatten, arr) => [...flatten, ...arr]);
  }

  static random(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomId() {
    // TODO: Make the backend generate this.
    // return crypto.randomBytes(16).toString('hex');
    return Math.random().toString(36).substring(2);
  }

  static sleep(ms) {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static clamp(number, min, max) {
    return Math.max(Math.min(number, max), min);
  }

  // See https://stackoverflow.com/a/43532829
  static round(value, digits = 2) {
    value = value * Math.pow(10, digits);
    value = Math.round(value);
    value = value / Math.pow(10, digits);

    return value;
  }

  // Range will be either `>= x` or `< x` for an integer `x`.
  static rangeBoundary(range) {
    return parseInt(range.split(' ').pop());
  }

  static compareRange(number, range) {
    const boundary = this.rangeBoundary(range);
    return range.includes('>=') ? number >= boundary : number < boundary;
  }

  static hiLoValue(cards) {
    return cards.reduce((acc, card) => acc + card.hiLoValue, 0);
  }

  static formatCents(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  // See https://stackoverflow.com/a/48218209/659910
  static mergeDeep(...objects) {
    const isObject = (obj) => obj && typeof obj === 'object';

    return objects.reduce((prev, obj) => {
      Object.keys(obj).forEach((key) => {
        const pVal = prev[key];
        const oVal = obj[key];

        if (Array.isArray(pVal) && Array.isArray(oVal)) {
          // For our use cases, we want to override arrays instead of appending.
          // prev[key] = pVal.concat(...oVal);
          prev[key] = oVal;
        } else if (isObject(pVal) && isObject(oVal)) {
          prev[key] = this.mergeDeep(pVal, oVal);
        } else {
          prev[key] = oVal;
        }
      });

      return prev;
    }, {});
  }
}
