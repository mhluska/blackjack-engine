// The entry file of your WebAssembly module.

import './types';
import EventEmitter from './event-emitter';
import Utils from './utils';

console.log(Utils.formatCents(1000, false, false));

export function run(): void {}
