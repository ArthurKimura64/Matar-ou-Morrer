const { Worker } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const jsDir = path.join(__dirname, 'build', 'static', 'js');
// Vercel preserves node_modules/.cache between builds; use it for persistent caching
const cacheDir = process.env.VERCEL
  ? path.join(__dirname, 'node_modules', '.cache', 'obfuscation')
  : path.join(__dirname, '.obfuscation-cache');
const workerFile = path.join(__dirname, 'obfuscate-worker.js');

if (!fs.existsSync(jsDir)) {
  console.error('build/static/js não encontrado.');
  process.exit(1);
}

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.endsWith('.LICENSE.txt'));
console.log(`Ofuscando ${files.length} arquivos JS...`);

const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.25,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.5,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  sourceMap: false,
  target: 'browser',
  disableConsoleOutput: false,
  debugProtection: false,
  splitStrings: false,
};

function getFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

function getCachePath(hash) {
  return path.join(cacheDir, hash + '.js');
}

function runWorker(filePath) {
  return new Promise((resolve) => {
    const worker = new Worker(workerFile, {
      workerData: { filePath, options }
    });
    worker.on('message', resolve);
    worker.on('error', (err) => resolve({ filePath, error: err.message }));
  });
}

async function main() {
  const start = Date.now();
  const tasks = [];
  let cached = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(jsDir, file);
    const code = fs.readFileSync(filePath, 'utf8');

    if (code.length < 500) {
      console.log(`  Pulando ${file} (< 500 bytes)`);
      skipped++;
      continue;
    }

    // Check cache
    const hash = getFileHash(filePath);
    const cachePath = getCachePath(hash);
    if (fs.existsSync(cachePath)) {
      fs.writeFileSync(filePath, fs.readFileSync(cachePath, 'utf8'));
      console.log(`  ⚡ ${file} (cache)`);
      cached++;
      continue;
    }

    // Queue for parallel obfuscation, store hash for caching result
    tasks.push({ filePath, file, hash });
  }

  if (tasks.length > 0) {
    console.log(`  Processando ${tasks.length} arquivo(s) em paralelo...`);
    const results = await Promise.all(tasks.map(t => runWorker(t.filePath)));

    let success = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const task = tasks[i];
      if (result.skipped) {
        console.log(`  Pulando ${task.file}`);
      } else if (result.success) {
        // Save to cache
        const obfuscated = fs.readFileSync(task.filePath, 'utf8');
        fs.writeFileSync(getCachePath(task.hash), obfuscated);
        console.log(`  ✓ ${task.file}`);
        success++;
      } else {
        console.error(`  ✗ ${task.file}: ${result.error}`);
      }
    }
    console.log(`\n${success} ofuscados, ${cached} do cache, ${skipped} pulados.`);
  } else {
    console.log(`\n${cached} do cache, ${skipped} pulados. Nada para ofuscar.`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Tempo de ofuscação: ${elapsed}s`);
}

main().catch(err => {
  console.error('Erro na ofuscação:', err);
  process.exit(1);
});

