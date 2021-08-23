import Utils from './utils';
import Game, { GameSettings } from './game';
import Hand from './hand';
import { value } from './card';
import { selectCharts } from './charts/utils';
import {
  ChartType,
  CheckResult,
  Move,
  ChartMove,
  UncommonChart,
  chartMoveToCorrectMove,
  GameStep,
} from './types';

function chartMinMax(chartType: ChartType) {
  switch (chartType) {
    case ChartType.Hard:
      return [7, 18];
    case ChartType.Soft:
      return [13, 20];
    case ChartType.Splits:
      return [2, 11];
  }
}

export default class BasicStrategyChecker {
  static uncommonHands(settings: GameSettings): UncommonChart {
    return selectCharts(settings).uncommon;
  }

  static suggest(game: Game, hand: Hand): Move {
    if (game.state.step === GameStep.WaitingForInsuranceInput) {
      return Move.NoInsurance;
    }

    const allowSplit = this._allowSplit(hand, game.settings);

    const { chart: chartGroup } = selectCharts(game.settings);
    const chartType = this._chartType(hand, allowSplit);
    const [chartMin, chartMax] = chartMinMax(chartType);

    const playerTotal = Utils.clamp(
      hand.hasPairs && allowSplit ? value(hand.cards[0]) : hand.cardTotal,
      chartMin,
      chartMax
    );

    const chart = chartGroup.get(chartType);
    if (!chart) {
      throw new Error('Subchart not found');
    }

    const dealerHints = chart[playerTotal - chartMin];
    const dealersCard = value(game.dealer.upcard);
    const correctMove = dealerHints[dealersCard - 2];

    if (
      correctMove === ChartMove.DoubleOrHit ||
      correctMove === ChartMove.DoubleOrStand
    ) {
      const allowDouble = hand.firstMove;
      if (allowDouble) {
        return Move.Double;
      } else {
        return correctMove === ChartMove.DoubleOrHit ? Move.Hit : Move.Stand;
      }
    }

    if (
      correctMove === ChartMove.SplitOrHit ||
      correctMove === ChartMove.SplitOrDouble ||
      correctMove === ChartMove.SplitOrStand
    ) {
      if (game.settings.allowDoubleAfterSplit) {
        return Move.Split;
      } else {
        switch (correctMove) {
          case ChartMove.SplitOrHit:
            return Move.Hit;
          case ChartMove.SplitOrDouble:
            return Move.Double;
          case ChartMove.SplitOrStand:
            return Move.Stand;
        }
      }
    }

    const allowSurrender = this._allowSurrender(hand, game.settings);

    if (correctMove === ChartMove.SurrenderOrSplit) {
      return allowSurrender && !game.settings.allowDoubleAfterSplit
        ? Move.Surrender
        : Move.Split;
    }

    if (
      correctMove === ChartMove.SurrenderOrHit ||
      correctMove === ChartMove.SurrenderOrStand
    ) {
      if (allowSurrender) {
        return Move.Surrender;
      } else {
        return correctMove === ChartMove.SurrenderOrHit ? Move.Hit : Move.Stand;
      }
    }

    return chartMoveToCorrectMove(correctMove);
  }

  // Returns true if basic strategy was followed correctly.
  // Returns an object with a `correctMove` code and a `hint` otherwise.
  static check(game: Game, hand: Hand, input: Move): CheckResult | true {
    const correctMove = this.suggest(game, hand);
    if (!correctMove) {
      return true;
    }

    let hint;

    // TODO: Add rationale for each hint.
    if (correctMove === Move.NoInsurance && input !== Move.NoInsurance) {
      hint = 'decline insurance';
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

    if (correctMove === Move.Surrender && input !== Move.Surrender) {
      hint = 'surrender';
    }

    return hint ? this._makeHintResult(correctMove, hint) : true;
  }

  static _makeHintResult(code: CheckResult['code'], hint: string): CheckResult {
    return {
      code,
      hint: `Basic strategy: last play should have been ${hint}!`,
    };
  }

  static _allowSplit(hand: Hand, settings: GameSettings): boolean {
    return (
      hand.player.handsCount < settings.maxHandsAllowed &&
      (!hand.hasAces || settings.allowResplitAces)
    );
  }

  static _allowSurrender(hand: Hand, settings: GameSettings): boolean {
    return hand.firstMove && settings.allowLateSurrender;
  }

  static _chartType(hand: Hand, allowSplit: boolean): ChartType {
    if (hand.hasPairs && allowSplit) {
      return ChartType.Splits;
    } else if (hand.isSoft) {
      return ChartType.Soft;
    } else {
      return ChartType.Hard;
    }
  }
}
