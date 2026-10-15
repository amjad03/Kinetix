window.ready = document.fonts.ready.then(() => Promise.all([...document.fonts].map(f => f.load().catch(() => 0))));
