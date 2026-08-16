import "./styles.css";

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Color = "red" | "black";
type PileType = "stock" | "waste" | "foundation" | "tableau";
type DrawMode = 1 | 3;

interface Card {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

interface Location {
  type: PileType;
  index?: number;
}

interface MoveSnapshot {
  state: GameState;
  reason: string;
}

interface Hint {
  from?: Location;
  to?: Location;
  message: string;
}

interface Settings {
  drawMode: DrawMode;
  showTimer: boolean;
  sound: boolean;
  cardBack: "quilt" | "garden" | "classic";
}

interface Stats {
  played: number;
  won: number;
  lost: number;
  streak: number;
  longestStreak: number;
  bestTime: number | null;
}

interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  moves: number;
  elapsed: number;
  startedAt: number | null;
  isPaused: boolean;
  isWon: boolean;
  roundNumber: number;
  redealsUsed: number;
  initial: Omit<GameState, "initial" | "history"> | null;
  history: MoveSnapshot[];
}

const DIFFICULTY_CONFIG = {
  tiers: {
    firstThree: { throughRound: 3, solvableDealChance: 1, redealCap: 5 },
    nextThree: { throughRound: 6, solvableDealChance: 0.5, redealCap: 4 },
    plateau: { throughRound: Number.POSITIVE_INFINITY, solvableDealChance: 0, redealCap: 3 }
  }
} as const;

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const STORAGE_KEY = "grannies-solitare-state";
const SETTINGS_KEY = "grannies-solitare-settings";
const STATS_KEY = "grannies-solitare-stats";
const DIFFICULTY_PROGRESS_KEY = "grannies-solitare-difficulty-progress";
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("App root missing");
const root = app;

let settings: Settings = loadSettings();
let stats: Stats = loadStats();
let difficultyProgress = loadDifficultyProgress();
const savedGame = loadGame();
if (!savedGame) stats.played += 1;
let state: GameState = savedGame ?? createGame(difficultyProgress.completedRounds + 1);
let selected: { location: Location; count: number } | null = null;
let hint: Hint | null = null;
let keyboardFocus: Location = { type: "stock" };
let justWon = false;
let timerId = 0;
let audioContext: AudioContext | null = null;

