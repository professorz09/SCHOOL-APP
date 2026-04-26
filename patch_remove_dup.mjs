import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

const lines = c.split('\n');

// 182 to 357 is 176 lines
lines.splice(181, 176);

fs.writeFileSync('src/views/SchoolManager.tsx', lines.join('\n'));
