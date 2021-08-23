import EventEmitter, { Events } from './event-emitter';
import Utils from './utils';
import Shoe, { OutOfCardsError } from './shoe';
import Dealer from './dealer';
import Player from './player';
import BasicStrategyChecker from './basic-strategy-checker';
import HiLoDeviationChecker from './hi-lo-deviation-checker';
import Hand from './hand';
import { flip, value, showingFace, hiLoValue, attributes, Card } from './card';
import {
  Move,
  DeepPartial,
  SimpleObject,
  TableRules,
  GameStep,
  HandWinner,
  PlayerStrategy,
  BlackjackPayout,
  GameMode,
} from './types';

export type GameSettings = {
  autoDeclineInsurance: boolean;
  disableEvents: boolean;
  checkDeviations: boolean;
  checkTopNDeviations: number;
  mode: GameMode;
  debug: boolean;
  playerBankroll: number;
  playerTablePosition: number;
  playerStrategyOverride: {
    [index: number]: PlayerStrategy;
  };

  element?: string;
} & TableRules;

type GameState = {
  playCorrection: string;
  step: GameStep;
  sessionMovesTotal: number;
  sessionMovesCorrect: number;
  focusedHandIndex: number;
};

const MINIMUM_BET = 10 * 100;

export const SETTINGS_DEFAULTS: GameSettings = {
  autoDeclineInsurance: false,
  disableEvents: false,
  checkDeviations: false,
  checkTopNDeviations: 18,

  // Can be one of 'GameMode.Default', 'GameMode.Pairs', 'GameMode.Uncommon',
  // 'GameMode.Illustrious18'. If the mode is set to 'GameMode.Illustrious18',
  // `checkDeviations` will be forced to true.
  mode: GameMode.Default,
  debug: false,

  playerBankroll: MINIMUM_BET * 1000 * 1000,
  playerTablePosition: 1,
  playerStrategyOverride: {},

  // Table rules
  allowDoubleAfterSplit: true,
  allowLateSurrender: false,
  allowResplitAces: false,
  blackjackPayout: BlackjackPayout.ThreeToTwo,
  deckCount: 2,
  hitSoft17: true,
  maxHandsAllowed: 4,
  maximumBet: MINIMUM_BET * 100,
  minimumBet: MINIMUM_BET,
  playerCount: 1,
  penetration: 0.75,
};

export default class Game extends EventEmitter {
  _state!: GameState;
  betAmount!: number;
  spotCount!: number;
  dealer!: Dealer;
  gameId!: string;
  player!: Player;
  players!: Player[];
  playersLeft!: Player[];
  playersRight!: Player[];
  settings: GameSettings;
  shoe!: Shoe;
  state!: GameState;

  constructor(settings: DeepPartial<GameSettings> = SETTINGS_DEFAULTS) {
    super();

    this.settings = Utils.mergeDeep(SETTINGS_DEFAULTS, settings);
    this.betAmount = this.settings.minimumBet;
    this.spotCount = 1;

    if (this.settings.disableEvents) {
      EventEmitter.disableEvents = true;
    }

    this.setupState();
  }

