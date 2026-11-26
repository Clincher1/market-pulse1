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

function enhanceTable(table: HTMLTableElement, view: Window) {
  if (enhancedTables.has(table)) return;
  const scroller = scrollContainerFor(table, view);
  if (!scroller) return;

  let shell = scroller.parentElement;
  if (!shell?.classList.contains('table-scroll-affordance')) {
    shell = table.ownerDocument.createElement('div');
    shell.className = 'table-scroll-affordance';
    scroller.parentNode?.insertBefore(shell, scroller);
    shell.append(scroller);
  }
  scroller.classList.add('table-scroll-affordance__scroller');

  let hint = shell.querySelector<HTMLElement>('.table-scroll-affordance__hint');
  if (!hint) {
    hint = table.ownerDocument.createElement('p');
    hint.className = 'table-scroll-affordance__hint';
    hint.textContent = HINT;
    shell.append(hint);
  }

  const syncOverflow = () => {
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    shell.dataset.scrollable = String(maxScroll > 1);
    shell.dataset.moreRight = String(maxScroll - scroller.scrollLeft > 1);
  };
  scroller.addEventListener('scroll', () => {
    if (scroller.scrollLeft > 0 && hint) {
      hint.dataset.dismissed = 'true';
      hint.setAttribute('aria-hidden', 'true');
    }
    syncOverflow();
  }, { passive: true });
  view.addEventListener('resize', syncOverflow, { passive: true });
  if ('ResizeObserver' in view) {
    const resizeObserver = new ResizeObserver(syncOverflow);
    resizeObserver.observe(scroller);
    resizeObserver.observe(table);
  }
  enhancedTables.add(table);
  syncOverflow();
}

/** Adds a CSS-only edge fade plus a one-time mobile hint to horizontally scrollable tables. */
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
