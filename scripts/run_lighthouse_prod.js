#!/usr/bin/env node
const http = require('http');
const handler = require('serve-handler');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const HOST = '127.0.0.1';
const URL = `http://${HOST}:${PORT}`;
const OUT_PATH = './lighthouse-prod-report.json';

async function main() {
  const server = http.createServer((req, res) => handler(req, res, {public: 'out'}));

  server.listen(PORT, HOST, async () => {
    console.log(`Static server running at ${URL}`);

    // Dynamic import ESM modules (chrome-launcher, lighthouse)
    const chromeLauncherModule = await import('chrome-launcher');
    const lighthouseModule = await import('lighthouse');
    const chromeLauncher = chromeLauncherModule.default ?? chromeLauncherModule;
    const lighthouse = lighthouseModule.default ?? lighthouseModule;

    // Launch Chrome with flags to avoid interstitials and site-isolation quirks
    const chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-translate',
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const options = {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      emulatedFormFactor: 'mobile',
    };

    try {
      console.log('Running Lighthouse...');
      const runnerResult = await lighthouse(URL, options);
      const reportJson = runnerResult.report;
      fs.writeFileSync(OUT_PATH, reportJson);
      console.log(`Lighthouse finished. Report saved to ${OUT_PATH}`);
    } catch (err) {
      console.error('Lighthouse run failed:', err);
      process.exitCode = 2;
    } finally {
      try {
        await chrome.kill();
      } catch (e) {
        console.warn('Failed to kill Chrome:', e && e.message);
      }

      server.close(() => {
        console.log('Static server stopped.');
        // exit with previously set code (0 if success)
        process.exit(process.exitCode || 0);
      });
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});