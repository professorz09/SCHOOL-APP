import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Library, FlaskConical, BookOpen, Wrench, Plus, Search,
  Trash2, X, Save, RotateCcw, UserCheck, ChevronRight, History as HistoryIcon,
} from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { LibraryBook, LabEquipment } from '../../../types/principal.types';
import { studentService } from '../../../services/student.service';
import { Student } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type Tab = 'LIBRARY' | 'LAB';
type LibrarySubTab = 'BOOKS' | 'HISTORY';
type LabSubTab = 'EQUIPMENT' | 'HISTORY';

interface AssetLog {
  id: string;
  timestamp: string;
  type: 'ADD' | 'DELETE' | 'ISSUE' | 'RETURN' | 'UPDATE' | 'SERVICE';
  category: 'BOOK' | 'EQUIPMENT';
  itemName: string;
  details: string;
}

interface Props { onBack: () => void; }

const labTypeColor = (t: string) =>
  t === 'SCIENCE' ? 'bg-emerald-50 text-emerald-700' :
  t === 'COMPUTER' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';

export const AssetsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('LIBRARY');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('BOOKS');
  const [labSubTab, setLabSubTab] = useState<LabSubTab>('EQUIPMENT');
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [equipment, setEquipment] = useState<LabEquipment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [bookSearch, setBookSearch] = useState('');
  const [eqSearch, setEqSearch] = useState('');
  const [logs, setLogs] = useState<AssetLog[]>([]);

  // Book modals
  const [addBookModal, setAddBookModal] = useState(false);
  const [issueModal, setIssueModal] = useState<LibraryBook | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', subject: '', totalCopies: 1 });

  // Equipment modals
  const [addEqModal, setAddEqModal] = useState(false);
  const [eqForm, setEqForm] = useState({ name: '', labType: 'SCIENCE' as LabEquipment['labType'], quantity: 1, workingCount: 1, lastServiced: new Date().toISOString().split('T')[0] });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const addLog = (type: AssetLog['type'], category: AssetLog['category'], itemName: string, details: string) => {
    const log: AssetLog = {
      id: `log${Date.now()}`,
      timestamp: new Date().toLocaleString('en-IN'),
      type,
      category,
      itemName,
      details,
    };
    setLogs(prev => [log, ...prev].slice(0, 10));
  };

  useEffect(() => {
    Promise.all([
      principalService.getBooks(),
      principalService.getEquipment(),
      studentService.getAll(),
    ]).then(([b, e, s]) => { setBooks(b); setEquipment(e); setStudents(s); });
  }, []);

  const filteredBooks = books.filter(b =>
    b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
    b.author.toLowerCase().includes(bookSearch.toLowerCase()) ||
    b.subject.toLowerCase().includes(bookSearch.toLowerCase()) ||
    b.isbn.includes(bookSearch)
  );

  const filteredEq = equipment.filter(e =>
    e.name.toLowerCase().includes(eqSearch.toLowerCase()) ||
    e.labType.toLowerCase().includes(eqSearch.toLowerCase())
  );

  const handleAddBook = async () => {
    if (!bookForm.title.trim()) { showToast('Book title required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const book = await principalService.addBook(bookForm);
      setBooks(prev => [...prev, book]);
      addLog('ADD', 'BOOK', book.title, `${book.totalCopies} copies added by ${bookForm.author}`);
      showToast(`"${book.title}" added`);
      setBookForm({ title: '', author: '', isbn: '', subject: '', totalCopies: 1 });
      setAddBookModal(false);
    } finally { setIsSubmitting(false); }
  };

  const handleDeleteBook = async (id: string, title: string) => {
    await principalService.deleteBook(id);
    setBooks(prev => prev.filter(b => b.id !== id));
    addLog('DELETE', 'BOOK', title, 'Book removed from library');
    showToast(`"${title}" deleted`);
  };

  const handleIssueBook = async () => {
    if (!issueModal || !selectedStudentId) { showToast('Select a student', 'error'); return; }
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return;
    setIsSubmitting(true);
    try {
      const updated = await principalService.issueBook(issueModal.id, student.id, student.name);
      setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
      addLog('ISSUE', 'BOOK', issueModal.title, `Issued to ${student.name} (${student.className}-${student.section})`);
      showToast(`Book issued to ${student.name}`);
      setIssueModal(null);
      setSelectedStudentId('');
    } finally { setIsSubmitting(false); }
  };

  const handleReturnBook = async (bookId: string, studentId: string, studentName: string) => {
    const book = books.find(b => b.id === bookId);
    const updated = await principalService.returnBook(bookId, studentId);
    setBooks(prev => prev.map(b => b.id === updated.id ? updated : b));
    addLog('RETURN', 'BOOK', book?.title || 'Book', `Returned by ${studentName}`);
    showToast(`Book returned by ${studentName}`);
  };

  const handleAddEquipment = async () => {
    if (!eqForm.name.trim()) { showToast('Equipment name required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const eq = await principalService.addEquipment(eqForm);
      setEquipment(prev => [...prev, eq]);
      addLog('ADD', 'EQUIPMENT', eq.name, `${eq.quantity} units added to ${eq.labType} Lab`);
      showToast(`"${eq.name}" added`);
      setEqForm({ name: '', labType: 'SCIENCE', quantity: 1, workingCount: 1, lastServiced: new Date().toISOString().split('T')[0] });
      setAddEqModal(false);
    } finally { setIsSubmitting(false); }
  };

  const handleDeleteEq = async (id: string, name: string) => {
    await principalService.deleteEquipment(id);
    setEquipment(prev => prev.filter(e => e.id !== id));
    addLog('DELETE', 'EQUIPMENT', name, 'Equipment removed from lab');
    showToast(`"${name}" deleted`);
  };

  const handleUpdateWorking = async (eq: LabEquipment, delta: number) => {
    const newCount = Math.max(0, Math.min(eq.quantity, eq.workingCount + delta));
    const updated = await principalService.updateEquipment(eq.id, { workingCount: newCount });
    setEquipment(prev => prev.map(e => e.id === updated.id ? updated : e));
    const status = newCount < eq.quantity ? 'faulty' : 'working';
    addLog('UPDATE', 'EQUIPMENT', eq.name, `Working units: ${newCount}/${eq.quantity} (${status})`);
  };

  const tabs = [
    { key: 'LIBRARY' as Tab, label: 'Library', icon: Library },
    { key: 'LAB' as Tab, label: 'Lab', icon: FlaskConical },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Assets</h2>
          </div>
          <button
            onClick={() => tab === 'LIBRARY' ? setAddBookModal(true) : setAddEqModal(true)}
            className="p-2 bg-amber-500 text-white rounded-full shadow-md">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex border-t border-slate-100">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 ${tab === key ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Subtabs for Library */}
        {tab === 'LIBRARY' && (
          <div className="flex border-t border-slate-100 px-4">
            <button onClick={() => setLibrarySubTab('BOOKS')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${librarySubTab === 'BOOKS' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
              Books
            </button>
            <button onClick={() => setLibrarySubTab('HISTORY')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${librarySubTab === 'HISTORY' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400'}`}>
              History
            </button>
          </div>
        )}

        {/* Subtabs for Lab */}
        {tab === 'LAB' && (
          <div className="flex border-t border-slate-100 px-4">
            <button onClick={() => setLabSubTab('EQUIPMENT')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${labSubTab === 'EQUIPMENT' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
              Equipment
            </button>
            <button onClick={() => setLabSubTab('HISTORY')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${labSubTab === 'HISTORY' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400'}`}>
              History
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">

        {/* LIBRARY */}
        {tab === 'LIBRARY' && librarySubTab === 'BOOKS' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Books', val: books.reduce((a, b) => a + b.totalCopies, 0) },
                { label: 'Available', val: books.reduce((a, b) => a + b.availableCopies, 0), c: 'text-emerald-600' },
                { label: 'Issued', val: books.reduce((a, b) => a + b.issuedTo.filter(i => !i.returnedAt).length, 0), c: 'text-amber-600' },
              ].map(({ label, val, c }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-xl font-black ${c ?? 'text-slate-900'}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={bookSearch} onChange={e => setBookSearch(e.target.value)}
                placeholder="Search books by title, author, subject…"
                className="w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-3 font-bold text-sm outline-none shadow-sm" />
            </div>

            {filteredBooks.map(book => (
              <div key={book.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm truncate">{book.title}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{book.author} · {book.subject}</div>
                    <div className="text-[10px] font-bold text-slate-300">ISBN: {book.isbn}</div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <div className="text-xs font-black text-emerald-600">{book.availableCopies} avail</div>
                    <div className="text-[10px] font-bold text-slate-400">of {book.totalCopies}</div>
                  </div>
                </div>

                {/* Active issues */}
                {book.issuedTo.filter(i => !i.returnedAt).length > 0 && (
                  <div className="border-t border-slate-50 pt-2 mt-2 space-y-1.5">
                    {book.issuedTo.filter(i => !i.returnedAt).map(issue => (
                      <div key={issue.studentId} className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-slate-600">{issue.studentName}</span>
                          <span className="text-[9px] font-bold text-amber-600 ml-2">Due: {issue.dueDate}</span>
                        </div>
                        <button onClick={() => handleReturnBook(book.id, issue.studentId, issue.studentName)}
                          className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                          <RotateCcw size={9} /> Return
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3 pt-2 border-t border-slate-50">
                  {book.availableCopies > 0 && (
                    <button onClick={() => { setIssueModal(book); setSelectedStudentId(students[0]?.id ?? ''); }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-[10px] font-black text-blue-700 bg-blue-50 py-2 rounded-xl">
                      <UserCheck size={12} /> Issue to Student
                    </button>
                  )}
                  <button onClick={() => handleDeleteBook(book.id, book.title)}
                    className="flex items-center justify-center gap-1 text-[10px] font-black text-rose-600 bg-rose-50 px-3 py-2 rounded-xl">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {filteredBooks.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <BookOpen size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">{bookSearch ? 'No books found' : 'No books added yet'}</p>
              </div>
            )}
          </>
        )}

        {/* LIBRARY HISTORY */}
        {tab === 'LIBRARY' && librarySubTab === 'HISTORY' && (
          <>
            {logs.filter(l => l.category === 'BOOK').length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <HistoryIcon size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No history yet</p>
              </div>
            ) : (
              logs.filter(l => l.category === 'BOOK').map(log => (
                <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-extrabold text-slate-900 text-sm">{log.itemName}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1">{log.details}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-black px-2 py-1 rounded-full bg-slate-100 text-slate-600">{log.type}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-2">{log.timestamp}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* LAB */}
        {tab === 'LAB' && labSubTab === 'EQUIPMENT' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Items', val: equipment.reduce((a, e) => a + e.quantity, 0) },
                { label: 'Working', val: equipment.reduce((a, e) => a + e.workingCount, 0), c: 'text-emerald-600' },
                { label: 'Faulty', val: equipment.reduce((a, e) => a + (e.quantity - e.workingCount), 0), c: 'text-rose-500' },
              ].map(({ label, val, c }) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className={`text-xl font-black ${c ?? 'text-slate-900'}`}>{val}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={eqSearch} onChange={e => setEqSearch(e.target.value)}
                placeholder="Search equipment…"
                className="w-full bg-white border border-slate-200 rounded-2xl pl-9 pr-4 py-3 font-bold text-sm outline-none shadow-sm" />
            </div>

            {filteredEq.map(eq => (
              <div key={eq.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{eq.name}</div>
                    <div className="flex gap-2 mt-1.5">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${labTypeColor(eq.labType)}`}>{eq.labType}</span>
                      <span className="text-[10px] font-bold text-slate-400">Serviced: {eq.lastServiced}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <div className={`text-sm font-black ${eq.workingCount === eq.quantity ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {eq.workingCount}/{eq.quantity}
                      </div>
                      <div className="text-[9px] font-bold text-slate-400">working</div>
                    </div>
                    <button onClick={() => handleDeleteEq(eq.id, eq.name)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Working count adjuster */}
                <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Working Units</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleUpdateWorking(eq, -1)} disabled={eq.workingCount === 0}
                      className="w-7 h-7 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-black text-sm disabled:opacity-30">−</button>
                    <span className="font-black text-slate-900 text-base w-8 text-center">{eq.workingCount}</span>
                    <button onClick={() => handleUpdateWorking(eq, 1)} disabled={eq.workingCount >= eq.quantity}
                      className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-black text-sm disabled:opacity-30">+</button>
                  </div>
                </div>

                {eq.workingCount < eq.quantity && (
                  <div className="flex items-center gap-1 mt-2 text-[10px] font-black text-rose-500">
                    <Wrench size={10} /> {eq.quantity - eq.workingCount} faulty unit{eq.quantity - eq.workingCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}

            {filteredEq.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <FlaskConical size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">{eqSearch ? 'No equipment found' : 'No equipment added yet'}</p>
              </div>
            )}
          </>
        )}

        {/* LAB HISTORY */}
        {tab === 'LAB' && labSubTab === 'HISTORY' && (
          <>
            {logs.filter(l => l.category === 'EQUIPMENT').length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <HistoryIcon size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No history yet</p>
              </div>
            ) : (
              logs.filter(l => l.category === 'EQUIPMENT').map(log => (
                <div key={log.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-extrabold text-slate-900 text-sm">{log.itemName}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1">{log.details}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-black px-2 py-1 rounded-full bg-slate-100 text-slate-600">{log.type}</div>
                      <div className="text-[9px] font-bold text-slate-400 mt-2">{log.timestamp}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Add Book Modal */}
      {addBookModal && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-8 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-lg">Add New Book</h3>
              <button onClick={() => setAddBookModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            {[
              { label: 'Title *', key: 'title', placeholder: 'Book title' },
              { label: 'Author', key: 'author', placeholder: 'Author name' },
              { label: 'ISBN', key: 'isbn', placeholder: '978-XXXXXXXXX' },
              { label: 'Subject', key: 'subject', placeholder: 'e.g. Mathematics' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
                <input value={(bookForm as any)[key]} onChange={e => setBookForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
              </div>
            ))}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Total Copies</label>
              <input type="number" min="1" value={bookForm.totalCopies} onChange={e => setBookForm(f => ({ ...f, totalCopies: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <button onClick={handleAddBook} disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {isSubmitting ? 'Adding…' : <><Plus size={16} /> Add Book</>}
            </button>
          </div>
        </div>
      )}

      {/* Issue Book Modal */}
      {issueModal && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900">Issue Book</h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{issueModal.title}</p>
              </div>
              <button onClick={() => setIssueModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Select Student</label>
              <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500">
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.className}-{s.section}</option>
                ))}
              </select>
            </div>
            <button onClick={handleIssueBook} disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {isSubmitting ? 'Issuing…' : <><UserCheck size={16} /> Issue Book</>}
            </button>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {addEqModal && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-8 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-lg">Add Equipment</h3>
              <button onClick={() => setAddEqModal(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                <X size={16} className="text-slate-500" />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Name *</label>
              <input value={eqForm.name} onChange={e => setEqForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Equipment name"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Lab Type</label>
              <div className="flex gap-2">
                {(['SCIENCE', 'COMPUTER', 'LANGUAGE'] as const).map(t => (
                  <button key={t} onClick={() => setEqForm(f => ({ ...f, labType: t }))}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-colors ${eqForm.labType === t ? 'bg-amber-500 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Total Qty</label>
                <input type="number" min="1" value={eqForm.quantity} onChange={e => setEqForm(f => ({ ...f, quantity: +e.target.value, workingCount: Math.min(f.workingCount, +e.target.value) }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Working</label>
                <input type="number" min="0" max={eqForm.quantity} value={eqForm.workingCount} onChange={e => setEqForm(f => ({ ...f, workingCount: +e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Last Serviced</label>
              <input type="date" value={eqForm.lastServiced} onChange={e => setEqForm(f => ({ ...f, lastServiced: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <button onClick={handleAddEquipment} disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {isSubmitting ? 'Adding…' : <><Plus size={16} /> Add Equipment</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
