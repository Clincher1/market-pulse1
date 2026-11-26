const enhancedTables = new WeakSet<HTMLTableElement>();
const HINT = '← таблица прокручивается вбок →';

function scrollContainerFor(table: HTMLTableElement, view: Window): HTMLElement | null {
  let node = table.parentElement;
  while (node && node !== table.ownerDocument.body) {
    const overflowX = view.getComputedStyle(node).overflowX;
    if (overflowX === 'auto' || overflowX === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

function createHint(document: Document): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'table-scroll-affordance__hint';
  hint.textContent = HINT;
  return hint;
}

function enhanceTable(table: HTMLTableElement, view: Window) {
  if (enhancedTables.has(table)) return;
  const scroller = scrollContainerFor(table, view);
  if (!scroller) return;

  let shell = scroller.closest<HTMLElement>('.table-scroll-affordance');
  if (!shell) {
    shell = table.ownerDocument.createElement('div');
    shell.className = 'table-scroll-affordance';
    scroller.parentNode?.insertBefore(shell, scroller);
    shell.append(scroller);
  }
  scroller.classList.add('table-scroll-affordance__scroller');

  let frame = Array.from(shell.children)
    .find(child => child.classList.contains('table-scroll-affordance__frame')) as HTMLElement | undefined;
  if (!frame) {
    frame = table.ownerDocument.createElement('div');
    frame.className = 'table-scroll-affordance__frame';
    shell.insertBefore(frame, scroller);
    frame.append(scroller);
  } else if (scroller.parentElement !== frame) {
    frame.append(scroller);
  }

  const existingHints = Array.from(shell.children)
    .filter(child => child.classList.contains('table-scroll-affordance__hint')) as HTMLElement[];
  const wasDismissed = existingHints.some(hint => hint.dataset.dismissed === 'true');
  const topHint = existingHints[0] ?? createHint(table.ownerDocument);
  const bottomHint = existingHints[1] ?? createHint(table.ownerDocument);
  for (const hint of [topHint, bottomHint]) {
    hint.textContent = HINT;
    if (wasDismissed) {
      hint.dataset.dismissed = 'true';
      hint.setAttribute('aria-hidden', 'true');
    }
  }
  shell.insertBefore(topHint, frame);
  shell.insertBefore(bottomHint, frame.nextSibling);
  const hints = [topHint, bottomHint];

  const dismissHints = () => {
    hints.forEach(hint => {
      hint.dataset.dismissed = 'true';
      hint.setAttribute('aria-hidden', 'true');
    });
  };
  const syncOverflow = () => {
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    shell.dataset.scrollable = String(maxScroll > 1);
    shell.dataset.moreRight = String(maxScroll - scroller.scrollLeft > 1);
  };
  scroller.addEventListener('scroll', () => {
    if (scroller.scrollLeft > 0) dismissHints();
    syncOverflow();
  }, { passive: true });
  view.addEventListener('resize', syncOverflow, { passive: true });
  if ('ResizeObserver' in view) {
    const resizeObserver = new ResizeObserver(syncOverflow);
    resizeObserver.observe(scroller);
    resizeObserver.observe(table);
  }
  enhancedTables.add(table);
  if (scroller.scrollLeft > 0) dismissHints();
  syncOverflow();
}

/** Adds a CSS-only edge fade plus paired one-time mobile hints to horizontally scrollable tables. */
export function installTableScrollAffordances(root: Document = document) {
  const view = root.defaultView;
  if (!view || !root.body) return () => {};

  const enhanceAll = () => {
    root.querySelectorAll<HTMLTableElement>('table').forEach(table => enhanceTable(table, view));
  };
  enhanceAll();
  const observer = new view.MutationObserver(enhanceAll);
  observer.observe(root.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
