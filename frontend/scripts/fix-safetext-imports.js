const fs = require('fs');
const path = require('path');

function findFiles(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.expo')) {
        results = results.concat(findFiles(fullPath));
      } else if (fullPath.endsWith('.tsx')) {
        results.push(fullPath);
      }
    });
  } catch (e) {}
  return results;
}

const files = findFiles('frontend');
let fixed = 0;

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Check for broken import (SafeText injected mid-line)
  if (content.includes('import { SafeText } from') && content.includes('import { SafeText } }')) {
    const lines = content.split('\n');
    const newLines = [];
    let hasFix = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect broken line: contains 'import { SafeText } from' but NOT at start
      if (line.includes('import { SafeText } from') && line.trimStart().startsWith('import') === false) {
        // Extract SafeText import
        const match = line.match(/import \{ SafeText \} from '[^']+'/);
        if (match) {
          // Add SafeText import as its own line
          newLines.push(match[0] + ';');
          // Remove SafeText part from the line
          let remaining = line.replace(match[0], '').replace(/['";,]/g, '').trim();
          if (remaining) {
            newLines.push(remaining.endsWith(';') ? remaining : remaining + ';');
          }
          hasFix = true;
          continue;
        }
      }
      newLines.push(line);
    }
    
    if (hasFix) {
      fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
      console.log('Fixed:', filePath);
      fixed++;
    }
  }
});

console.log('\nFixed ' + fixed + ' files');

// Verify
let broken = 0;
files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes('import { SafeText }') && !content.includes('import { SafeText } from')) {
    console.log('STILL BROKEN:', filePath);
    broken++;
  }
});
if (broken === 0) console.log('All SafeText imports valid!');