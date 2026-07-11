# Product Requirements Document: Grannie's Solitare

## 1. Overview

Grannie's Solitare is a classic Klondike Solitaire card game built as a web application. The goal is to deliver a clean, fast, offline-capable solitaire experience that runs in any modern browser with no installation required.

## 2. Goals

- Provide a fully playable Klondike Solitaire game with standard rules
- Work offline (Progressive Web App)
- Be responsive and playable on desktop and mobile
- Remember game state across sessions
- Track basic stats (wins, losses, time)

## 3. Non-Goals

- Multiplayer or online leaderboards
- Multiple solitaire variants (initial release is Klondike only)
- Monetization, ads, or in-app purchases
- User accounts or authentication

## 4. Target Audience

Casual players, older adults (hence "Grannie"), and anyone who wants a simple, distraction-free solitaire game.

## 5. Functional Requirements

### 5.1 Core Gameplay (Klondike Solitaire)

| ID | Requirement | Priority |
|----|------------|----------|
| F1 | Standard 52-card deck, dealt into 7 tableau columns (1-7 cards, top card face-up) | P0 |
| F2 | Remaining cards form a draw pile (stock); click to draw (draw-1 or draw-3 mode) | P0 |
| F3 | Waste pile: drawn cards go here; can be cycled back to stock | P0 |
| F4 | Tableau: build down in alternating colors; move sequences of correctly ordered face-up cards | P0 |
| F5 | Foundations: 4 piles, build up by suit from Ace to King; winning condition | P0 |
| F6 | Double-click or tap on a card to auto-send it to its foundation if eligible | P0 |
| F7 | Auto-complete / "win animation" when all cards are in foundations | P1 |
| F8 | Undo (full move history) | P1 |
| F9 | Hint system (highlight a valid move) | P2 |
| F10 | Timer tracking game duration | P1 |
| F11 | Move counter | P1 |

### 5.2 Game Management

| ID | Requirement | Priority |
|----|------------|----------|
| G1 | New game deals a fresh shuffled deck | P0 |
| G2 | Restart: reset current game to its initial dealt state | P1 |
| G3 | Pause/resume (timer stops when paused) | P2 |
| G4 | Auto-save game state to localStorage on every move | P0 |
| G5 | Resume previous game on page load (if one was in progress) | P0 |

### 5.3 Settings & Preferences

| ID | Requirement | Priority |
|----|------------|----------|
| S1 | Toggle draw mode: Draw 1 vs Draw 3 | P1 |
| S2 | Toggle timer on/off | P2 |
| S3 | Card back design selector (2-3 options) | P2 |
| S4 | Sound effects toggle (card flip, win jingle) | P2 |
| S5 | Persistent settings (saved to localStorage) | P1 |

### 5.4 Statistics

| ID | Requirement | Priority |
|----|------------|----------|
| T1 | Track total games played, won, lost | P1 |
| T2 | Track win streak / longest win streak | P2 |
| T3 | Track best time (for wins) | P2 |
| T4 | Stats persist in localStorage | P1 |

### 5.5 Technical Requirements

| ID | Requirement | Priority |
|----|------------|----------|
| X1 | Works offline as a PWA (service worker + manifest) | P1 |
| X2 | Installed via the browser's "Add to Home Screen" prompt | P1 |
| X3 | App must work in Chrome, Firefox, Safari, and Edge (last 2 major versions) | P0 |
| X4 | Fast initial load (under 2s on 3G) | P0 |
| X5 | No backend server required; fully client-side | P0 |

## 6. UI / UX Requirements

### 6.1 Layout

- Responsive: reflows gracefully from desktop (landscape) to mobile (portrait)
- Tableau centered, stock/waste in top-left, foundations top-right
- Cards rendered as crisp, scalable vector graphics (or high-res sprites)
- Clean, uncluttered design; no ads or chrome

### 6.2 Interactions

- Drag-and-drop for card movement (desktop + touch)
- Click-to-select, then click-destination as fallback (especially for mobile)
- Smooth card flip and move animations
- Visual feedback: valid drop targets highlighted, invalid moves snap back

### 6.3 Accessibility

- Keyboard navigable (arrow keys, Enter to select/place)
- Sufficient color contrast for card suits
- Screen-reader-friendly labels on cards and controls

## 7. Technical Stack (Recommended)

- **Framework:** Vanilla JS or lightweight framework (Preact, Svelte, or Lit)
- **Styling:** CSS Grid/Flexbox for responsive layout
- **State management:** Simple module/store persisted via localStorage
- **Build tool:** Vite (fast builds, PWA plugin available)
- **PWA:** vite-plugin-pwa for service worker + manifest
- **Testing:** Vitest for unit tests; Playwright for E2E

## 8. User Stories

1. *As a player, I want to open the app and immediately see a dealt solitaire game so I can start playing without any setup.*
2. *As a player, I want to drag cards to build tableau columns and foundations so I can play the game naturally.*
3. *As a player, I want to draw cards from the stock so I can access more cards when I'm stuck.*
4. *As a player, I want to undo moves if I make a mistake.*
5. *As a player, I want my game to be saved automatically so I can close the browser and resume later.*
6. *As a player, I want to see my win/loss stats so I can track my progress.*
7. *As a player, I want to install the app on my phone so it feels like a native app.*
8. *As a player, I want the game to work offline so I can play on a plane or without internet.*

## 9. Milestones

| Milestone | Scope | Target |
|-----------|-------|--------|
| M1 - Core gameplay | Deal, draw, tableau, foundations, win detection, basic drag-and-drop | Week 2 |
| M2 - Game management | New game, restart, auto-save/resume, undo | Week 3 |
| M3 - Polish & settings | Draw-3 mode, timer, move counter, settings panel, responsive layout | Week 4 |
| M4 - PWA & offline | Service worker, manifest, install prompt, offline verification | Week 5 |
| M5 - Stats & hints | Statistics tracking, hint system, accessibility pass | Week 6 |

## 10. Success Metrics

- Game is fully playable and bug-free (no crashes, no invalid moves allowed)
- PWA scores 90+ on Lighthouse
- Initial load < 2s on simulated 3G
- All core interactions work with keyboard and touch
- Zero backend dependencies
