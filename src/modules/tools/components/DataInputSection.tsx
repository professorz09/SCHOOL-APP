// DataInputSection — class-first picker with inline editing.
//
// Flow:
//   1. Pick a class from the dropdown → all students auto-load as
//      editable cards (each with a checkbox + inline fields).
//   2. Uncheck students you don't want in the output.
//   3. Edit any field directly (fix missing DOB, add subject for
//      admit card, etc.) — edits stick to that row.
//   4. Optionally add manual rows for non-roster cases (guest student,
//      transfer-in mid-batch, etc.) — they live alongside class rows.
//
// The `data` array passed to the parent always reflects (checked class
// students with current edits) + (all manual rows in order).

import React, { useEffect, useState } from 'react';
import { X, Plus, Users, Check, ChevronDown, Pencil } from 'lucide-react';
import type { Student } from '@/modules/students/student.types';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

interface Props {
  data: Record<string, unknown>[];
  setData: (data: Record<string, unknown>[]) => void;
  fields: FieldDef[];
  title: string;
  students?: Student[];
  mapStudent?: (s: Student) => Record<string, unknown>;
}

interface ClassRow {
  studentId: string;
  studentName: string;
  rollNo: string;
  admissionNo: string;
  values: Record<string, unknown>;
  included: boolean;
}

