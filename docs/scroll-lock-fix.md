# Android scrolling after module changes and overlay handoffs

Reported on NexusHub 1.0.90: scrolling sometimes stops after tapping, possibly after a module transition.

## Findings and change
The add menu remains mounted for its 160 ms closing animation. It can open an idea/task editor while still holding `body {overflow:hidden}`. Independent save/restore effects let the editor save `hidden` as the original value, so an out-of-order close restores `hidden` after all panels have gone. The old sequence was reproduced before changing code.

All existing page scroll owners now use one lease manager: portal menu/upload/inspector, idea editor, quick task, story editor, media editor and pasted-text editor. It restores the first owner's exact inline overflow state only after the final owner releases. Cleanup is idempotent and separate documents are independent.

The precise on-device module-transition freeze has not been directly observed in this environment. Android now uses the existing 280 ms live-content animation, bypassing `document.startViewTransition` and its snapshot input layer. Desktop browser snapshot transitions and reduced-motion preferences retain their existing behavior. No animation change writes `overflow` or prevents a swipe.

## Verification
Unit tests cover overlapping locks, both close orders, repeated cleanup and Android avoiding snapshots while still animating once. A Chromium touch harness exercises the production quick-task/paste editors, actual panel closing hook and actual navigation function, including rapid handoffs, native Back, normal/reduced motion and widths 320/412. It dispatches real touch input and checks that the page scroll offset changes after each scenario. The signed APK workflow requires this check to pass before release.

The user's Samsung remains the final test for the originally reported intermittent freeze.
