"use client";

// Enter-to-submit that survives an IME.
//
// With a Vietnamese, Japanese or Chinese keyboard, Enter first commits the
// composed text — and that keypress reaches onKeyDown too. Treating it as
// "submit" both sends half-typed input and fires again on the real Enter, so
// the same thing gets posted twice. isComposing tells the two apart.
export const onEnter = (fn) => (e) => {
  if (e.key !== "Enter") return;
  if (e.nativeEvent?.isComposing) return;
  fn();
};
