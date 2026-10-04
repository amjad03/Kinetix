/** Settings shared by the server and the e2e tests. */
export function configureApp(app) {
    app.enableCors();
    app.enableShutdownHooks();
    // Saved whiteboards are JSON stroke data; a busy multi-page lesson is a few MB.
    app.useBodyParser('json', { limit: '8mb' });
}
//# sourceMappingURL=setup.js.map