  get focusedHand(): Hand {
    return this.player.getHand(this.state.focusedHandIndex);
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  setupState(): void {
    // We assign a random ID to each game so that we can link hand results with
    // wrong moves in the database.
    this.gameId = Utils.randomId();

    this.shoe = this.chainEmitChange(new Shoe({ settings: this.settings }));
    this.dealer = this.chainEmitChange(
      new Dealer({
        handsMax: this.settings.maxHandsAllowed,
        debug: this.settings.debug,
        strategy: PlayerStrategy.Dealer,
      })
    );

    this.players = Array.from(
      { length: this.settings.playerCount },
      (_item, index) =>
        this.chainEmitChange(
          new Player({
            handsMax: this.settings.maxHandsAllowed,
            balance: this.settings.playerBankroll,
            blackjackPayout: this.settings.blackjackPayout,
            debug: this.settings.debug,
            // TODO: Make this configurable for each player.
            strategy:
              this.settings.playerStrategyOverride[index + 1] ??
              (index === this.settings.playerTablePosition - 1
                ? PlayerStrategy.UserInput
                : PlayerStrategy.BasicStrategy),
          })
        )
    );

    // We reverse the players array for convenience since reverse iteration in
    // JS is difficult.
    this.players.reverse();

    const reversedTablePosition =
      this.players.length - this.settings.playerTablePosition + 1;

    this.player = this.players[reversedTablePosition - 1];
    this.playersLeft = this.players.slice(reversedTablePosition);
    this.playersRight = this.players.slice(0, reversedTablePosition - 1);

    this.player.on(Events.HandWinner, (hand, winner) => {
      this.emit(Events.CreateRecord, 'hand-result', {
        createdAt: Date.now(),
        gameId: this.gameId,
        dealerHand: this.dealer.firstHand.serialize({ showHidden: true }),
        playerHand: hand.serialize(),
        winner,
      });
    });

    this._state = {
      focusedHandIndex: 0,
      playCorrection: '',
      sessionMovesCorrect: 0,
      sessionMovesTotal: 0,
      step: GameStep.Start,
    };

    const hasKey = <T extends SimpleObject>(
      obj: T,
      k: string | number | symbol
    ): k is keyof T => k in obj;

    this.state = this.settings.disableEvents
      ? this._state
      : new Proxy(this._state, {
          set: (target, key, value) => {
            if (hasKey(target, key)) {
              // TODO: Fix this TypeScript issue.
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore Type 'any' is not assignable to type 'never'.
              target[key] = value;
            }

            if (typeof value === 'object' && value.attributes) {
              this.emit(Events.Change, key, value.attributes());
            } else {
              this.emit(Events.Change, key, value);
            }

            return true;
          },
        });
  }

  resetState(): void {
    this.setupState();
    this.emit(Events.ResetState);
  }

  allPlayerHandsFinished(): boolean {
    return this.players.every((player) =>
      player.hands.every((hand) => hand.finished)
    );
  }

  chainEmitChange<T extends EventEmitter>(object: T): T {
    object.on(Events.Change, (name: string, value: SimpleObject) =>
      this.emit(Events.Change, name, value)
    );
    return object;
  }

  validateInput(input: Move, hand: Hand): void {
    const checkerResult =
      HiLoDeviationChecker.check(this, hand, input) ||
      BasicStrategyChecker.check(this, hand, input);

    if (typeof checkerResult === 'object' && checkerResult.hint) {
      this.state.playCorrection = checkerResult.hint;
    } else {
      this.state.sessionMovesCorrect += 1;
    }

    this.state.sessionMovesTotal += 1;

    this.emit(Events.CreateRecord, 'move', {
      createdAt: Date.now(),
      gameId: this.gameId,
      dealerHand: this.dealer.firstHand.serialize({ showHidden: true }),
      playerHand: this.focusedHand.serialize(),
      move: input,
      correction: typeof checkerResult === 'object' ? checkerResult.code : null,
    });
  }

  isValidPlayHandsInput(input: Move | undefined): input is Move {
    if (this.player.isNPC) {
      return true;
    }

    if (
      !input ||
      ![Move.Hit, Move.Stand, Move.Double, Move.Split, Move.Surrender].includes(
        input
      )
    ) {
      return false;
    }

    if (
      input === Move.Surrender &&
      (!this.settings.allowLateSurrender || !this.focusedHand.firstMove)
    ) {
      return false;
    }

    if (
      input === Move.Split &&
      (!this.focusedHand.hasPairs || !this.focusedHand.firstMove)
    ) {
      return false;
    }

    if (input === Move.Double && !this.focusedHand.firstMove) {
      return false;
    }

    return true;
  }

  isValidInsuranceInput(input: Move | undefined): input is Move {
    if (this.player.isNPC) {
      return true;
    }

    return !!input && [Move.AskInsurance, Move.NoInsurance].includes(input);
  }

  step(input?: Move): GameStep {
    let step: GameStep = this.state.step;

    try {
      switch (step) {
        case GameStep.Start:
          step = this.dealInitialCards();
          break;

        case GameStep.WaitingForInsuranceInput:
          if (!this.isValidInsuranceInput(input)) {
            break;
          }

          this.askInsurance(input, this.player, ...this.playersLeft);
          this.payoutInsurance(input);
          step = GameStep.PlayHandsRight;
          break;

        case GameStep.PlayHandsRight:
          this.playNPCHands(...this.playersRight);
          step = this.setblackjackWinner(this.player, this.focusedHand)
            ? GameStep.PlayHandsLeft
            : GameStep.WaitingForPlayInput;
          break;

        case GameStep.WaitingForPlayInput:
          if (!this.isValidPlayHandsInput(input)) {
            break;
          }

          if (this.player.isUser) {
            step = this.playUserHands(input);
          } else {
            this.playNPCHands(this.player);
            step = GameStep.PlayHandsLeft;
          }

          break;

        case GameStep.PlayHandsLeft:
          this.playNPCHands(...this.playersLeft);
          this.playDealer();
          step = GameStep.WaitingForNewGameInput;
          break;

        case GameStep.WaitingForNewGameInput:
          if (this.player.isUser && !input) {
            break;
          }
          this.removeCards();
          step = GameStep.Start;
      }
    } catch (error) {
      if (error instanceof OutOfCardsError) {
        this.pushAllPlayersHands();
        step = GameStep.WaitingForNewGameInput;
      } else {
        throw error;
      }
    }

    this.state.step = step;

    return step;
  }

  run(betAmount: number, spotCount: number): void {
    this.betAmount = betAmount;
    this.spotCount = spotCount;

    let nextStep: GameStep = this.state.step;

    do {
      nextStep = this.step();
    } while (nextStep !== GameStep.Start);
  }

  dealInitialCards(): GameStep {
    if (this.settings.debug) {
      console.log(`> Starting new hand (player ID ${this.player.id})`);
      console.log('Shoe:', this.shoe.serialize());
    }

    for (const player of this.players) {
      // Clears the result from the previous iteration. Otherwise this object
      // will grow indefinitely over subsequent `step()` calls.
      player.handWinner = new Map();

      for (
        let i = 0;
        i < (player === this.player ? this.spotCount : 1);
        i += 1
      ) {
        // TODO: Make NPCs bet more realistically than minimum bet.
        const hand = player.addHand(
          player === this.player ? this.betAmount : this.settings.minimumBet
        );

        // Draw card for each player face up (upcard).
        player.takeCard(this.shoe.drawCard(), { hand });
      }
    }

    // Draw card for dealer face up.
    this.dealer.addHand();
    this.dealer.takeCard(this.shoe.drawCard());

    // Draw card for each player face up again (upcard).
    for (const player of this.players) {
      player.eachHand((hand) => {
        player.takeCard(this.shoe.drawCard(), { hand });
      });
    }

    // Draw card for dealer face down (hole card).
    this.dealer.takeCard(this.shoe.drawCard({ showingFace: false }), {
      prepend: true,
    });

    // Dealer peeks at the hole card if the upcard is 10 to check blackjack.
    if (
      value(this.dealer.upcard) === 10 &&
      value(this.dealer.holeCard) === 11
    ) {
      this.flipCard(this.dealer.cards[0]);

      for (const player of this.players) {
        player.eachHand((hand) => {
          player.setHandWinner({ winner: HandWinner.Dealer, hand });
        });
      }

      return GameStep.WaitingForNewGameInput;
    }

    // Dealer peeks at the hole card if the upcard is ace to ask insurance.
    if (value(this.dealer.upcard) === 11) {
      this.askInsurance(null, ...this.playersRight);

      if (!this.settings.autoDeclineInsurance) {
        return GameStep.WaitingForInsuranceInput;
      }
    }

    return GameStep.PlayHandsRight;
  }

  flipCard(card: Card): void {
    flip(this.dealer.cards[0]);

    this.dealer.firstHand.incrementTotalsForCard(this.dealer.cards[0]);
    this.shoe.hiLoRunningCount +=
      (showingFace(this.dealer.cards[0]) ? 1 : -1) *
      hiLoValue(this.dealer.cards[0]);

    this.emit(Events.Change, 'card', attributes(card));
  }

  askInsurance(userInput: Move | null | undefined, ...players: Player[]): void {
    for (const player of players) {
      player.eachHand((hand) => {
        const input =
          player.isUser && userInput
            ? userInput
            : player.getNPCInput(this, hand);

        // TODO: Make insurance amount configurable. Currently uses half the bet
        // size as insurance to recover full bet amount.
        const amount =
          player === this.player ? this.betAmount : this.settings.minimumBet;

        if (input === Move.AskInsurance) {
          player.useChips(amount / 2, { hand });
        }
      });
    }
  }

  payoutInsurance(userInput: Move | undefined): void {
    if (value(this.dealer.holeCard) !== 10) {
      return;
    }

    for (const player of this.players) {
      player.eachHand((hand) => {
        player.setHandWinner({ winner: HandWinner.Dealer, hand });

        // TODO: Store this in state so we don't have to check it again.
        const input = player.isUser
          ? userInput
          : player.getNPCInput(this, hand);

        if (input === Move.AskInsurance) {
          // TODO: Make insurance amount configurable. Currently uses half the
          // bet size as insurance to recover full bet amount.
          player.addChips(
            player === this.player ? this.betAmount : this.settings.minimumBet
          );
        }
      });
    }
  }

  setblackjackWinner(player: Player, hand: Hand): boolean {
    if (this.dealer.blackjack && hand.blackjack) {
      player.setHandWinner({ winner: HandWinner.Push, hand });
      return true;
    } else if (this.dealer.blackjack) {
      player.setHandWinner({ winner: HandWinner.Dealer, hand });
      return true;
    } else if (hand.blackjack) {
      player.setHandWinner({ winner: HandWinner.Player, hand });
      return true;
    }

    return false;
  }

  stepHand(
    player: Player,
    hand: Hand,
    betAmount: number,
    input: Move
  ): boolean {
    if (this.setblackjackWinner(player, hand)) {
      return true;
    }

    if (hand.cardTotal < 21) {
      if (!player.isNPC) {
        this.validateInput(input, hand);
      }

      if (input === Move.Hit) {
        player.takeCard(this.shoe.drawCard(), { hand });
      }

      if (input === Move.Stand) {
        return true;
      }

      if (input === Move.Double) {
        player.useChips(betAmount, { hand });
        player.takeCard(this.shoe.drawCard(), { hand });
      }

      if (
        input === Move.Split &&
        player.handsCount < this.settings.maxHandsAllowed &&
        (!hand.hasAces || this.settings.allowResplitAces)
      ) {
        const newHandCard = hand.removeCard();

        // In practice this will never happen since the hand will always have
        // a card at this point. It just makes TypeScript happy.
        if (!newHandCard) {
          return true;
        }

        const newHand = player.addHand(betAmount, [newHandCard]);

        newHand.fromSplit = true;
        hand.fromSplit = true;

        player.takeCard(this.shoe.drawCard(), { hand });
        player.takeCard(this.shoe.drawCard(), { hand: newHand });
      }

      if (input === Move.Surrender) {
        player.setHandWinner({
          winner: HandWinner.Dealer,
          hand,
          surrender: true,
        });

        return true;
      }
    }

    if (hand.busted) {
      if (this.settings.debug) {
        console.log(`Busted ${player.id} ${hand.cardTotal}`);
      }

      player.setHandWinner({ winner: HandWinner.Dealer, hand });

      return true;
    }

    if (input === Move.Double) {
      return true;
    }

    if (hand.cardTotal === 21) {
      return true;
    }

    return false;
  }

  playNPCHands(...players: Player[]): void {
    for (const player of players) {
      player.eachHand((hand) => {
        let handFinished = false;

        while (!handFinished) {
          handFinished = this.stepHand(
            player,
            hand,
            player === this.player ? this.betAmount : this.settings.minimumBet,
            player.getNPCInput(this, hand)
          );
        }
      });
    }
  }

  playUserHands(input: Move): GameStep {
    const handFinished = this.stepHand(
      this.player,
      this.focusedHand,
      this.betAmount,
      input
    );

    if (handFinished) {
      if (this.state.focusedHandIndex < this.player.handsCount - 1) {
        this.state.focusedHandIndex += 1;
      } else {
        return GameStep.PlayHandsLeft;
      }
    }

    return GameStep.WaitingForPlayInput;
  }

  playDealer(): void {
    this.flipCard(this.dealer.cards[0]);

    // Dealer draws cards until they reach 17. However, if all player hands have
    // busted, this step is skipped.
    // TODO: Move this into `getNPCInput()` for `PlayerStrategy.DEALER`.
    if (!this.allPlayerHandsFinished()) {
      while (this.dealer.cardTotal <= 17 && !this.dealer.blackjack) {
        if (
          this.dealer.cardTotal === 17 &&
          (this.dealer.isHard || !this.settings.hitSoft17)
        ) {
          break;
        }

        this.dealer.takeCard(this.shoe.drawCard());
      }
    }

    for (const player of this.players) {
      player.eachHand((hand) => {
        if (player.handWinner.get(hand.id)) {
          return;
        }

        if (this.dealer.busted) {
          player.setHandWinner({ winner: HandWinner.Player, hand });
        } else if (this.dealer.cardTotal > hand.cardTotal) {
          player.setHandWinner({ winner: HandWinner.Dealer, hand });
        } else if (hand.cardTotal > this.dealer.cardTotal) {
          player.setHandWinner({ winner: HandWinner.Player, hand });
        } else {
          player.setHandWinner({ winner: HandWinner.Push, hand });
        }
      });
    }
  }

  pushAllPlayersHands(): void {
    for (const player of this.players) {
      player.eachHand((hand) => {
        player.setHandWinner({ winner: HandWinner.Push, hand });
      });
    }
  }

  removeCards(): void {
    this.state.playCorrection = '';
    this.state.focusedHandIndex = 0;

    for (const player of this.players) {
      player.removeCards();
    }

    this.dealer.removeCards();

    if (this.shoe.needsReset) {
      if (this.settings.debug) {
        console.log('Cut card reached');
      }
      this.shoe.resetCards();
      this.emit(Events.Shuffle);
    }

    if (this.settings.debug) {
      console.log('End of hand', this.shoe.serialize());
      console.log();
    }
  }
}
