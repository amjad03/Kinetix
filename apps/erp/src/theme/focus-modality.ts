/**
 * Focus rings only for keyboard users. Chrome turns on :focus-visible for a clicked button or tab as soon as
 * any key is pressed (Shift for Shift+wheel, Ctrl/Cmd for a new tab, a copy shortcut), which made a teal box
 * "stick" on the active tab or sidebar item. This marks <html data-kbd> on real keyboard navigation (Tab,
 * arrows, Enter, Space, Escape, Home/End, Page keys, without Ctrl/Cmd/Alt) and clears it on any pointer press.
 * The `focus-visible:` variant (globals.css) requires the mark, except on text fields, which always show it.
 */
export const FOCUS_SCRIPT = `(function(){var d=document.documentElement,K={Tab:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1,Enter:1,' ':1,Escape:1,Home:1,End:1,PageUp:1,PageDown:1,F6:1};addEventListener('keydown',function(e){if(K[e.key]&&!e.ctrlKey&&!e.metaKey&&!e.altKey)d.setAttribute('data-kbd','')},true);addEventListener('pointerdown',function(){d.removeAttribute('data-kbd')},true)})()`;