function colorOf(suit: Suit): Color {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

function suitSymbol(suit: Suit): string {
  return { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[suit];
}

function rankLabel(rank: number): string {
  return rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank);
}

function cardName(card: Card): string {
  return `${rankLabel(card.rank)} of ${card.suit}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameLocation(a: Location, b: Location): boolean {
  return a.type === b.type && (a.index ?? -1) === (b.index ?? -1);
}

function topRowLocations(): Location[] {
  return [{ type: "stock" }, { type: "waste" }, ...Array.from({ length: 4 }, (_, index) => ({ type: "foundation" as const, index }))];
}

function tableauLocations(): Location[] {
  return Array.from({ length: 7 }, (_, index) => ({ type: "tableau" as const, index }));
}

function focusLocation(location: Location): void {
  keyboardFocus = location;
}

function focusIndex(location: Location): number {
  if (location.type === "stock") return 0;
  if (location.type === "waste") return 1;
  if (location.type === "foundation") return 2 + (location.index ?? 0);
  return location.index ?? 0;
}

function currentFocusedCards(): { location: Location; count: number } | null {
  if (keyboardFocus.type === "stock") return null;
  if (keyboardFocus.type === "waste") {
    return state.waste.length ? { location: keyboardFocus, count: 1 } : null;
  }
  if (keyboardFocus.type === "foundation") {
    return state.foundations[keyboardFocus.index ?? 0].length ? { location: keyboardFocus, count: 1 } : null;
  }

  const column = state.tableau[keyboardFocus.index ?? 0];
  const firstFaceUp = column.findIndex((card) => card.faceUp);
  if (firstFaceUp < 0) return null;
  return { location: keyboardFocus, count: column.length - firstFaceUp };
}

function moveKeyboardFocus(direction: "left" | "right" | "up" | "down"): void {
  const current = keyboardFocus;
  if (direction === "left" || direction === "right") {
    const row = current.type === "tableau" ? tableauLocations() : topRowLocations();
    const index = row.findIndex((location) => sameLocation(location, current));
    if (index < 0) return;
    const nextIndex = direction === "right" ? (index + 1) % row.length : (index - 1 + row.length) % row.length;
    keyboardFocus = row[nextIndex];
    render();
    return;
  }

  if (direction === "down") {
    if (current.type === "stock") keyboardFocus = { type: "tableau", index: 0 };
    else if (current.type === "waste") keyboardFocus = { type: "tableau", index: 1 };
    else if (current.type === "foundation") keyboardFocus = { type: "tableau", index: current.index ?? 0 };
    render();
    return;
  }

  if (direction === "up" && current.type === "tableau") {
    keyboardFocus = { type: "foundation", index: current.index ?? 0 };
    render();
  }
}

function randomUnit(): number {
  const values = new Uint32Array(1);
  if (!globalThis.crypto?.getRandomValues) throw new Error("Non-deterministic random source unavailable");
  globalThis.crypto.getRandomValues(values);
  return values[0] / 0x100000000;
}

function createDeck(): Card[] {
  const deck: Card[] = [];
  SUITS.forEach((suit) => {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        faceUp: false
      });
    }
  });
  return deck;
}

function randomIndex(length: number): number {
  return Math.floor(randomUnit() * length);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function difficultyConfigForRound(roundNumber: number) {
  if (roundNumber <= DIFFICULTY_CONFIG.tiers.firstThree.throughRound) return DIFFICULTY_CONFIG.tiers.firstThree;
  if (roundNumber <= DIFFICULTY_CONFIG.tiers.nextThree.throughRound) return DIFFICULTY_CONFIG.tiers.nextThree;
  return DIFFICULTY_CONFIG.tiers.plateau;
}

function randomColumnLengthGroups(): number[][] {
  const lengths = [1, 2, 3, 4, 5, 6, 7];

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const groups: number[][] = [[], [], [], []];
    let failed = false;

    for (const length of shuffle(lengths)) {
      const eligible = groups.filter((group) => group.reduce((sum, value) => sum + value, 0) + length <= 13);
      if (!eligible.length) {
        failed = true;
        break;
      }
      eligible[randomIndex(eligible.length)].push(length);
    }

    if (!failed && groups.every((group) => group.length > 0)) return groups;
  }

  return [[7, 6], [5, 4], [3, 2], [1]];
}

function createSolvableDeck(randomizedDeck: Card[]): Card[] {
  const cardById = new Map(randomizedDeck.map((card) => [card.id, card]));
  const suitOrder = shuffle(SUITS);
  const lengthGroups = randomColumnLengthGroups();
  const tableauColumns: Card[][] = Array.from({ length: 7 }, () => []);
  const tableauCountBySuit = new Map<Suit, number>();

  suitOrder.forEach((suit, suitIndex) => {
    let nextRank = 1;
    for (const length of lengthGroups[suitIndex]) {
      const segment = Array.from({ length }, (_, offset) => {
        const card = cardById.get(`${suit}-${nextRank + offset}`);
        if (!card) throw new Error("Solvable deal card missing");
        return card;
      });
      tableauColumns[length - 1] = segment.reverse();
      nextRank += length;
    }
    tableauCountBySuit.set(suit, nextRank - 1);
  });

  const stockDrawSequence: Card[] = [];
  const nextStockRank = new Map<Suit, number>(suitOrder.map((suit) => [suit, (tableauCountBySuit.get(suit) ?? 0) + 1]));
  while (suitOrder.some((suit) => (nextStockRank.get(suit) ?? 14) <= 13)) {
    const availableSuits = suitOrder.filter((suit) => (nextStockRank.get(suit) ?? 14) <= 13);
    const suit = availableSuits[randomIndex(availableSuits.length)];
    const rank = nextStockRank.get(suit) ?? 14;
    const card = cardById.get(`${suit}-${rank}`);
    if (!card) throw new Error("Solvable stock card missing");
    stockDrawSequence.push(card);
    nextStockRank.set(suit, rank + 1);
  }

  const stock =
    settings.drawMode === 3
      ? Array.from({ length: stockDrawSequence.length / 3 }, (_, index) => stockDrawSequence.slice(index * 3, index * 3 + 3))
          .reverse()
          .reduce<Card[]>((all, group) => all.concat(group), [])
      : stockDrawSequence.reverse();

  return tableauColumns.reduce<Card[]>((all, column) => all.concat(column), []).concat(stock);
}

function createGame(roundNumber: number): GameState {
  const roundConfig = difficultyConfigForRound(roundNumber);
  const randomizedDeck = shuffle(createDeck());
  const deck = randomUnit() < roundConfig.solvableDealChance ? createSolvableDeck(randomizedDeck) : randomizedDeck;
  const tableau: Card[][] = Array.from({ length: 7 }, () => []);

  for (let column = 0; column < 7; column += 1) {
    for (let row = 0; row <= column; row += 1) {
      const card = deck.shift();
      if (!card) throw new Error("Deck ended unexpectedly");
      card.faceUp = row === column;
      tableau[column].push(card);
    }
  }

  const base: GameState = {
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    elapsed: 0,
    startedAt: Date.now(),
    isPaused: false,
    isWon: false,
    roundNumber,
    redealsUsed: 0,
    initial: null,
    history: []
  };

  base.initial = snapshot(base);
  return base;
}

function snapshot(game: GameState): Omit<GameState, "initial" | "history"> {
  const { initial: _initial, history: _history, ...rest } = game;
  return clone(rest);
}

function restoreFromSnapshot(saved: Omit<GameState, "initial" | "history">, initial = saved): GameState {
  return { ...clone(saved), initial: clone(initial), history: [] };
}

function loadSettings(): Settings {
  const fallback: Settings = { drawMode: 1, showTimer: true, sound: false, cardBack: "quilt" };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function loadStats(): Stats {
  const fallback: Stats = { played: 0, won: 0, lost: 0, streak: 0, longestStreak: 0, bestTime: null };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function loadDifficultyProgress(): { completedRounds: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(DIFFICULTY_PROGRESS_KEY) ?? "{}") as { completedRounds?: number };
    return {
      completedRounds: Number.isInteger(saved.completedRounds) && (saved.completedRounds ?? 0) >= 0 ? saved.completedRounds ?? 0 : 0
    };
  } catch {
    return { completedRounds: 0 };
  }
}

function loadGame(): GameState | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as GameState | null;
    if (!saved || saved.isWon || !Number.isInteger(saved.roundNumber) || !Number.isInteger(saved.redealsUsed)) return null;
    return { ...saved, startedAt: saved.isPaused ? null : Date.now(), history: saved.history ?? [] };
  } catch {
    return null;
  }
}

function saveAll(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  localStorage.setItem(DIFFICULTY_PROGRESS_KEY, JSON.stringify(difficultyProgress));
}

function foundationIndexFor(suit: Suit): number {
  return SUITS.indexOf(suit);
}

function pileAt(location: Location): Card[] {
  if (location.type === "stock") return state.stock;
  if (location.type === "waste") return state.waste;
  if (location.type === "foundation") return state.foundations[location.index ?? 0];
  return state.tableau[location.index ?? 0];
}

function lastCard(cards: Card[]): Card | undefined {
  return cards[cards.length - 1];
}

function topCard(location: Location): Card | undefined {
  return lastCard(pileAt(location));
}

function canPlaceOnFoundation(card: Card, foundation: Card[]): boolean {
  const top = lastCard(foundation);
  return card.faceUp && (!top ? card.rank === 1 : top.suit === card.suit && card.rank === top.rank + 1);
}

function canPlaceOnTableau(card: Card, tableau: Card[]): boolean {
  const top = lastCard(tableau);
  return card.faceUp && (!top || (top.faceUp && colorOf(top.suit) !== colorOf(card.suit) && card.rank === top.rank - 1));
}

function canMoveSequence(cards: Card[]): boolean {
  if (!cards.length || cards.some((card) => !card.faceUp)) return false;
  return cards.every((card, index) => {
    if (index === 0) return true;
    const previous = cards[index - 1];
    return colorOf(previous.suit) !== colorOf(card.suit) && previous.rank === card.rank + 1;
  });
}

function canMoveFrom(location: Location, cards: Card[]): boolean {
  if (!cards.length || location.type === "stock") return false;
  if (location.type === "waste" || location.type === "foundation") {
    return cards.length === 1 && cards[0].faceUp && topCard(location)?.id === cards[0].id;
  }
  return canMoveSequence(cards);
}

function record(reason: string): void {
  state.history.push({ state: restoreFromSnapshot(snapshot(state), state.initial ?? snapshot(state)), reason });
  if (state.history.length > 150) state.history.shift();
}

function playSound(kind: "move" | "win"): void {
  if (!settings.sound || typeof window === "undefined") return;
  audioContext ??= new window.AudioContext();
  void audioContext.resume().catch(() => undefined);

  const startTone = (frequency: number, when: number, duration: number, type: OscillatorType = "sine") => {
    const oscillator = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.14, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain);
    gain.connect(audioContext!.destination);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  };

  const now = audioContext.currentTime;
  if (kind === "move") {
    startTone(440, now, 0.12);
  } else {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => startTone(frequency, now + index * 0.12, 0.18));
  }
}

function commit(reason: string): void {
  state.moves += 1;
  hint = null;
  selected = null;
  checkWin();
  playSound(justWon ? "win" : "move");
  justWon = false;
  saveAll();
  render();
  announce(reason);
}

function flipExposedTableauCard(column: Card[]): void {
  const top = lastCard(column);
  if (top && !top.faceUp) top.faceUp = true;
}

function drawFromStock(): void {
  if (state.isPaused || state.isWon) return;

  if (state.stock.length === 0) {
    const redealCap = difficultyConfigForRound(state.roundNumber).redealCap;
    if (!state.waste.length || state.redealsUsed >= redealCap) return;
    record("redeal");
    state.redealsUsed += 1;
    state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
    state.waste = [];
    commit("Recycled waste to stock.");
    return;
  }

  record("draw");
  const drawn = state.stock.splice(-settings.drawMode).reverse().map((card) => ({ ...card, faceUp: true }));
  state.waste.push(...drawn);
  commit(`Drew ${drawn.length} card${drawn.length === 1 ? "" : "s"}.`);
}

function moveCards(from: Location, to: Location, count: number): boolean {
  if (state.isPaused || state.isWon) return false;
  const source = pileAt(from);
  if (!Number.isInteger(count) || count < 1 || count > source.length) return false;
  const moving = source.slice(-count);
  if (!moving.length) return false;

  const destination = pileAt(to);
  const first = moving[0];
  const samePile = from.type === to.type && from.index === to.index;
  if (samePile) return false;

  const valid =
    canMoveFrom(from, moving) &&
    (to.type === "foundation"
      ? count === 1 && canPlaceOnFoundation(first, destination) && foundationIndexFor(first.suit) === (to.index ?? -1)
      : to.type === "tableau" && canPlaceOnTableau(first, destination));

  if (!valid) return false;

  record("move");
  source.splice(source.length - count, count);
  destination.push(...moving);
  if (from.type === "tableau") flipExposedTableauCard(source);
  commit(`Moved ${moving.length === 1 ? cardName(first) : `${moving.length} cards`}.`);
  return true;
}

function autoMove(location: Location): boolean {
  const card = topCard(location);
  if (!card || !card.faceUp) return false;
  const foundation: Location = { type: "foundation", index: foundationIndexFor(card.suit) };
  return moveCards(location, foundation, 1);
}

function undo(): void {
  const previous = state.history.pop();
  if (!previous) return;
  const wasWon = state.isWon;
  const history = state.history;
  state = { ...previous.state, history };
  if (wasWon && !state.isWon && difficultyProgress.completedRounds > 0) difficultyProgress.completedRounds -= 1;
  selected = null;
  hint = null;
  saveAll();
  render();
  announce(`Undid ${previous.reason}.`);
}

function completeRound(): void {
  difficultyProgress.completedRounds += 1;
}

function newGame(): void {
  stats.played += 1;
  if (!state.isWon && state.moves > 0) {
    stats.lost += 1;
    stats.streak = 0;
  }
  if (!state.isWon) completeRound();
  state = createGame(difficultyProgress.completedRounds + 1);
  selected = null;
  hint = null;
  saveAll();
  render();
}

function restartGame(): void {
  if (!state.initial) return;
  record("restart");
  state = restoreFromSnapshot(state.initial, state.initial);
  saveAll();
  render();
}

function togglePause(): void {
  state.isPaused = !state.isPaused;
  state.startedAt = state.isPaused ? null : Date.now();
  saveAll();
  render();
}

function checkWin(): void {
  const won = state.foundations.every((foundation) => foundation.length === 13);
  if (!won || state.isWon) return;
  state.isWon = true;
  completeRound();
  justWon = true;
  stats.won += 1;
  stats.streak += 1;
  stats.longestStreak = Math.max(stats.longestStreak, stats.streak);
  stats.bestTime = stats.bestTime === null ? state.elapsed : Math.min(stats.bestTime, state.elapsed);
}

function locationName(location: Location): string {
  if (location.type === "stock") return "the stock";
  if (location.type === "waste") return "the waste pile";
  if (location.type === "foundation") return `${SUITS[location.index ?? 0]} foundation`;
  return `column ${(location.index ?? 0) + 1}`;
}

function moveDescription(cards: Card[], from: Location, to: Location): string {
  const moving = cards.length === 1 ? cardName(cards[0]) : `${cards.length} cards starting with ${cardName(cards[0])}`;
  return `Move ${moving} from ${locationName(from)} to ${locationName(to)}.`;
}

function wouldRevealFaceDownCard(source: Location, count: number): boolean {
  if (source.type !== "tableau") return false;
  const column = pileAt(source);
  const exposedIndex = column.length - count - 1;
  return exposedIndex >= 0 && !column[exposedIndex].faceUp;
}

function setHint(nextHint: Hint): void {
  hint = nextHint;
  render();
  announce(nextHint.message);
}

function findHint(): void {
  const sources: Array<{ location: Location; count: number }> = [];
  if (lastCard(state.waste)) sources.push({ location: { type: "waste" }, count: 1 });
  state.tableau.forEach((column, index) => {
    column.forEach((card, cardIndex) => {
      if (card.faceUp) sources.push({ location: { type: "tableau", index }, count: column.length - cardIndex });
    });
  });

  const foundationHints: Hint[] = [];
  const tableauHints: Hint[] = [];
  const revealHints: Hint[] = [];

  for (const source of sources) {
    const cards = pileAt(source.location).slice(-source.count);
    if (!canMoveSequence(cards)) continue;
    if (source.count === 1) {
      const card = cards[0];
      const foundation: Location = { type: "foundation", index: foundationIndexFor(card.suit) };
      if (canPlaceOnFoundation(card, pileAt(foundation))) {
        foundationHints.push({
          from: source.location,
          to: foundation,
          message: `${moveDescription(cards, source.location, foundation)} This builds your foundation piles.`
        });
      }
    }
    for (let index = 0; index < 7; index += 1) {
      const destination: Location = { type: "tableau", index };
      if (sameLocation(source.location, destination)) continue;
      if (canPlaceOnTableau(cards[0], pileAt(destination))) {
        const message = `${moveDescription(cards, source.location, destination)} ${
          wouldRevealFaceDownCard(source.location, source.count)
            ? "This uncovers a hidden card."
            : pileAt(destination).length === 0
              ? "Empty columns are open in easy mode."
              : "This makes a longer alternating stack."
        }`;
        const nextHint = { from: source.location, to: destination, message };
        if (wouldRevealFaceDownCard(source.location, source.count)) revealHints.push(nextHint);
        else tableauHints.push(nextHint);
      }
    }
  }

  const nextHint = revealHints[0] ?? foundationHints[0] ?? tableauHints[0];
  if (nextHint) {
    setHint(nextHint);
    return;
  }

  if (state.stock.length) {
    setHint({ from: { type: "stock" }, message: "Draw one card from the stock. There are no board moves right now." });
    return;
  }

  if (state.waste.length) {
    setHint({ from: { type: "stock" }, message: "Recycle the waste pile back into the stock, then draw again." });
    return;
  }

  setHint({ message: "No moves are available right now. Try Undo or start a new deal." });
}

function autoComplete(): void {
  let moved = true;
  while (moved) {
    moved = false;
    const wasteMoved = autoMove({ type: "waste" });
    if (wasteMoved) {
      moved = true;
      continue;
    }
    for (let index = 0; index < 7; index += 1) {
      if (autoMove({ type: "tableau", index })) {
        moved = true;
        break;
      }
    }
  }
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function updateElapsed(): void {
  if (!state.isPaused && !state.isWon && state.startedAt) {
    const now = Date.now();
    const delta = Math.floor((now - state.startedAt) / 1000);
    if (delta > 0) {
      state.elapsed += delta;
      state.startedAt = now;
      saveAll();
      const timer = document.querySelector("[data-timer]");
      if (timer) timer.textContent = formatTime(state.elapsed);
    }
  }
}

function locationKey(location: Location): string {
  return `${location.type}-${location.index ?? "top"}`;
}

function isHint(location: Location): boolean {
  return Boolean(hint && ((hint.from && locationKey(hint.from) === locationKey(location)) || (hint.to && locationKey(hint.to) === locationKey(location))));
}

function isSelected(location: Location, count: number): boolean {
  return !!selected && locationKey(selected.location) === locationKey(location) && selected.count === count;
}

function cardTemplate(card: Card, location: Location, count: number): string {
  const red = colorOf(card.suit) === "red";
  const classes = ["card", card.faceUp ? "face-up" : "face-down", red ? "red" : "black"];
  if (isSelected(location, count)) classes.push("selected");
  return `
    <button class="${classes.join(" ")}" data-action="card" data-location="${locationKey(location)}" data-count="${count}" draggable="${card.faceUp}" aria-label="${card.faceUp ? cardName(card) : "Face-down card"}">
      ${
        card.faceUp
          ? `<span>${rankLabel(card.rank)}</span><strong>${suitSymbol(card.suit)}</strong><span>${rankLabel(card.rank)}</span>`
          : `<span class="back-mark ${settings.cardBack}"></span>`
      }
    </button>
  `;
}

function pileTemplate(label: string, location: Location, cards: Card[], body: string): string {
  const classes = ["pile", location.type, isHint(location) ? "hinted" : "", sameLocation(location, keyboardFocus) ? "focused" : ""].filter(Boolean).join(" ");
  return `<section class="${classes}" data-action="pile" data-location="${locationKey(location)}" aria-label="${label}" tabindex="0">${body}</section>`;
}

function render(): void {
  const stockBody = state.stock.length
    ? `<button class="card face-down stock-card" data-action="draw" aria-label="Draw from stock"><span class="back-mark ${settings.cardBack}"></span></button><span class="pile-count">${state.stock.length}</span>`
    : `<button class="empty-slot" data-action="draw" aria-label="Recycle waste to stock">↻</button>`;

  const wasteTop = lastCard(state.waste);
  const wasteBody = wasteTop ? cardTemplate(wasteTop, { type: "waste" }, 1) : `<div class="empty-slot">Waste</div>`;

  const foundations = state.foundations
    .map((foundation, index) => {
      const top = lastCard(foundation);
      const label = `${SUITS[index]} foundation`;
      return pileTemplate(label, { type: "foundation", index }, foundation, top ? cardTemplate(top, { type: "foundation", index }, 1) : `<div class="empty-slot">${suitSymbol(SUITS[index])}</div>`);
    })
    .join("");

  const tableau = state.tableau
    .map((column, columnIndex) => {
      const cards = column
        .map((card, cardIndex) => cardTemplate(card, { type: "tableau", index: columnIndex }, column.length - cardIndex))
        .join("");
      return pileTemplate(`Tableau column ${columnIndex + 1}`, { type: "tableau", index: columnIndex }, column, cards || `<div class="empty-slot">Any</div>`);
    })
    .join("");

  root.innerHTML = `
    <main class="app-shell ${state.isPaused ? "paused" : ""}">
      <header class="topbar">
        <div>
          <p class="eyebrow">Klondike Solitaire</p>
          <h1>Grannie's Solitare</h1>
        </div>
        <div class="toolbar" role="toolbar" aria-label="Game controls">
          <button data-action="new">New</button>
          <button data-action="restart">Restart</button>
          <button data-action="undo" ${state.history.length ? "" : "disabled"}>Undo</button>
          <button data-action="hint">Hint</button>
          <button data-action="auto">Auto</button>
          <button data-action="pause">${state.isPaused ? "Resume" : "Pause"}</button>
        </div>
      </header>

      <section class="status-strip" aria-label="Game status">
        <span>Moves <strong>${state.moves}</strong></span>
        ${settings.showTimer ? `<span>Time <strong data-timer>${formatTime(state.elapsed)}</strong></span>` : ""}
        <span>Draw <strong>${settings.drawMode}</strong></span>
        <span>Easy <strong>On</strong></span>
        <span>Wins <strong>${stats.won}</strong></span>
        <span>Best <strong>${formatTime(stats.bestTime)}</strong></span>
      </section>

      <section class="hint-panel ${hint ? "is-visible" : ""}" aria-live="polite">
        <strong>${hint ? "Hint" : "Easy mode"}</strong>
        <span>${hint?.message ?? "Balanced deal is on: every column starts with four red-black-red-black cards, and empty columns accept any playable stack."}</span>
      </section>

      <section class="board" aria-label="Solitaire board">
        <div class="top-piles">
          <div class="stock-waste">
            ${pileTemplate("Stock", { type: "stock" }, state.stock, stockBody)}
            ${pileTemplate("Waste", { type: "waste" }, state.waste, wasteBody)}
          </div>
          <div class="foundations">${foundations}</div>
        </div>
        <div class="tableau-grid">${tableau}</div>
      </section>

      <aside class="side-panel" aria-label="Settings and statistics">
        <label>Draw mode
          <select data-setting="drawMode">
            <option value="1" ${settings.drawMode === 1 ? "selected" : ""}>Draw 1</option>
            <option value="3" ${settings.drawMode === 3 ? "selected" : ""}>Draw 3</option>
          </select>
        </label>
        <label>Card back
          <select data-setting="cardBack">
            <option value="quilt" ${settings.cardBack === "quilt" ? "selected" : ""}>Quilt</option>
            <option value="garden" ${settings.cardBack === "garden" ? "selected" : ""}>Garden</option>
            <option value="classic" ${settings.cardBack === "classic" ? "selected" : ""}>Classic</option>
          </select>
        </label>
        <label class="checkbox-label"><input type="checkbox" data-setting="showTimer" ${settings.showTimer ? "checked" : ""} /> Show timer</label>
        <label class="checkbox-label"><input type="checkbox" data-setting="sound" ${settings.sound ? "checked" : ""} /> Sound</label>
        <div class="stats">
          <span>Played <strong>${stats.played}</strong></span>
          <span>Lost <strong>${stats.lost}</strong></span>
          <span>Streak <strong>${stats.streak}</strong></span>
          <span>Longest <strong>${stats.longestStreak}</strong></span>
        </div>
      </aside>

      ${state.isPaused ? `<div class="overlay"><strong>Paused</strong><button data-action="pause">Resume</button></div>` : ""}
      ${state.isWon ? `<div class="overlay win"><strong>You won!</strong><button data-action="new">Deal again</button></div>` : ""}
      <p class="sr-only" aria-live="polite" id="announcer"></p>
    </main>
  `;
}

function parseLocation(key: string | null): Location | null {
  if (!key) return null;
  const [type, index] = key.split("-");
  if (!["stock", "waste", "foundation", "tableau"].includes(type)) return null;
  return { type: type as PileType, index: index === "top" ? undefined : Number(index) };
}

function handleSelection(location: Location, count: number): void {
  if (selected) {
    const moved = moveCards(selected.location, location, selected.count);
    selected = null;
    if (!moved) render();
    return;
  }

  const cards = pileAt(location).slice(-count);
  if (cards.length && canMoveFrom(location, cards)) {
    selected = { location, count };
    render();
  }
}

function announce(message: string): void {
  const announcer = document.querySelector("#announcer");
  if (announcer) announcer.textContent = message;
}

root.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const location = parseLocation(target.dataset.location ?? null);
  const count = Number(target.dataset.count ?? "1");

  if (location) focusLocation(location);

  if (action === "draw") drawFromStock();
  if (action === "new") newGame();
  if (action === "restart") restartGame();
  if (action === "undo") undo();
  if (action === "hint") findHint();
  if (action === "auto") autoComplete();
  if (action === "pause") togglePause();
  if (action === "card" && location) handleSelection(location, count);
  if (action === "pile" && location && selected) handleSelection(location, selected.count);
});

root.addEventListener("dblclick", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action='card']");
  const location = parseLocation(target?.dataset.location ?? null);
  if (location) autoMove(location);
});

root.addEventListener("dragstart", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action='card']");
  const location = parseLocation(target?.dataset.location ?? null);
  if (!target || !location) return;
  event.dataTransfer?.setData("text/plain", JSON.stringify({ location, count: Number(target.dataset.count ?? "1") }));
});

root.addEventListener("dragover", (event) => {
  if ((event.target as HTMLElement).closest("[data-action='pile'], [data-action='card']")) event.preventDefault();
});

root.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-location]");
  const to = parseLocation(target?.dataset.location ?? null);
  const raw = event.dataTransfer?.getData("text/plain");
  if (!to || !raw) return;
  const data = JSON.parse(raw) as { location: Location; count: number };
  moveCards(data.location, to, data.count);
});

root.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const setting = target.dataset.setting;
  if (!setting) return;
  if (setting === "drawMode") settings.drawMode = Number(target.value) as DrawMode;
  if (setting === "cardBack") settings.cardBack = target.value as Settings["cardBack"];
  if (setting === "showTimer") settings.showTimer = (target as HTMLInputElement).checked;
  if (setting === "sound") settings.sound = (target as HTMLInputElement).checked;
  saveAll();
  render();
});

window.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement).matches("input, select, button")) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveKeyboardFocus("left");
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveKeyboardFocus("right");
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveKeyboardFocus("up");
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveKeyboardFocus("down");
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (selected) {
      moveCards(selected.location, keyboardFocus, selected.count);
      return;
    }
    if (keyboardFocus.type === "stock") {
      drawFromStock();
      return;
    }
    const candidate = currentFocusedCards();
    if (candidate) handleSelection(candidate.location, candidate.count);
    return;
  }
  if (event.key.toLowerCase() === "n") newGame();
  if (event.key.toLowerCase() === "u") undo();
  if (event.key.toLowerCase() === "h") findHint();
  if (event.key === " ") {
    event.preventDefault();
    drawFromStock();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => undefined);
  });
}

render();
timerId = window.setInterval(updateElapsed, 1000);
window.addEventListener("beforeunload", () => {
  window.clearInterval(timerId);
  saveAll();
});
