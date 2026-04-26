import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

// Match the mistakenly placed block inside view === 'CREATE'
const BLOCK_START = `                          <div className="flex justify-between items-center">
               <SectionTitle title="School Information" />`;
const BLOCK_END = `                </AppCard>
              )}`;

const startIndex = c.indexOf(BLOCK_START);
const endIndex = c.indexOf(BLOCK_END, startIndex) + BLOCK_END.length;

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find the block");
    process.exit(1);
}

const blockToMove = c.substring(startIndex, endIndex);

// Remove the block
c = c.slice(0, startIndex) + c.slice(endIndex);

// Insert it into view === 'DETAILS'
const DETAILS_START = `{view === 'DETAILS' && selectedSchool && (
            <div className="space-y-6">`;
c = c.replace(DETAILS_START, DETAILS_START + '\n\n' + blockToMove);

fs.writeFileSync('src/views/SchoolManager.tsx', c);
