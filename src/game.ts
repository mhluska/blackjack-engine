import PlayerInputReader from 'player-input-reader';

import EventEmitter from './event-emitter';
import Utils from './utils';
import Shoe from './shoe';
import Dealer from './dealer';
import Player, { PlayerStrategy } from './player';
import DiscardTray from './discard-tray';
import BasicStrategyChecker from './basic-strategy-checker';
import HiLoDeviationChecker from './hi-lo-deviation-checker';
import Hand from './hand';
import {
  actions,
  DeepPartial,
  actionDataKeys,
  SimpleObject,
  actionDataKeyToAction,
  TableRules,
} from './types';

export type GameSettings = {
  animationDelay: number;
  disableEvents: boolean;
  autoDeclineInsurance: boolean;
  autoConfirmNewGame: boolean;
  checkDeviations: boolean;
  checkTopNDeviations: number;
  mode: 'default' | 'pairs' | 'uncommon' | 'illustrious18';
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
  step: 'waiting-for-move' | 'game-result' | 'ask-insurance';
  sessionMovesTotal: number;
  sessionMovesCorrect: number;
  focusedHand: Hand;
};

export const SETTINGS_DEFAULTS: GameSettings = {
  animationDelay: 200,
  disableEvents: false,
  autoDeclineInsurance: false,
  autoConfirmNewGame: false,
  checkDeviations: false,
  checkTopNDeviations: 18,

  // Can be one of 'default', 'pairs', 'uncommon', 'illustrious18'. If the mode
  // is set to 'illustrious18', `checkDeviations` will be forced to true.
  mode: 'default',
  debug: false,

  playerBankroll: 10000 * 100,
  playerTablePosition: 1,
  playerStrategyOverride: {},

  // Table rules
  allowDoubleAfterSplit: true,
  allowLateSurrender: false,
  blackjackPayout: '3:2',
  deckCount: 2,
  hitSoft17: true,
  maxHandsAllowed: 4,
  maximumBet: 1000 * 100,
  minimumBet: 10 * 100,
  playerCount: 1,
};

export default class Game extends EventEmitter {
  settings: GameSettings;

  playerInputReader: PlayerInputReader;
  players!: Player[];
  player!: Player;
  gameId!: string;
  dealer!: Dealer;
  shoe!: Shoe;
  _state!: GameState;
  state!: GameState;
  discardTray!: DiscardTray;

