const fs = require('fs');
const lines = fs.readFileSync('Tash8eel/apps/api/src/api/controllers/merchant-portal.controller.ts', 'utf8').split('\n');
let start = -1;
lines.forEach((l, i) => {
  if (l.includes('Get conversion funnel')) start = i;
});
if (start > 0) {
  for (let i = start - 5; i < start + 80 && i < lines.length; i++) {
    console.log((i + 1) + ': ' + lines[i]);
  }
}