export const DataInputSection: React.FC<Props> = ({
  data, setData, fields, title, students, mapStudent,
}) => {
  const [tab, setTab] = useState<'CLASS' | 'MANUAL'>('CLASS');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [classRows, setClassRows] = useState<ClassRow[]>([]);
  const [manualRows, setManualRows] = useState<Record<string, unknown>[]>([]);
  // Per-row expand state — kept here (not on classRows) so opening an
  // edit panel doesn't itself trigger a rebuild of the row data.
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Build class+section list from school roster.
  const classes = React.useMemo(() => {
    if (!students) return [];
    const set = new Map<string, { key: string; className: string; section: string; count: number }>();
    for (const s of students) {
      if (!s.className) continue;
      const k = `${s.className}|${s.section}`;
      const e = set.get(k) ?? { key: k, className: s.className, section: s.section, count: 0 };
      e.count++;
      set.set(k, e);
    }
    return Array.from(set.values()).sort((a, b) =>
      `${a.className}-${a.section}`.localeCompare(`${b.className}-${b.section}`));
  }, [students]);

  // When the principal picks a new class, build editable rows from the
  // roster. We rebuild when `mapStudent`'s identity changes too — that
  // lets the parent tool (e.g. IdCardTool) refresh rows after async
  // resources like signed photo URLs finish loading. User edits are
  // preserved by merging onto existing classRows[i].values instead of
  // overwriting.
  useEffect(() => {
    if (!selectedClass || !students || !mapStudent) {
      setClassRows([]);
      return;
    }
    const [cn, sec] = selectedClass.split('|');
    const sourceList = students.filter(s => s.className === cn && s.section === sec);
    setClassRows(prev => {
      const prevById = new Map<string, ClassRow>(prev.map(r => [r.studentId, r]));
      return sourceList.map(s => {
        const existing = prevById.get(s.id);
        const fresh = mapStudent(s);
        // Merge: keep any field the user already edited (non-empty),
        // refresh anything that was blank with the freshly mapped value.
        const merged: Record<string, unknown> = { ...fresh };
        if (existing) {
          for (const [k, v] of Object.entries(existing.values)) {
            if (v !== '' && v !== undefined && v !== null) merged[k] = v;
          }
        }
        return {
          studentId: s.id,
          studentName: s.name,
          rollNo: s.rollNo || '',
          admissionNo: s.admissionNo,
          values: merged,
          included: existing ? existing.included : true,
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, students, mapStudent]);

  // Whenever class rows or manual rows change, emit the combined data
  // (checked class rows + manual rows) upward. Manual rows always
  // append at the end so output order is predictable.
  useEffect(() => {
    const out: Record<string, unknown>[] = [];
    for (const r of classRows) if (r.included) out.push(r.values);
    for (const r of manualRows) out.push(r);
    setData(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classRows, manualRows]);

  const toggleInclude = (i: number) => {
    setClassRows(rows => rows.map((r, idx) => idx === i ? { ...r, included: !r.included } : r));
  };

  const setAllIncluded = (v: boolean) => {
    setClassRows(rows => rows.map(r => ({ ...r, included: v })));
  };

  const updateClassField = (i: number, key: string, val: string) => {
    setClassRows(rows => rows.map((r, idx) =>
      idx === i ? { ...r, values: { ...r.values, [key]: val } } : r,
    ));
  };

  const updateManualField = (i: number, key: string, val: string) => {
    setManualRows(rows => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  const addManual = () => {
    const row: Record<string, unknown> = {};
    fields.forEach(f => { row[f.key] = ''; });
    setManualRows(rows => [...rows, row]);
  };

  const removeManual = (i: number) => {
    setManualRows(rows => rows.filter((_, idx) => idx !== i));
  };

  const selectedCount = classRows.filter(r => r.included).length + manualRows.length;
  const totalAvailable = classRows.length + manualRows.length;

  const hasRoster = !!(students && mapStudent && classes.length > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 no-print">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-bold text-gray-900">{title}</h2>
        {selectedCount > 0 && (
          <span className="text-[10px] font-black bg-green-100 text-green-700 px-2 py-1 rounded-md uppercase tracking-widest">
            {selectedCount} ready
          </span>
        )}
      </div>

      {/* Tabs: From Class | Manual */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl mb-5">
        <button onClick={() => setTab('CLASS')}
          disabled={!hasRoster}
          className={`py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors ${
            tab === 'CLASS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 disabled:opacity-40'
          }`}>
          From Class
        </button>
        <button onClick={() => setTab('MANUAL')}
          className={`py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-colors ${
            tab === 'MANUAL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}>
          Manual
        </button>
      </div>

      {/* FROM CLASS tab */}
      {tab === 'CLASS' && (
        <>
          {hasRoster ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Pick a class</label>
                <div className="relative">
                  <select value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="w-full appearance-none px-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-sm md:text-base focus:outline-none focus:border-green-500 pr-10">
                    <option value="">— Choose class / section —</option>
                    {classes.map(c => (
                      <option key={c.key} value={c.key}>{c.className}-{c.section} · {c.count} students</option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {selectedClass && (
                  <p className="text-xs font-medium text-gray-500 mt-2">
                    Uncheck students you don't want · tap any input below to edit (e.g. fill missing DOB).
                  </p>
                )}
              </div>

              {classRows.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{classRows.length} students</span>
                    <div className="flex gap-2">
                      <button onClick={() => setAllIncluded(true)}
                        className="text-[10px] font-bold text-green-700 hover:text-green-900 uppercase tracking-widest">All</button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => setAllIncluded(false)}
                        className="text-[10px] font-bold text-gray-500 hover:text-gray-900 uppercase tracking-widest">None</button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
                    {classRows.map((row, i) => {
                      const expanded = expandedRowId === row.studentId;
                      return (
                        <div key={row.studentId}
                          className={`rounded-xl border transition-colors overflow-hidden ${
                            row.included
                              ? expanded ? 'bg-white border-green-300 shadow-sm' : 'bg-white border-green-100 hover:border-green-200'
                              : 'bg-gray-50 border-gray-100 opacity-60'
                          }`}>
                          {/* Compact one-line row: checkbox + name + edit chevron */}
                          <div className="flex items-center gap-3 px-3 py-2.5">
                            <button onClick={() => toggleInclude(i)}
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                row.included ? 'bg-green-600 text-white' : 'bg-white border-2 border-gray-200'
                              }`}>
                              {row.included && <Check size={12} strokeWidth={3} />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm text-gray-900 truncate leading-tight">{row.studentName}</div>
                              <div className="text-[10px] font-medium text-gray-500 truncate">
                                Roll {row.rollNo || '—'} · {row.admissionNo}
                              </div>
                            </div>
                            {row.included && (
                              <button onClick={() => setExpandedRowId(expanded ? null : row.studentId)}
                                className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                  expanded ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
                                }`}>
                                <Pencil size={11} /> {expanded ? 'Done' : 'Edit'}
                              </button>
                            )}
                          </div>
                          {/* Inline editor only when expanded */}
                          {expanded && row.included && (
                            <div className="border-t border-green-100 bg-green-50/30 px-3 pt-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {fields.map(f => (
                                <div key={f.key}>
                                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1 block">{f.label}</label>
                                  <input type="text" value={(row.values[f.key] ?? '') as string}
                                    onChange={e => updateClassField(i, f.key, e.target.value)}
                                    placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                                    className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-10 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl">
              <Users size={32} className="text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-bold mb-1">No students yet</p>
              <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">
                Add students from <span className="font-bold">Students → New Admission</span> first, or switch to the <span className="font-bold">Manual</span> tab.
              </p>
            </div>
          )}
        </>
      )}

      {/* MANUAL tab */}
      {tab === 'MANUAL' && (
        <>
          {manualRows.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl">
              <Plus size={32} className="text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-bold mb-1">No manual rows yet</p>
              <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto mb-4">
                Use this for one-off cards / certificates not in the school roster.
              </p>
              <button onClick={addManual}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-black hover:bg-gray-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">
                <Plus size={16} /> Add Your First Row
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {manualRows.map((row, i) => (
                <div key={i} className="rounded-xl border-2 border-gray-200 p-3 md:p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Manual #{i + 1}</span>
                    <button onClick={() => removeManual(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {fields.map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1 block">{f.label}</label>
                        <input type="text" value={(row[f.key] ?? '') as string}
                          onChange={e => updateManualField(i, f.key, e.target.value)}
                          placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                          className="w-full px-3 py-2.5 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-900 focus:outline-none focus:border-blue-500 placeholder:text-gray-400" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addManual}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 border-2 border-dashed border-gray-300 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">
                <Plus size={16} /> Add Another Row
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
