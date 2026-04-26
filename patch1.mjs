import fs from 'fs';

let c = fs.readFileSync('src/views/SchoolManager.tsx', 'utf8');

c = c.replace(
  "import { ArrowLeft, Building2, Plus, Search, MoreHorizontal, CheckCircle2, XCircle, ChevronRight, User, CalendarDays, MapPin, Phone } from 'lucide-react';",
  "import { ArrowLeft, Building2, Plus, Search, MoreHorizontal, CheckCircle2, XCircle, ChevronRight, User, CalendarDays, MapPin, Phone, Folder, Users, IndianRupee, Wallet } from 'lucide-react';"
);

c = c.replace(
  "const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAILS' | 'STUDENT_LIST' | 'STUDENT_PROFILE'>('LIST');",
  "const [view, setView] = useState<'LIST' | 'CREATE' | 'DETAILS' | 'SECTIONS_LIST' | 'STUDENT_LIST' | 'STUDENT_PROFILE' | 'STAFF_LIST' | 'REVENUE_LIST' | 'EXPENDITURE_LIST'>('LIST');"
);

c = c.replace(
  `  const handleBack = () => {
    if (view === 'STUDENT_PROFILE') setView('STUDENT_LIST');
    else if (view === 'STUDENT_LIST') setView('DETAILS');
    else if (view === 'DETAILS') setView('LIST');
    else if (view === 'CREATE') setView('LIST');
    else onClose();
  };`,
  `  const handleBack = () => {
    if (view === 'STUDENT_PROFILE') setView('STUDENT_LIST');
    else if (view === 'STUDENT_LIST') setView('SECTIONS_LIST');
    else if (view === 'SECTIONS_LIST' || view === 'STAFF_LIST' || view === 'REVENUE_LIST' || view === 'EXPENDITURE_LIST') setView('DETAILS');
    else if (view === 'DETAILS') setView('LIST');
    else if (view === 'CREATE') setView('LIST');
    else onClose();
  };`
);

c = c.replace(
  `  let title = 'Data';
  if (view === 'DETAILS' && selectedSchool) title = selectedSchool.name;
  else if (view === 'STUDENT_LIST' && selectedSection) title = selectedSection.name;
  else if (view === 'STUDENT_PROFILE' && selectedStudent) title = selectedStudent.name;`,
  `  let title = 'Data';
  if (view === 'DETAILS' && selectedSchool) title = selectedSchool.name;
  else if (view === 'SECTIONS_LIST') title = 'Students Data';
  else if (view === 'STAFF_LIST') title = 'Staff Data';
  else if (view === 'REVENUE_LIST') title = 'Revenue Data';
  else if (view === 'EXPENDITURE_LIST') title = 'Expenditure Data';
  else if (view === 'STUDENT_LIST' && selectedSection) title = selectedSection.name;
  else if (view === 'STUDENT_PROFILE' && selectedStudent) title = selectedStudent.name;`
);

fs.writeFileSync('src/views/SchoolManager.tsx', c);
