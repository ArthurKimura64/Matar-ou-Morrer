const { workerData, parentPort } = require('worker_threads');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

const { filePath, options } = workerData;

try {
  const code = fs.readFileSync(filePath, 'utf8');
  if (code.length < 500) {
    parentPort.postMessage({ filePath, skipped: true });
  } else {
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(filePath, result.getObfuscatedCode());
    parentPort.postMessage({ filePath, success: true });
  }
} catch (err) {
  parentPort.postMessage({ filePath, error: err.message });
}
