# Build Prompt for Grannie's Solitare

Build a web application called **Grannie's Solitare**.

It should be a calm, friendly, offline-capable Klondike Solitaire game designed for older adults and casual players. Prioritize simplicity, readability, and reliability over flashy visuals.

Core requirements:
- Standard 52-card Klondike Solitaire rules
- 7 tableau columns with the standard 1-7 deal and only top cards face up
- Stock, waste, and 4 foundation piles
- Draw-1 and draw-3 modes
- Tableau rules: descending rank, alternating colors
- Foundation rules: same suit, ascending Ace to King
- Click/tap selection plus drag-and-drop
- Double-click or double-tap to auto-send a card to its foundation when legal
- Undo with full move history
- New game and restart
- Timer and move counter
- Hint system
- Auto-complete / win animation when all cards are in foundations
- Save and restore game state automatically
- Persistent settings and stats in localStorage
- Offline PWA support with manifest and service worker
- Responsive layout for desktop and mobile
- Accessibility support: keyboard navigation, strong contrast, clear labels

UX direction:
- Large, readable cards and controls
- Simple, uncluttered layout
- Friendly, calm visual style
- Touch-friendly spacing
- No ads, no login, no backend
- Make it feel dependable and easy for an older player to use

Technical direction:
- Prefer Vite + TypeScript + vanilla JS or a similarly lightweight stack
- Keep game logic separate from rendering where practical
- Make state deterministic enough for undo and restore to work cleanly
- Keep bundle size small and initial load fast
- Include a production build command and verify it succeeds

Acceptance criteria:
- The app loads directly into a playable solitaire game
- A full game can be played using valid moves only
- Undo restores prior state correctly
- Refreshing the page restores an in-progress game
- Offline reload works after the app has been visited once
- The app builds successfully with no errors

Suggested build order:
1. Build the solitaire engine and state model.
2. Add rendering and input handling.
3. Add persistence, undo, and stats.
4. Add PWA assets and offline support.
5. Polish the responsive layout and accessibility.
6. Run a production build and verify the output.

Deliver a working app, not just a mockup. Include the key files, the build command, and a short verification note showing that the production build succeeds.
