const fs = require('fs');
const path = require('path');

const targets = [
  'node_modules/@firebase/firestore/dist/common-edb5d170.esm.js',
  'node_modules/@firebase/firestore/dist/common-51e31ebf.cjs.js',
  'node_modules/@firebase/firestore/dist/intermediate/common.js',
  'node_modules/@firebase/firestore/dist/common-63fc3a52.rn.js',
  'node_modules/@firebase/firestore/dist/common-882bbb15.node.cjs.js',
  'node_modules/@firebase/firestore/dist/index.esm2017.js'
];

let totalPatched = 0;

for (const relPath of targets) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) continue;

  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;

  // Pattern 1 (minified): this.ve -= 1, __PRIVATE_hardAssert(this.ve >= 0, 3241, { ve: this.ve })
  if (content.includes('__PRIVATE_hardAssert(this.ve >= 0, 3241')) {
    content = content.replace(
      /this\.ve\s*-=\s*1,\s*__PRIVATE_hardAssert\(this\.ve\s*>=\s*0,\s*3241,\s*\{[^}]*\}\)/g,
      'this.ve = Math.max(0, this.ve - 1)'
    );
    changed = true;
  }

  // Pattern 2 (unminified): hardAssert(this.pendingResponses >= 0, 0x0ca9, { pendingResponses: this.pendingResponses });
  if (content.includes('0x0ca9')) {
    content = content.replace(
      /hardAssert\(this\.pendingResponses\s*>=\s*0,\s*0x0ca9,\s*\{[^}]*\}\);?/g,
      'this.pendingResponses = Math.max(0, this.pendingResponses);'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`[patch-firestore] Patched: ${relPath}`);
    totalPatched++;
  }
}

console.log(`[patch-firestore] Done. Total files patched: ${totalPatched}`);
