import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');
const lines = c.split('\n');

// Safely locate blocks using regex
const SCHOOL_INFO_START = lines.findIndex(line => line.includes('<SectionTitle title="School Information" />'));
// Find the preceding `div class="flex justify-between items-center"`
let blockStart = SCHOOL_INFO_START;
while (blockStart > 0 && !lines[blockStart].includes('flex justify-between items-center')) {
    blockStart--;
}

// Find the corresponding `)}` for `!isEditingInfo`
let blockEnd = SCHOOL_INFO_START;
let braces = 0;
let foundEnd = false;
for (let i = SCHOOL_INFO_START; i < lines.length; i++) {
    if (lines[i].includes(')}')) {
        blockEnd = i;
        break; // because the school info ends with `)}`
    }
}

console.log('School Info block found from line', blockStart, 'to', blockEnd);

let blockLines = lines.splice(blockStart, blockEnd - blockStart + 1);

// Also let's clean up duplicate `{view === 'CREATE' && (`
let firstCreate = lines.findIndex(line => line.includes("{view === 'CREATE' && ("));
let secondCreate = lines.findIndex((line, i) => i > firstCreate && line.includes("{view === 'CREATE' && ("));

if (secondCreate !== -1) {
   console.log('Found duplicate view === CREATE at', secondCreate);
   lines.splice(firstCreate, secondCreate - firstCreate); // remove duplicates
}

const DETAILS_BLOCK = lines.findIndex(line => line.includes("{view === 'DETAILS' && selectedSchool && ("));
// The div class="space-y-6" is the next line
lines.splice(DETAILS_BLOCK + 2, 0, ...blockLines);

fs.writeFileSync('src/views/SchoolManager.tsx', lines.join('\n'));
