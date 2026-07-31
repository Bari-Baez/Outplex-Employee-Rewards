'use client';

type ScrollFocusOptions = {
  block?: ScrollLogicalPosition;
  behavior?: ScrollBehavior;
  highlightClassName?: string;
  durationMs?: number;
};

const DEFAULT_HIGHLIGHT_CLASS = 'section-focus-highlight';

export function scrollToSectionWithHighlight(
  target: string | HTMLElement | null | undefined,
  {
    block = 'start',
    behavior = 'smooth',
    highlightClassName = DEFAULT_HIGHLIGHT_CLASS,
    durationMs = 2200,
  }: ScrollFocusOptions = {},
) {
  if (typeof document === 'undefined' || !target) return null;

  const node =
    typeof target === 'string'
      ? document.getElementById(target)
      : target;

  if (!node) return null;

  node.scrollIntoView({ behavior, block });
  node.classList.remove(highlightClassName);
  void node.offsetWidth;
  node.classList.add(highlightClassName);
  window.setTimeout(() => {
    node.classList.remove(highlightClassName);
  }, durationMs);

  return node;
}
