/**
 * Script: Replace all <Text> with <SafeText> across the TICS app
 * 
 * This script:
 * 1. Finds all .tsx files in frontend/src/screens, frontend/src/modules, 
 *    frontend/src/components, frontend/app
 * 2. Adds import { SafeText } from '@/src/components/responsive/SafeText' to files using <Text>
 * 3. Replaces all <Text> with <SafeText> and </Text> with </SafeText>
 * 
 * Run: node frontend/scripts/replace-text-to-safetext.js
 */

const fs = require('fs');
const path = require('path');

const IMPORT_LINE = `import { SafeText } from '@/src/components/responsive/SafeText';`;

function findFiles(dir, pattern) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.expo') && !fullPath.includes('scripts')) {
        results = results.concat(findFiles(fullPath, pattern));
      } else if (pattern.test(fullPath)) {
        results.push(fullPath);
      }
    });
  } catch (e) {}
  return results;
}

const dirs = [
  'frontend/src/screens',
  'frontend/src/modules',
  'frontend/src/components',
  'frontend/app',
];

let changed = 0;
let skipped = 0;
let error = 0;

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}`);
    return;
  }
  const files = findFiles(dir, /\.tsx$/);
  files.forEach(filePath => {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      
      // Skip files that don't use <Text>
      if (!content.includes('<Text') && !content.includes('</Text>')) {
        skipped++;
        return;
      }
      
      // Skip files that already use SafeText
      if (content.includes('SafeText')) {
        skipped++;
        return;
      }
      
      // Check if it's a UI component or screen file (has Text usage)
      const textOpenCount = (content.match(/<Text[^>]*>/g) || []).length;
      if (textOpenCount === 0) {
        skipped++;
        return;
      }
      
      // Add import (after last import or at top)
      const importRegex = /^import .+$/gm;
      const imports = content.match(importRegex);
      if (imports) {
        const lastImport = imports[imports.length - 1];
        content = content.replace(lastImport, lastImport + '\n' + IMPORT_LINE);
      } else {
        content = IMPORT_LINE + '\n' + content;
      }
      
      // Replace <Text with <SafeText (but not <SafeText already)
      // Need to be careful with self-closing tags and attributes
      content = content.replace(/<Text([^>]*>)/g, '<SafeText$1');
      content = content.replace(/<\/Text>/g, '</SafeText>');
      
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✓ ${filePath} (${textOpenCount} replacements)`);
      changed++;
    } catch (e) {
      console.error(`✗ ${filePath}: ${e.message}`);
      error++;
    }
  });
});

console.log(`\nDone! ${changed} files changed, ${skipped} skipped, ${error} errors`);