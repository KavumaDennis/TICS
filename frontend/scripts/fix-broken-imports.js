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
  
  // Check for broken import pattern
  if (content.includes('import {\nimport { SafeText } from')) {
    const lines = content.split('\n');
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect broken import line
      if (line.includes('import { SafeText } from') && !line.trimStart().startsWith('import')) {
        // Extract SafeText import
        const match = line.match(/import \{ SafeText \} from '[^']+';?/);
        if (match) {
          // Add SafeText import as separate line
          newLines.push(match[0]);
          // Remove SafeText part from current line
          let cleaned = line.replace(match[0], '').trim();
          if (cleaned) {
            newLines.push(cleaned);
          }
          continue;
        }
      }
      newLines.push(line);
    }
    
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    console.log('Fixed:', filePath);
    fixed++;
  }
});

console.log('\nFixed ' + fixed + ' files with broken imports');

// Verify all imports are valid
let stillBroken = 0;
files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.includes('import { SafeText }') && !line.trimStart().startsWith('import')) {
      console.log('STILL BROKEN:', filePath);
      stillBroken++;
      break;
    }
  }
});

if (stillBroken === 0) console.log('All imports valid!');