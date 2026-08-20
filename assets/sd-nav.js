// Nav "Show More" — reveals hidden submenu items when the button is clicked.
// Works for both mega-menu grandchild lists and standard dropdown child lists.
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-nav-show-more]');
  if (!btn) return;

  const list = btn.closest('ul, ol');
  if (!list) return;

  list.querySelectorAll('[data-nav-more-item]').forEach(function (li) {
    li.removeAttribute('hidden');
  });

  const wrap = btn.closest('[data-nav-show-more-wrap]');
  if (wrap) {
    // Move focus into the menu BEFORE removing the button.
    // If we remove first, focus falls to <body> which is outside header-menu,
    // and DetailsDisclosure.onFocusOut() closes the whole menu.
    const firstRevealed = list.querySelector('[data-nav-more-item] a, [data-nav-more-item] button');
    if (firstRevealed) firstRevealed.focus({ preventScroll: true });
    wrap.remove();
  }
});
