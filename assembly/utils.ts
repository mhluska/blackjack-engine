class Range<T> {
  start: i32;
  end: i32;
  value: T;
}

export default class Utils {
  static arraySum(array: i32[]): i32 {
    return array.reduce((acc, current) => acc + current, 0);
  }

  // Fisher–Yates shuffle algorithm.
  // See https://stackoverflow.com/a/6274381/659910
  static arrayShuffle<R>(array: R[]): R[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }

    return array;
  }

  static arraySample<R>(array: R[]): R {
    return array[this.random(0, array.length - 1)];
  }

  static arrayMove<R>(array: R[], fromIndex: u32, toIndex: u32): void {
    const temp = array[toIndex];
    array[toIndex] = array[fromIndex];
    array[fromIndex] = temp;
  }

  static arrayflatten<R>(array: R[][]): R[] {
    return array.reduce((flatten: R[], arr: R[]) => [...flatten, ...arr], []);
  }

  static random(min: i32, max: i32): i32 {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomId(): string {
    // TODO: Make the backend generate this.
    // return crypto.randomBytes(16).toString('hex');
    return Math.random().toString(36).substring(2);
  }

  // TODO: No Regex in AssemblyScript. Do we need this? Can find a way without
  // Regex.
  // See https://stackoverflow.com/a/52584017/659910
  // static titleCase(str: string): string {
  //   return str
  //     .replace(/([A-Z])/g, (match) => ` ${match}`)
  //     .replace(/^./, (match) => match.toUpperCase())
  //     .trim();
  // }

  static clamp(i32: i32, min: i32, max: i32): i32 {
    return Math.max(Math.min(i32, max), min);
  }

  // See https://stackoverflow.com/a/43532829
  static round(value: f32, digits = 2): f32 {
    value = value * Math.pow(10, digits);
    value = Math.round(value);
    value = value / Math.pow(10, digits);

    return value;
  }

  // Range will be either `>= x` or `< x` for an integer `x`.
  static rangeBoundary(range: string): i32 {
    const value = range.split(' ').pop();
    return value ? parseInt(value) : 0;
  }

  static compareRange(value: i32, range: string): boolean {
    const boundary = this.rangeBoundary(range);
    return range.includes('>=') ? value >= boundary : value < boundary;
  }

  // See https://stackoverflow.com/a/40724354/659910
  static abbreviateNumber(value: i32): string {
    const SI_SYMBOL = ['', 'K', 'M', 'G', 'T', 'P', 'E'];

    // Determine SI symbol.
    const tier = (Math.log10(Math.abs(value)) / 3) | 0;

    if (tier === 0) {
      return value.toString();
    }

    const suffix = SI_SYMBOL[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = value / scale;
    const fixed = scaled.toFixed(1);

    return (fixed.includes('.0') ? scaled.toFixed(0) : fixed) + suffix;
  }

  static formatCents(
    cents: u32,
    stripZeroCents: boolean,
    stripCommas: boolean
  ): string {
    const value = cents.toString();

    // TODO: No Intl in AS.
    // const value = new Intl.NumberFormat('en-US', {
    //   style: 'currency',
    //   currency: 'USD',
    // }).format(cents / 100);

    // TODO: No Regex in AS.
    // if (stripCommas) {
    //   value = value.replace(/,/g, '');
    // }

    if (stripZeroCents && value.endsWith('.00')) {
      return value.slice(0, value.length - 3);
    } else {
      return value;
    }
  }

  static formatPercent(value: f32): string {
    return `${(value * 100).toFixed(2)}%`;
  }

  static formatTime(timeMs: u32): string {
    return `${(timeMs / 1000).toFixed(2)} seconds`;
  }

  // See https://stackoverflow.com/a/34749873/659910
  // static mergeDeep<T extends SimpleObject>(
  //   target: T,
  //   ...sources: DeepPartial<T>[]
  // ): T {
  //   const isObject = (
  //     item: DeepPartial<T> | undefined
  //   ): item is DeepPartial<T> =>
  //     !!item && typeof item === 'object' && !Array.isArray(item);

  //   const source = sources.shift();
  //   if (!source) {
  //     return target;
  //   }

  //   if (isObject(target) && isObject(source)) {
  //     for (const key in source) {
  //       const nextSource = source[key];
  //       if (isObject(nextSource)) {
  //         if (!target[key]) {
  //           Object.assign(target, { [key]: {} });
  //         }

  //         this.mergeDeep(target[key], nextSource);
  //       } else {
  //         Object.assign(target, { [key]: source[key] });
  //       }
  //     }
  //   }

  //   return this.mergeDeep(target, ...sources);
  // }

  static arrayToRanges<T>(array: T[]): Range<T>[] {
    const ranges: Range<T>[] = [];

    let rangeStart = 0;
    let rangeEnd = 0;
    let prevItem = array[0];

    const pushRange = () => {
      ranges.push({
        start: rangeStart,
        end: rangeEnd - 1,
        value: prevItem,
      });
    };

    array.forEach((item) => {
      if (item !== prevItem) {
        pushRange();
        rangeStart = rangeEnd;
        prevItem = item;
      }

      rangeEnd += 1;
    });

    pushRange();

    return ranges;
  }

  static rangeToString<T>(
    range: Range<T>,
    isOnly: boolean,
    isLast: boolean
  ): string {
    if (isOnly) {
      return `${range.start}+`;
    }

    const rangeString =
      range.start === range.end
        ? range.start.toString()
        : `${range.start}–${range.end}`;

    return `${rangeString}${isLast ? '+' : ''}`;
  }

  static arrayToRangeString<T>(
    array: T[],
    formatter = (value: T): T => value
  ): string {
    const ranges = Utils.arrayToRanges(array);

    return Utils.arrayToRanges(array)
      .map(
        (range, index) =>
          `TC ${Utils.rangeToString(
            range,
            ranges.length === 1,
            index === ranges.length - 1
          )}: ${formatter(range.value)}`
      )
      .join(', ');
  }

  // TODO: No Object.keys in AS.
  // static compact<T extends SimpleObject>(
  //   object: T
  // ): { [P in keyof T]: NonNullable<T[P]> } {
  //   Object.keys(object).forEach((key) => {
  //     if (object[key] === null || typeof object[key] === 'undefined') {
  //       delete object[key];
  //     }
  //   });

  //   return object;
  // }
}
