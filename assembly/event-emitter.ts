type Listener = (data: unknown) => void;

export enum Events {
  Change = 0,
  HandWinner = 1,
  CreateRecord = 2,
  Shuffle = 3,
  ResetState = 4,
}

export default class EventEmitter {
  static disableEvents: boolean;

  events: Map<Events, Listener[]>;

  constructor() {
    this.events = new Map();
  }

  on(event: Events, listener: Listener): void {
    if (EventEmitter.disableEvents) {
      return;
    }

    if (typeof this.events.get(event) !== 'object') {
      this.events.set(event, []);
    }

    const events = this.events.get(event);
    if (!events) {
      return;
    }

    events.push(listener);
  }

  removeListener(event: Events, listener: Listener): void {
    if (EventEmitter.disableEvents) {
      return;
    }

    const events = this.events.get(event);
    if (typeof events !== 'object') {
      return;
    }

    // TODO: Fix this. It's probably broken.
    const index = events.indexOf(listener);
    if (index === -1) {
      return;
    }

    events.splice(index, 1);
  }

  emit<T>(event: Events, data: T): void {
    if (EventEmitter.disableEvents) {
      return;
    }

    const events = this.events.get(event);
    if (!events) {
      return;
    }

    const listeners = events.slice(0);

    for (let i = 0; i < listeners.length; i += 1) {
      listeners[i].call(this, data);
    }
  }
}
