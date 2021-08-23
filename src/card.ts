import {
  Suit,
  Rank,
  cardRankToValue,
  suitToString,
  rankToString,
} from './types';

export type CardAttributes = {
  suit: string;
  rank: string;
  showingFace: boolean;
  id: number;
};

export type Card = Uint8Array;

function cardRankToHiLoValue(rank: Rank) {
  switch (rank) {
    case Rank.Ace:
    case Rank.King:
    case Rank.Queen:
    case Rank.Jack:
    case Rank.Ten:
      return -1;
    case Rank.Nine:
    case Rank.Eight:
    case Rank.Seven:
      return 0;
    case Rank.Six:
    case Rank.Five:
    case Rank.Four:
    case Rank.Three:
    case Rank.Two:
      return 1;
    default:
      throw new Error(`Unexpected rank ${rank}`);
  }
}

export function suit(card: Card): Suit {
  return card[0];
}

export function rank(card: Card): Rank {
  return card[1];
}

export function showingFace(card: Card): boolean {
  return card[2] === 1 ? true : false;
}

export function value(card: Card): number {
  return card[3];
}

export function id(card: Card): number {
  return card[4];
}

export function setShowingFace(card: Card, showingFace: boolean): void {
  card[2] = showingFace ? 1 : 0;
}

export function hiLoValue(card: Card): number {
  return cardRankToHiLoValue(rank(card));
}

export function attributes(card: Card): CardAttributes {
  return {
    suit: suitToString(suit(card)),
    rank: rankToString(rank(card)),
    showingFace: showingFace(card),
    id: id(card),
  };
}

export function flip(card: Card): void {
  card[2] = card[2] === 1 ? 0 : 1;
}

function createCardFactory(): (suit: Suit, rank: Rank) => Card {
  let id = -1;

  return function (suit: Suit, rank: Rank): Card {
    id += 1;

    return new Uint8Array([suit, rank, 1, cardRankToValue(rank), id]);
  };
}

export default createCardFactory();
