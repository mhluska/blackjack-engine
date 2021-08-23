import Utils from './utils';
import Game, { GameSettings } from './game';
import Hand from './hand';
import { Move, CheckResult, GameStep, GameMode } from './types';
import { value } from './card';

type Illustrious18Deviation = {
  insurance?: boolean;
  playerTotal: number;
  pair?: boolean;
  dealersCard: number;
  correctMove: Move;
  index: [string, number];
};

// prettier-ignore
// Referenced from the book `Blackjack Attack`.
// `index` refers to true count.
//
// TODO: Consider different deviations for deck counts and s17.
export const illustrious18Deviations: Illustrious18Deviation[] = [
  { playerTotal: 0,  dealersCard: 11, correctMove: Move.AskInsurance, index: ['>=', 3], insurance: true },
  { playerTotal: 16, dealersCard: 10, correctMove: Move.Stand,        index: ['>=', 0]                  },
  { playerTotal: 15, dealersCard: 10, correctMove: Move.Stand,        index: ['>=', 4]                  },
  { playerTotal: 20, dealersCard: 5,  correctMove: Move.Split,        index: ['>=', 5], pair: true      },
  { playerTotal: 20, dealersCard: 6,  correctMove: Move.Split,        index: ['>=', 4], pair: true      },
  { playerTotal: 10, dealersCard: 10, correctMove: Move.Double,       index: ['>=', 4]                  },
  { playerTotal: 12, dealersCard: 3,  correctMove: Move.Stand,        index: ['>=', 2]                  },
  { playerTotal: 12, dealersCard: 2,  correctMove: Move.Stand,        index: ['>=', 3]                  },
  { playerTotal: 11, dealersCard: 11, correctMove: Move.Hit,          index: ['<',  1]                  },
  { playerTotal: 9,  dealersCard: 2,  correctMove: Move.Hit,          index: ['<',  1]                  },
  { playerTotal: 10, dealersCard: 11, correctMove: Move.Double,       index: ['>=', 4]                  },
  { playerTotal: 9,  dealersCard: 7,  correctMove: Move.Double,       index: ['>=', 3]                  },
  { playerTotal: 16, dealersCard: 9,  correctMove: Move.Stand,        index: ['>=', 5]                  },
  { playerTotal: 13, dealersCard: 2,  correctMove: Move.Hit,          index: ['<', -1]                  },
  { playerTotal: 12, dealersCard: 4,  correctMove: Move.Hit,          index: ['<',  0]                  },
  { playerTotal: 12, dealersCard: 5,  correctMove: Move.Hit,          index: ['<', -2]                  },
  { playerTotal: 12, dealersCard: 6,  correctMove: Move.Hit,          index: ['<', -1]                  },
  { playerTotal: 13, dealersCard: 3,  correctMove: Move.Hit,          index: ['<', -2]                  },
];

export default class HiLoDeviationChecker {
  static _suggest(
    game: Game,
    hand: Hand
  ): {
    correctMove: Move | false;
    deviation?: Illustrious18Deviation;
  } {
    let deviationIndex;

    const trueCount = game.shoe.hiLoTrueCount;

    if (!game.dealer.upcard) {
      return { correctMove: false };
    }

    if (
      value(game.dealer.upcard) === 11 &&
      game.state.step === GameStep.WaitingForInsuranceInput
    ) {
      deviationIndex = illustrious18Deviations.findIndex(
        (d) => d.insurance && Utils.compareRange(trueCount, d.index)
      );
    } else {
      const playerTotal = hand.cardTotal;
      const dealersCard = value(game.dealer.upcard);

      deviationIndex = illustrious18Deviations.findIndex(
        (d, index) =>
          index < game.settings.checkTopNDeviations &&
          d.playerTotal === playerTotal &&
          d.dealersCard === dealersCard &&
          hand.hasPairs === !!d.pair &&
          hand.isHard &&
          Utils.compareRange(trueCount, d.index)
      );
    }

    if (deviationIndex === -1) {
      return { correctMove: false };
    }

    const deviation = illustrious18Deviations[deviationIndex];
    const correctMove = deviation.correctMove;

    if (correctMove === Move.Double && !hand.firstMove) {
      return { correctMove: false };
    }

    const allowSplit = this._allowSplit(hand, game.settings);
    if (correctMove === Move.Split && !allowSplit) {
      return { correctMove: false };
    }

    return { correctMove, deviation };
  }

  static suggest(game: Game, hand: Hand): Move | false {
    return this._suggest(game, hand).correctMove;
  }

  // Returns true if an Illustrious 18 deviation was followed correctly.
  // Returns false if a deviation was not present.
  // Returns an object with a `correctMove` code and a `hint` otherwise.
  static check(game: Game, hand: Hand, input: Move): CheckResult | boolean {
    if (
      !game.settings.checkDeviations &&
      game.settings.mode !== GameMode.Illustrious18
    ) {
      return false;
    }

    const { correctMove, deviation } = this._suggest(game, hand);

    if (!correctMove) {
      return true;
    }

    let hint;

    if (
      correctMove === (Move.AskInsurance as Move) &&
      input !== Move.AskInsurance
    ) {
      hint = 'buy insurance';
    }

    if (correctMove === Move.Hit && input !== Move.Hit) {
      hint = 'hit';
    }

    if (correctMove === Move.Stand && input !== Move.Stand) {
      hint = 'stand';
    }

    if (correctMove === Move.Double && input !== Move.Double) {
      hint = 'double';
    }

    if (correctMove === Move.Split && input !== Move.Split) {
      hint = 'split';
    }

    let hintMessage = `Illustrious 18 deviation: last play should have been ${hint}`;
    if (deviation) {
      hintMessage += ' for true counts ${deviation.index}';
    }

    return {
      code: correctMove,
      hint: hintMessage,
    };
  }

  // TODO: DRY with `BasicStrategyChecker` or move these `_allow*` functions
  // into `Hand`.
  static _allowSplit(hand: Hand, settings: GameSettings): boolean {
    return (
      hand.player.handsCount < settings.maxHandsAllowed &&
      (!hand.hasAces || settings.allowResplitAces)
    );
  }
}