  constructor(
    settings: DeepPartial<GameSettings> = SETTINGS_DEFAULTS,
    playerInputReader?: PlayerInputReader
  ) {
    super();

    // TODO: Avoid using `as` here
    const InputReader = (playerInputReader ??
      PlayerInputReader) as typeof PlayerInputReader;

    this.playerInputReader = new InputReader(this);
    this.settings = Utils.mergeDeep(SETTINGS_DEFAULTS, settings);

    if (this.settings.disableEvents) {
      EventEmitter.disableEvents = true;
    }

    this._setupState();
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  resetState(): void {
    this._setupState();
    this.emit('resetState');
  }

  async run({ betAmount = this.settings.minimumBet } = {}): Promise<void> {
    if (this.settings.debug) {
      console.log(`> Starting new hand (player ID ${this.player.id})`);
      console.log('Shoe:', this.shoe.serialize());
    }

    this.players.forEach((player) => {
      // TODO: Make NPCs bet more realistically than minimum bet.
      player.addHand(
        player === this.player ? betAmount : this.settings.minimumBet
      );

      // Clears the result from the previous iteration. Otherwise this object
      // will grow indefinitely over subsequent `run()` calls.
      player.handWinner = new Map();
    });

    // Draw card for each player face up (upcard).
    this.players.forEach((player) => player.takeCard(this.shoe.drawCard()));

    this.dealer.addHand();

    // Draw card for dealer face up.
    this.dealer.takeCard(this.shoe.drawCard());

    // Draw card for each player face up again (upcard).
    this.players.forEach((player) => player.takeCard(this.shoe.drawCard()));

    // Draw card for dealer face down (hole card).
    this.dealer.takeCard(this.shoe.drawCard({ showingFace: false }), {
      prepend: true,
    });

    // This will never happen since we take a visible card on the previous line
    // but we have to make TypeScript happy.
    if (!this.dealer.upcard || !this.dealer.holeCard) {
      return;
    }

    // Dealer peeks at the hole card if the upcard is 10 to check blackjack.
    if (this.dealer.upcard.value === 10 && this.dealer.holeCard.value === 11) {
      this.players.forEach((player) =>
        player.setHandWinner({ winner: 'dealer' })
      );
    }

    // Dealer peeks at the hole card if the upcard is ace to ask insurance.
    if (this.dealer.upcard.value === 11) {
      for (const player of this.players) {
        await this._handleInsurance(
          player,
          player === this.player ? betAmount : this.settings.minimumBet
        );
      }
    }

    for (const player of this.players) {
      await this._playHands(
        player,
        // TODO: Make NPCs bet more realistically than minimum bet.
        player === this.player ? betAmount : this.settings.minimumBet
      );
    }

    this.dealer.cards[0].flip();
    this.dealer.hands[0].incrementTotalsForCard(this.dealer.cards[0]);

    // Dealer draws cards until they reach 17. However, if all player hands have
    // busted, this step is skipped.
    // TODO: Move this into `getNPCInput()` for `PlayerStrategy.DEALER`.
    if (!this._allPlayerHandsFinished()) {
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

    this.players.forEach((player) => this._setHandResults(player));

    this.state.step = 'game-result';

    if (!this.settings.autoConfirmNewGame) {
      await this._getPlayerNewGameInput();
    }

    this.state.playCorrection = '';

    this.players.forEach((player) =>
      this.discardTray.addCards(player.removeCards())
    );

    this.discardTray.addCards(this.dealer.removeCards());

    if (this.shoe.needsReset) {
      if (this.settings.debug) {
        console.log('Cut card reached');
      }
      this.shoe.addCards(
        this.discardTray.removeCards().concat(this.shoe.removeCards())
      );
      this.shoe.shuffle();
      this.emit('shuffle');
    }

    if (this.settings.debug) {
      console.log('End of hand', this.shoe.serialize());
      console.log();
    }
  }

  async _handleInsurance(player: Player, betAmount: number): Promise<void> {
    let input: actions | void | boolean;

    this.state.step = 'ask-insurance';

    for (const hand of player.hands) {
      if (player.isNPC) {
        input = player.getNPCInput(this, hand);
      } else {
        if (this.settings.autoDeclineInsurance) {
          input = 'no-insurance';
        } else {
          while (typeof input !== 'string' || !input?.includes('insurance')) {
            input = await this._getPlayerInsuranceInput();
          }

          this._validateInput(input, hand);
        }
      }

      if (this.dealer.holeCard?.value !== 10) {
        continue;
      }

      player.setHandWinner({ winner: 'dealer', hand });

      // TODO: Make insurance amount configurable. Currently uses half the
      // bet size as insurance to recover full bet amount.
      if (input === 'ask-insurance') {
        player.addChips(betAmount);
      }
    }
  }

  _chainEmitChange<T extends EventEmitter>(object: T): T {
    object.on('change', (name: string, value: SimpleObject) =>
      this.emit('change', name, value)
    );
    return object;
  }

  _setupState(): void {
    // We assign a random ID to each game so that we can link hand results with
    // wrong moves in the database.
    this.gameId = Utils.randomId();

    this.shoe = this._chainEmitChange(
      new Shoe({ game: this, debug: this.settings.debug })
    );
    this.discardTray = this._chainEmitChange(new DiscardTray());
    this.dealer = this._chainEmitChange(
      new Dealer({
        debug: this.settings.debug,
        strategy: PlayerStrategy.DEALER,
      })
    );
    this.players = Array.from(
      { length: this.settings.playerCount },
      (_item, index) =>
        this._chainEmitChange(
          new Player({
            balance: this.settings.playerBankroll,
            blackjackPayout: this.settings.blackjackPayout,
            debug: this.settings.debug,
            // TODO: Make this configurable for each player.
            strategy:
              this.settings.playerStrategyOverride[index + 1] ??
              (index === this.settings.playerTablePosition - 1
                ? PlayerStrategy.USER_INPUT
                : PlayerStrategy.BASIC_STRATEGY),
          })
        )
    );

    this.player = this.players[this.settings.playerTablePosition - 1];

    this.player.on('hand-winner', (hand, winner) => {
      this.emit('create-record', 'hand-result', {
        createdAt: Date.now(),
        gameId: this.gameId,
        dealerHand: this.dealer.hands[0].serialize({ showHidden: true }),
        playerHand: hand.serialize(),
        winner,
      });
    });

    this._state = {
      step: 'waiting-for-move',
      focusedHand: this.player.hands[0],
      playCorrection: '',
      sessionMovesTotal: 0,
      sessionMovesCorrect: 0,
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
              this.emit('change', key, value.attributes());
            } else {
              this.emit('change', key, value);
            }

            return true;
          },
        });
  }

  _getPlayerMoveInput(): Promise<void | actions> {
    if (this.settings.debug) {
      console.log('Getting player move input');
    }

    const inputHandler = (str: actionDataKeys) => actionDataKeyToAction(str);

    return this.playerInputReader.readInput({
      keypress: inputHandler,
      click: inputHandler,
    });
  }

  _getPlayerNewGameInput(): Promise<void | actions> {
    if (this.settings.debug) {
      console.log('Getting player new game input');
    }

    return this.playerInputReader.readInput({
      keypress: () => 'next-game',
      click: (str: actionDataKeys) => {
        if (str.toLowerCase() === 'd') {
          return 'next-game';
        }
      },
    });
  }

  _getPlayerInsuranceInput(): Promise<void | actions> {
    if (this.settings.debug) {
      console.log('Getting player insurance input');
    }

    const inputHandler = (str: actionDataKeys): actions =>
      actionDataKeyToAction(str);

    return this.playerInputReader.readInput({
      keypress: inputHandler,
      click: inputHandler,
    });
  }

  _allPlayerHandsFinished(): boolean {
    return this.players.every((player) =>
      player.hands.every((hand) => hand.finished)
    );
  }

  _validateInput(input: actions, hand: Hand): void {
    const checkerResult =
      HiLoDeviationChecker.check(this, hand, input) ||
      BasicStrategyChecker.check(this, hand, input);

    if (typeof checkerResult === 'object' && checkerResult.hint) {
      this.state.playCorrection = checkerResult.hint;
    } else {
      this.state.sessionMovesCorrect += 1;
    }

    this.state.sessionMovesTotal += 1;

    this.emit('create-record', 'move', {
      createdAt: Date.now(),
      gameId: this.gameId,
      dealerHand: this.dealer.hands[0].serialize({ showHidden: true }),
      playerHand: this.state.focusedHand.serialize(),
      move: input,
      correction: typeof checkerResult === 'object' ? checkerResult.code : null,
    });
  }

  async _playHands(player: Player, betAmount: number): Promise<void> {
    for (const hand of player.hands) {
      if (player.handWinner.get(hand.id)) {
        continue;
      }

      await this._playHand(player, hand, betAmount);
    }
  }

  async _playHand(
    player: Player,
    hand: Hand,
    betAmount: number
  ): Promise<void> {
    if (player === this.player) {
      this.state.focusedHand = hand;
    }

    if (this.dealer.blackjack && hand.blackjack) {
      return player.setHandWinner({ winner: 'push', hand });
    } else if (this.dealer.blackjack) {
      return player.setHandWinner({ winner: 'dealer', hand });
    } else if (hand.blackjack) {
      return player.setHandWinner({ winner: 'player', hand });
    }

    let input;

    while (hand.cardTotal < 21) {
      this.state.step = 'waiting-for-move';

      input = player.isNPC
        ? player.getNPCInput(this, hand)
        : await this._getPlayerMoveInput();

      // TODO: Skip this validation logic for NPC?
      if (!input) {
        continue;
      }

      if (
        input === 'surrender' &&
        (!this.settings.allowLateSurrender || !hand.firstMove)
      ) {
        continue;
      }

      if (input === 'split' && (!hand.hasPairs || !hand.firstMove)) {
        continue;
      }

      if (input === 'double' && !hand.firstMove) {
        continue;
      }

      if (!player.isNPC) {
        this._validateInput(input, hand);
      }

      if (input === 'stand') {
        break;
      }

      if (input === 'hit') {
        player.takeCard(this.shoe.drawCard(), { hand });
      }

      if (input === 'double') {
        player.useChips(betAmount, { hand });
        player.takeCard(this.shoe.drawCard(), { hand });
        break;
      }

      if (
        input === 'split' &&
        player.hands.length < this.settings.maxHandsAllowed
      ) {
        const newHandCard = hand.removeCard();

        // In practice this will never happen since the hand will always have
        // a card at this point. It just makes TypeScript happy.
        if (!newHandCard) {
          continue;
        }

        const newHand = player.addHand(betAmount, [newHandCard]);

        newHand.fromSplit = true;
        hand.fromSplit = true;

        player.takeCard(this.shoe.drawCard(), { hand });
        player.takeCard(this.shoe.drawCard(), { hand: newHand });
      }

      if (input === 'surrender') {
        return player.setHandWinner({
          winner: 'dealer',
          hand,
          surrender: true,
        });
      }
    }

    if (hand.busted) {
      if (this.settings.debug) {
        console.log(`Busted ${player.id} ${hand.cardTotal}`);
      }

      return player.setHandWinner({ winner: 'dealer', hand });
    }
  }

  _setHandResults(player: Player): void {
    for (const hand of player.hands) {
      if (player.handWinner.get(hand.id)) {
        continue;
      }

      if (this.dealer.busted) {
        player.setHandWinner({ winner: 'player', hand });
      } else if (this.dealer.cardTotal > hand.cardTotal) {
        player.setHandWinner({ winner: 'dealer', hand });
      } else if (hand.cardTotal > this.dealer.cardTotal) {
        player.setHandWinner({ winner: 'player', hand });
      } else {
        player.setHandWinner({ winner: 'push', hand });
      }
    }
  }
}
