const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'build', 'static', 'js');

if (!fs.existsSync(jsDir)) {
  console.error('build/static/js não encontrado.');
  process.exit(1);
}

const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.endsWith('.LICENSE.txt'));
console.log(`Ofuscando ${files.length} arquivos JS...`);

const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  sourceMap: false,
  target: 'browser',
  disableConsoleOutput: false,
  debugProtection: false,
  splitStrings: false,
};

let success = 0;
for (const file of files) {
  const filePath = path.join(jsDir, file);
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    if (code.length < 500) { console.log(`  Pulando ${file}`); continue; }
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(filePath, result.getObfuscatedCode());
    console.log(`  ✓ ${file}`);
    success++;
  } catch (err) {
    console.error(`  ✗ ${file}: ${err.message}`);
  }
}
console.log(`\n${success} arquivos ofuscados.`);
