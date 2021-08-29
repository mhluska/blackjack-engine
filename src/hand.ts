import { settings } from './game';
import GameObject from './game-object';
import { Event } from './event-emitter';
import Utils from './utils';
import Player from './player';
import Card, { CardAttributes } from './card';
import { Rank, rankToString } from './types';

export type HandAttributes = {
  id: string;
  cards: CardAttributes[];
  hasPairs: boolean;
  cardTotal: number;
  blackjack: boolean;
  firstMove: boolean;
};

export default class Hand extends GameObject {
  static entity = 'hand';

  acesCount!: number;
  betAmount!: number;
  cardHighTotal!: number;
  cardLowTotal!: number;
  cards!: Card[];
  fromSplit!: boolean;
  id: string;
  player: Player;

  constructor(player: Player, cards: Card[] = []) {
    super();

    this.reset();

    this.id = Utils.randomId();
    this.player = player;

    for (const card of cards) {
      this.takeCard(card);
    }
  }

  reset(): void {
    this.acesCount = 0;
    this.betAmount = 0;
    this.cardHighTotal = 0;
    this.cardLowTotal = 0;
    this.cards = [];
    this.fromSplit = false;
  }

  takeCard(card: Card, { prepend = false } = {}): void {
    card.on(Event.Change, () => this.emitChange());

    if (prepend) {
      this.cards.unshift(card);
    } else {
      this.cards.push(card);
    }

    if (card.visible) {
      this.incrementTotalsForCard(card);
    }

    this.emitChange();
  }

  removeCard(): Card | void {
    const card = this.cards.pop();

    if (!card) {
      return;
    }

    this.decrementTotalsForCard(card);

    return card;
  }

  incrementTotalsForCard(card: Card): void {
    this.cardHighTotal += card.value;
    this.cardLowTotal += card.rank === Rank.Ace ? 1 : card.value;

    if (card.rank === Rank.Ace) {
      this.acesCount += 1;
    }
  }

  decrementTotalsForCard(card: Card): void {
    this.cardHighTotal -= card.value;
    this.cardLowTotal -= card.rank === Rank.Ace ? 1 : card.value;

    if (card.rank === Rank.Ace) {
      this.acesCount -= 1;
    }
  }

  // TODO: Remove change handler when removing cards.
  removeCards(): Card[] {
    const cards = this.cards;

    this.reset();
    this.emitChange();

    return cards;
  }

  serialize({ showHidden = false } = {}): string {
    return this.cards
      .map((card) =>
        card.visible || showHidden ? rankToString(card.rank) : '?'
      )
      .join(' ');
  }

  attributes(): HandAttributes {
    return {
      id: this.id,
      cards: this.cards.map((card) => card.attributes()),
      hasPairs: this.hasPairs,
      cardTotal: this.cardTotal,
      blackjack: this.blackjack,
      firstMove: this.firstMove,
    };
  }

  get allowSplit(): boolean {
    if (!this.hasPairs || this.player.handsCount >= settings.maxHandsAllowed) {
      return false;
    }

    if (!this.hasAces || !this.fromSplit) {
      return true;
    }

    return settings.allowResplitAces;
  }

  get allowSurrender(): boolean {
    return this.firstMove && settings.allowLateSurrender;
  }

  get allowDouble(): boolean {
    return this.firstMove;
  }

  get cardTotal(): number {
    return this.cardHighTotal > 21 ? this.cardLowTotal : this.cardHighTotal;
  }

  get firstMove(): boolean {
    return this.cards.length <= 2;
  }

  get busted(): boolean {
    return this.cardTotal > 21;
  }

  get blackjack(): boolean {
    return (
      this.cards.length === 2 && this.cardHighTotal === 21 && !this.fromSplit
    );
  }

  get finished(): boolean {
    return this.busted || this.blackjack;
  }

  get hasPairs(): boolean {
    return (
      this.cards.length === 2 && this.cards[0].value === this.cards[1].value
    );
  }

  // A hand is "soft" if there is an ace and the next card will not bust:
  // 1. there's at least one ace
  // 2. counting the aces as value 1, the total is <= 11
  get isSoft(): boolean {
    return this.acesCount > 0 && this.cardLowTotal <= 11;
  }

  get isHard(): boolean {
    return !this.isSoft;
  }

  get hasAces(): boolean {
    return (
      this.cards.length === 2 &&
      this.cards[0].rank === Rank.Ace &&
      this.cards[1].rank === Rank.Ace
    );
  }
}
