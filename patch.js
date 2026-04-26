const fs = require('fs');
let c = fs.readFileSync('src/views/BillingManager.tsx', 'utf8');
c = c.replace(/sch\.status === 'OVERDUE'/g, "sch.status !== 'PAID' && new Date(sch.dueDate) < new Date()");
fs.writeFileSync('src/views/BillingManager.tsx', c);
