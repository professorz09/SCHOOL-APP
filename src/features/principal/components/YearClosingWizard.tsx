import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle2, AlertTriangle, ChevronRight,
  Lock, Sparkles, CreditCard, Users, BarChart3, Clock,
} from 'lucide-react';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { yearClosingService, streamService } from '../../../services/yearClosing.service';
import type {
  PreClosingChecklist,
  YearClosingPreview,
  YearClosingConfig,
  StreamDefinition,
} from '../../../types/yearClosing.types';

type WizardStep = 'PRE_CHECKS' | 'CONFIGURATION' | 'PREVIEW' | 'FINAL_COMMIT' | 'DONE';

interface Props {
  onBack: () => void;
}

export const YearClosingWizard: React.FC<Props> = ({ onBack }) => {
  const { activeYear, lockYear, addAcademicYear } = useAcademicYear();
  const [step, setStep] = useState<WizardStep>('PRE_CHECKS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step data
  const [checklist, setChecklist] = useState<PreClosingChecklist | null>(null);
  const [config, setConfig] = useState<Partial<YearClosingConfig> | null>(null);
  const [configId, setConfigId] = useState<string>('');
  const [preview, setPreview] = useState<YearClosingPreview | null>(null);
  const [result, setResult] = useState<any>(null);

  // Configuration form state
  const [nextYearName, setNextYearName] = useState('');
  const [nextStartDate, setNextStartDate] = useState('');
  const [nextEndDate, setNextEndDate] = useState('');
  const [board, setBoard] = useState('CBSE');
  const [streams, setStreams] = useState<StreamDefinition[]>([
    { id: '1', name: 'Science-PCM', capacity: 40, currentCount: 0 },
    { id: '2', name: 'Science-PCB', capacity: 40, currentCount: 0 },
    { id: '3', name: 'Commerce', capacity: 40, currentCount: 0 },
    { id: '4', name: 'Arts', capacity: 40, currentCount: 0 },
  ]);
  const [outstandingHandling, setOutstandingHandling] = useState<'WRITEOFF' | 'ARREARS'>('WRITEOFF');
  const [carryForward, setCarryForward] = useState({
    staff: true,
    vehicles: true,
    feeStructure: true,
    timetable: true,
  });

  // Load pre-closing checklist
  useEffect(() => {
    if (step === 'PRE_CHECKS' && activeYear && !checklist) {
      setLoading(true);
      yearClosingService.getPreClosingChecklist(activeYear.id)
        .then(setChecklist)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [step, activeYear, checklist]);

  const handleProceedToConfig = () => {
    if (checklist?.status === 'READY') {
      setStep('CONFIGURATION');
    } else {
      setError('Cannot proceed: Outstanding fees or salary exist');
    }
  };

  const handleSaveConfig = () => {
    if (!activeYear) return;
    if (!nextYearName.trim()) {
      setError('Academic year name is required');
      return;
    }
    if (!nextStartDate || !nextEndDate) {
      setError('Start and end dates are required');
      return;
    }

    const newConfig: YearClosingConfig = {
      id: `config_${Date.now()}`,
      fromYearId: activeYear.id,
      nextYearName,
      nextYearStartDate: nextStartDate,
      nextYearEndDate: nextEndDate,
      board,
      streams: streams.filter(s => s.capacity > 0),
      outstandingDuesHandling: outstandingHandling,
      carryForward,
      status: 'PENDING_COMMIT',
      createdDate: new Date().toISOString(),
    };

    const saved = yearClosingService.saveConfig(newConfig);
    setConfig(saved);
    setConfigId(saved.id);
    setStep('PREVIEW');
  };

  const handlePreview = async () => {
    if (!configId) return;
    setLoading(true);
    try {
      const previewData = await yearClosingService.simulateYearClosing(configId);
      setPreview(previewData);
      setStep('FINAL_COMMIT');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!configId || !activeYear) return;
    setLoading(true);
    try {
      const closeResult = await yearClosingService.commitYearClosing(
        configId,
        // Callback: create new year
        (yearData) => {
          return addAcademicYear({
            name: yearData.name,
            startDate: yearData.startDate,
            endDate: yearData.endDate,
            board: yearData.board,
          });
        },
        // Callback: lock old year
        (yearId) => lockYear(yearId)
      );
      setResult(closeResult);
      setStep('DONE');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && step === 'PRE_CHECKS') {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'DONE' && result) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col items-center justify-center animate-in fade-in duration-500 p-8">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 text-center">{result.newYearName} Ready!</h2>
        <p className="text-sm font-bold text-slate-400 text-center mt-3 max-w-xs">
          Year {result.summary.oldYearLocked} is now locked (read-only). New academic year is active.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-8 w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl border border-slate-100 p-3">
            <div className="text-xl font-black text-emerald-600">{result.summary.studentsPromoted}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Promoted</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3">
            <div className="text-xl font-black text-amber-600">{result.summary.studentsDetained}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Detained</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3">
            <div className="text-xl font-black text-blue-600">{result.summary.streamsAssigned}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Streams</div>
          </div>
        </div>
        <button
          onClick={onBack}
          className="mt-8 w-full max-w-sm py-3 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full hover:bg-slate-200">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900">Year Closing Wizard</h2>
            <p className="text-[10px] font-bold text-slate-400">{activeYear?.name ?? 'Academic Year'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(['PRE_CHECKS', 'CONFIGURATION', 'PREVIEW', 'FINAL_COMMIT'] as WizardStep[]).map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black transition-all ${
                  step === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <span>{i + 1}</span>
                <span className="hidden sm:inline uppercase tracking-widest">
                  {s === 'PRE_CHECKS' ? 'Checks' : s === 'CONFIGURATION' ? 'Config' : s === 'PREVIEW' ? 'Preview' : 'Commit'}
                </span>
              </div>
              {i < 3 && <ChevronRight size={14} className="text-slate-300 hidden sm:block" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        {/* PRE_CHECKS STEP */}
        {step === 'PRE_CHECKS' && checklist && (
          <PreChecklistStage checklist={checklist} onProceed={handleProceedToConfig} />
        )}

        {/* CONFIGURATION STEP */}
        {step === 'CONFIGURATION' && (
          <ConfigurationStage
            nextYearName={nextYearName}
            setNextYearName={setNextYearName}
            nextStartDate={nextStartDate}
            setNextStartDate={setNextStartDate}
            nextEndDate={nextEndDate}
            setNextEndDate={setNextEndDate}
            board={board}
            setBoard={setBoard}
            streams={streams}
            setStreams={setStreams}
            outstandingHandling={outstandingHandling}
            setOutstandingHandling={setOutstandingHandling}
            carryForward={carryForward}
            setCarryForward={setCarryForward}
            onSave={handleSaveConfig}
          />
        )}

        {/* PREVIEW STEP */}
        {step === 'PREVIEW' && (
          <PreviewStage
            preview={preview}
            config={config}
            loading={loading}
            onLoadPreview={handlePreview}
          />
        )}

        {/* FINAL_COMMIT STEP */}
        {step === 'FINAL_COMMIT' && preview && (
          <FinalCommitStage
            preview={preview}
            loading={loading}
            onCommit={handleCommit}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="fixed bottom-20 left-4 right-4 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs font-bold text-rose-600">
          {error}
          <button
            onClick={() => setError('')}
            className="float-right text-rose-400 hover:text-rose-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 flex gap-3">
        {step === 'PRE_CHECKS' && (
          <button
            onClick={() => setStep('CONFIGURATION')}
            disabled={checklist?.status !== 'READY'}
            className="flex-1 py-3 bg-slate-900 text-white font-black rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-slate-800"
          >
            <Users size={16} /> Configure
          </button>
        )}
        {step === 'CONFIGURATION' && (
          <>
            <button
              onClick={() => setStep('PRE_CHECKS')}
              className="flex-1 py-3 border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleSaveConfig}
              className="flex-1 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700"
            >
              Preview
            </button>
          </>
        )}
        {step === 'PREVIEW' && (
          <>
            <button
              onClick={() => setStep('CONFIGURATION')}
              className="flex-1 py-3 border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={loading}
              className="flex-1 py-3 bg-blue-600 text-white font-black rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2 hover:bg-blue-700"
            >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Validating...' : 'Validate'}
            </button>
          </>
        )}
        {step === 'FINAL_COMMIT' && (
          <>
            <button
              onClick={() => setStep('PREVIEW')}
              className="flex-1 py-3 border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2 hover:bg-rose-700"
            >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={16} />}
              {loading ? 'Closing...' : 'Close Year'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const PreChecklistStage: React.FC<{ checklist: PreClosingChecklist; onProceed: () => void }> = ({
  checklist,
  onProceed,
}) => (
  <div className="space-y-4 max-w-2xl">
    <div>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Pre-Closing Checklist</p>
    </div>

    {/* Fees */}
    <div
      className={`p-4 rounded-2xl border ${
        checklist.feesPending.total === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-900 flex items-center gap-2">
            <CreditCard size={18} />
            Outstanding Fees
          </h4>
          {checklist.feesPending.total > 0 && (
            <div className="mt-2 text-sm font-bold text-rose-600">
              ₹{checklist.feesPending.total.toLocaleString()} from {checklist.feesPending.count} student(s)
            </div>
          )}
        </div>
        <div
          className={`text-2xl font-black ${
            checklist.feesPending.total === 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {checklist.feesPending.total === 0 ? '✓' : '✗'}
        </div>
      </div>
    </div>

    {/* Salary */}
    <div
      className={`p-4 rounded-2xl border ${
        checklist.salaryPending.total === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-900 flex items-center gap-2">
            <Users size={18} />
            Outstanding Salary
          </h4>
          {checklist.salaryPending.total > 0 && (
            <div className="mt-2 text-sm font-bold text-rose-600">
              ₹{checklist.salaryPending.total.toLocaleString()} for {checklist.salaryPending.count} staff
            </div>
          )}
        </div>
        <div
          className={`text-2xl font-black ${
            checklist.salaryPending.total === 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {checklist.salaryPending.total === 0 ? '✓' : '✗'}
        </div>
      </div>
    </div>

    {/* Results */}
    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-900 flex items-center gap-2">
            <BarChart3 size={18} />
            Results Entered
          </h4>
          <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${checklist.resultsCompletion.percentage}%` }}
            />
          </div>
          <div className="mt-1 text-xs font-bold text-slate-600">
            {checklist.resultsCompletion.percentage.toFixed(0)}%
          </div>
        </div>
      </div>
    </div>

    {/* Attendance */}
    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-black text-slate-900 flex items-center gap-2">
            <Clock size={18} />
            Attendance Marked
          </h4>
          <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${checklist.attendanceCompletion.percentage}%` }}
            />
          </div>
          <div className="mt-1 text-xs font-bold text-slate-600">
            {checklist.attendanceCompletion.percentage.toFixed(0)}%
          </div>
        </div>
      </div>
    </div>

    {/* Warnings */}
    {checklist.warnings.length > 0 && (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
        <p className="text-xs font-bold text-amber-700">
          {checklist.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </p>
      </div>
    )}

    {checklist.status === 'NOT_READY' && (
      <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-600">
        ⛔ {checklist.blockers.map((b, i) => <div key={i}>{b}</div>)}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const ConfigurationStage: React.FC<any> = ({
  nextYearName,
  setNextYearName,
  nextStartDate,
  setNextStartDate,
  nextEndDate,
  setNextEndDate,
  board,
  setBoard,
  streams,
  setStreams,
  outstandingHandling,
  setOutstandingHandling,
  carryForward,
  setCarryForward,
  onSave,
}) => (
  <div className="space-y-4 max-w-2xl">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Configuration</p>

    <input
      type="text"
      placeholder="2025-2026"
      value={nextYearName}
      onChange={(e) => setNextYearName(e.target.value)}
      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-900 placeholder:text-slate-300"
    />

    <div className="grid grid-cols-2 gap-3">
      <input
        type="date"
        value={nextStartDate}
        onChange={(e) => setNextStartDate(e.target.value)}
        className="px-3 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-900 text-sm"
      />
      <input
        type="date"
        value={nextEndDate}
        onChange={(e) => setNextEndDate(e.target.value)}
        className="px-3 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-900 text-sm"
      />
    </div>

    <div>
      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Board</label>
      <select
        value={board}
        onChange={(e) => setBoard(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg font-bold text-slate-900"
      >
        <option>CBSE</option>
        <option>RBSE</option>
        <option>ICSE</option>
      </select>
    </div>

    <div>
      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Class 11 Streams</label>
      <div className="space-y-2">
        {streams.map((stream, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              value={stream.name}
              disabled
              className="flex-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-900 text-sm"
            />
            <input
              type="number"
              min="0"
              value={stream.capacity}
              onChange={(e) => {
                const updated = [...streams];
                updated[idx].capacity = parseInt(e.target.value) || 0;
                setStreams(updated);
              }}
              className="w-20 px-3 py-2 border border-slate-200 rounded-lg font-bold text-slate-900 text-sm"
              placeholder="Capacity"
            />
          </div>
        ))}
      </div>
    </div>

    <div>
      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Outstanding Dues</label>
      <div className="space-y-2">
        {[
          { value: 'WRITEOFF', label: 'Write off (bad debt)' },
          { value: 'ARREARS', label: 'Carry as arrears to new year' },
        ].map((opt: any) => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="outstanding"
              value={opt.value}
              checked={outstandingHandling === opt.value}
              onChange={(e) => setOutstandingHandling(e.target.value as any)}
              className="w-4 h-4"
            />
            <span className="text-sm font-bold text-slate-700">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>

    <div>
      <label className="text-xs font-black uppercase text-slate-400 mb-2 block">Carry Forward</label>
      <div className="space-y-2">
        {[
          { key: 'staff', label: 'Staff assignments' },
          { key: 'vehicles', label: 'Vehicles & routes' },
          { key: 'feeStructure', label: 'Fee structure' },
          { key: 'timetable', label: 'Timetable' },
        ].map((item: any) => (
          <label key={item.key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={carryForward[item.key]}
              onChange={(e) => setCarryForward({ ...carryForward, [item.key]: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm font-bold text-slate-700">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const PreviewStage: React.FC<any> = ({ preview, config, loading, onLoadPreview }) => (
  <div className="space-y-4 max-w-2xl">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Preview & Validation</p>

    {!preview ? (
      <button
        onClick={onLoadPreview}
        disabled={loading}
        className="w-full py-3 bg-blue-600 text-white font-black rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2 hover:bg-blue-700"
      >
        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : ''}
        {loading ? 'Validating...' : 'Load Preview'}
      </button>
    ) : (
      <>
        {preview.errors.length > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
            <p className="text-xs font-bold text-rose-700">
              {preview.errors.map((e, i) => (
                <div key={i}>🔴 {e}</div>
              ))}
            </p>
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-xs font-bold text-amber-700">
              {preview.warnings.map((w, i) => (
                <div key={i}>🟡 {w}</div>
              ))}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Students', val: preview.summary.studentsTotal },
            { label: 'Promote', val: preview.summary.studentsToPromote },
            { label: 'Detain', val: preview.summary.studentsToDetain },
            { label: 'Graduate', val: preview.summary.studentsGraduating },
            { label: 'Streams', val: preview.summary.streamsToAssign },
            { label: 'Staff', val: preview.summary.staffToCarry },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-3 text-center">
              <div className="text-lg font-black text-slate-900">{item.val}</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.label}</div>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const FinalCommitStage: React.FC<any> = ({ preview, loading, onCommit }) => (
  <div className="space-y-4 max-w-2xl">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Final Confirmation</p>

    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
      <p className="text-xs font-bold text-blue-700">
        ℹ️ This action will LOCK the current year (read-only) and create a new active year. All student promotions and stream assignments will be applied.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {[
        { label: 'Promote', val: preview.summary.studentsToPromote, color: 'emerald' },
        { label: 'Detain', val: preview.summary.studentsToDetain, color: 'amber' },
        { label: 'Graduate', val: preview.summary.studentsGraduating, color: 'blue' },
        { label: 'Streams', val: preview.summary.streamsToAssign, color: 'purple' },
      ].map((item, i) => (
        <div key={i} className={`bg-${item.color}-50 rounded-2xl border border-${item.color}-200 p-3 text-center`}>
          <div className={`text-lg font-black text-${item.color}-600`}>{item.val}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.label}</div>
        </div>
      ))}
    </div>

    <label className="flex items-start gap-2 cursor-pointer p-3 bg-slate-50 rounded-2xl border border-slate-200">
      <input type="checkbox" required className="w-4 h-4 mt-1" />
      <span className="text-xs font-bold text-slate-700">
        I understand the current year will be LOCKED and cannot be modified further
      </span>
    </label>
  </div>
);
