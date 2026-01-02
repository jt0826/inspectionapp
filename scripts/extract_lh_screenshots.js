const fs = require('fs');
const path = require('path');
const reportPath = path.resolve(__dirname, '..', 'lighthouse-prod-report.json');
const outDir = path.resolve(__dirname, '..', 'screenshots');

if (!fs.existsSync(reportPath)) {
  console.error('Report not found:', reportPath);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(reportPath, 'utf8');
const json = JSON.parse(raw);

function saveDataUri(uri, filename) {
  const parts = uri.split(',');
  if (parts.length !== 2) return false;
  const meta = parts[0];
  const data = parts[1];
  const match = meta.match(/data:(image\/(png|jpeg|jpg));base64/);
  const ext = match ? (match[2] === 'jpeg' ? 'jpg' : match[2]) : 'png';
  const outPath = path.join(outDir, filename + '.' + ext);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  return outPath;
}

let saved = [];

// final-screenshot
try {
  const final = json.audits && json.audits['final-screenshot'] && json.audits['final-screenshot'].details && json.audits['final-screenshot'].details.data;
  if (final) {
    const p = saveDataUri(final, 'final-screenshot');
    if (p) saved.push(p);
  }
} catch (e) {
  // ignore
}

// full page screenshot
try {
  const fps = json.fullPageScreenshot && json.fullPageScreenshot.screenshot && json.fullPageScreenshot.screenshot.data;
  if (fps) {
    const p = saveDataUri(fps, 'fullpage-screenshot');
    if (p) saved.push(p);
  }
} catch (e) {
  // ignore
}

// filmstrip thumbnails: take a handful
try {
  const filmstrip = json.audits && json.audits['screenshot-thumbnails'] && json.audits['screenshot-thumbnails'].details && json.audits['screenshot-thumbnails'].details.items;
  if (filmstrip && Array.isArray(filmstrip)) {
    filmstrip.slice(0,5).forEach((it, idx) => {
      if (it && it.data) {
        const p = saveDataUri(it.data, `filmstrip-${idx}`);
        if (p) saved.push(p);
      }
    });
  }
} catch (e) {
  // ignore
}

if (saved.length === 0) {
  console.error('No screenshots found in report.');
  process.exit(2);
}

console.log('Saved screenshots:');
saved.forEach(s => console.log(' -', s));
process.exit(0);
