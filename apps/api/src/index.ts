import { config, validateConfig } from './config.js';
import { initializeData } from './services.js';
import { maintenance } from './jobs.js';
import { createApp } from './app.js';
validateConfig();
await initializeData();
const app = createApp();
const server = app.listen(config.PORT, config.APP_MODE === 'cloud' ? '0.0.0.0' : config.HOST, () =>
  console.log(`Steadier API: http://${config.HOST}:${config.PORT} (${config.APP_MODE})`),
);
if (config.APP_MODE !== 'cloud') {
  void maintenance().catch(() => console.error('Maintenance will retry.'));
  setInterval(
    () => void maintenance().catch(() => console.error('Maintenance will retry.')),
    60000,
  ).unref();
}
process.on('SIGTERM', () => server.close(() => process.exit(0)));
