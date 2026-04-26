import React, { useEffect, useState } from 'react';
import { ArrowLeft, Settings, Plus, Trash2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { AcademicYearConfig, ClassConfig } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type Tab = 'ACADEMIC' | 'CLASSES' | 'PROMOTION';

interface Props { onBack: () => void; }

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge'];

export const SettingsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('ACADEMIC');
  const [configs, setConfigs] = useState<AcademicYearConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<AcademicYearConfig | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');

  useEffect(() => {
    principalService.getAYConfig().then(data => {
      setConfigs(data);
      setActiveConfig(data.find(c => c.isActive) ?? data[0] ?? null);
    });
  }, []);

  const handleSaveBoard = async (board: string) => {
    if (!activeConfig) return;
    setIsSaving(true);
    try {
      const updated = await principalService.updateAYConfig(activeConfig.id, { board });
      setActiveConfig(updated);
      setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
      showToast('Board updated');
    } finally { setIsSaving(false); }
  };

  const handleAddClass = async () => {
    if (!activeConfig || !newClassName.trim()) { showToast('Class name required', 'error'); return; }
    const newClasses = [...activeConfig.classes, { name: newClassName.trim(), sections: ['A'] }];
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setNewClassName('');
    showToast(`${newClassName} added`);
  };

  const handleAddSection = async (className: string) => {
    if (!activeConfig || !newSection.trim()) { showToast('Section letter required', 'error'); return; }
    const newClasses = activeConfig.classes.map(c =>
      c.name === className ? { ...c, sections: [...c.sections, newSection.trim().toUpperCase()] } : c
    );
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    setNewSection('');
    showToast(`Section ${newSection.toUpperCase()} added to ${className}`);
  };

  const handleRemoveSection = async (className: string, section: string) => {
    if (!activeConfig) return;
    const newClasses = activeConfig.classes.map(c =>
      c.name === className ? { ...c, sections: c.sections.filter(s => s !== section) } : c
    );
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const handleRemoveClass = async (className: string) => {
    if (!activeConfig) return;
    const newClasses = activeConfig.classes.filter(c => c.name !== className);
    const updated = await principalService.updateAYConfig(activeConfig.id, { classes: newClasses });
    setActiveConfig(updated);
    setConfigs(prev => prev.map(c => c.id === updated.id ? updated : c));
    showToast(`${className} removed`);
  };

  const tabs = [
    { key: 'ACADEMIC' as Tab, label: 'Academic Year' },
    { key: 'CLASSES' as Tab, label: 'Classes' },
    { key: 'PROMOTION' as Tab, label: 'Promotion' },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Settings</h2>
        </div>
        <div className="flex border-t border-slate-100">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 ${tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">

        {/* ACADEMIC YEAR TAB */}
        {tab === 'ACADEMIC' && activeConfig && (
          <>
            {/* AY switcher */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Academic Year</p>
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {configs.map(c => (
                  <button key={c.id} onClick={() => setActiveConfig(c)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${activeConfig.id === c.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                    {c.label} {c.isActive && '●'}
                  </button>
                ))}
              </div>
            </div>

            {/* AY details */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Year Details</p>
              {[
                { label: 'Label', val: activeConfig.label },
                { label: 'Start Date', val: activeConfig.startDate },
                { label: 'End Date', val: activeConfig.endDate },
                { label: 'Status', val: activeConfig.isActive ? '● Active' : 'Inactive' },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] font-bold text-slate-400">{label}</span>
                  <span className={`text-xs font-black ${label === 'Status' && activeConfig.isActive ? 'text-emerald-600' : 'text-slate-700'}`}>{val}</span>
                </div>
              ))}
            </div>

            {/* Board */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Board Affiliation</p>
              <div className="flex flex-wrap gap-2">
                {BOARDS.map(board => (
                  <button key={board} onClick={() => handleSaveBoard(board)}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${activeConfig.board === board ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                    {board}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* CLASSES TAB */}
        {tab === 'CLASSES' && activeConfig && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Add New Class</p>
              <div className="flex gap-2">
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. Class 11"
                  className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-slate-900" />
                <button onClick={handleAddClass} className="p-3 bg-slate-900 text-white rounded-xl">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {activeConfig.classes.map(cls => (
                <div key={cls.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedClass(expandedClass === cls.name ? null : cls.name)}
                    className="w-full flex items-center justify-between p-4">
                    <span className="font-extrabold text-slate-900 text-sm">{cls.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400">{cls.sections.length} sections</span>
                      <button onClick={e => { e.stopPropagation(); handleRemoveClass(cls.name); }}
                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
                      {expandedClass === cls.name ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  {expandedClass === cls.name && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
                      <div className="flex flex-wrap gap-2 pt-3">
                        {cls.sections.map(sec => (
                          <div key={sec} className="flex items-center gap-1 bg-slate-100 rounded-xl pl-3 pr-2 py-1.5">
                            <span className="text-xs font-black text-slate-700">Section {sec}</span>
                            <button onClick={() => handleRemoveSection(cls.name, sec)} className="text-slate-400 hover:text-rose-500">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={expandedClass === cls.name ? newSection : ''}
                          onChange={e => setNewSection(e.target.value)}
                          placeholder="Section letter (e.g. C)"
                          className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none" />
                        <button onClick={() => handleAddSection(cls.name)} className="p-2.5 bg-indigo-600 text-white rounded-xl">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* PROMOTION TAB */}
        {tab === 'PROMOTION' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Promotion Logic</p>
              {[
                { label: 'Minimum Attendance for Promotion', val: '75%' },
                { label: 'Minimum Pass Percentage', val: '33%' },
                { label: 'Grace Marks', val: 'Up to 5 marks per subject' },
                { label: 'Compartmental Policy', val: 'Max 2 subjects allowed' },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 flex-1">{label}</span>
                  <span className="text-[11px] font-black text-slate-900 text-right">{val}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-xs font-black text-amber-700">Promotion rules are configured by the school board. Contact admin to modify these values.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
