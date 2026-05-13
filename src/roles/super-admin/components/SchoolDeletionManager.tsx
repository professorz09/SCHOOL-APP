import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, ShieldOff, Undo2, Trash2, Clock,
} from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { schoolService } from '@/shared/utils/school.service';

/**
 * Super-admin's central console for the three-stage school-deletion
 * workflow defined in migration 0127. Two distinct lists:
 *
 *   1. Pending requests — principals have asked to delete; super-admin
 *      reviews and either allows (flips the per-school flag ON) or
 *      revokes (flips it OFF). Allowing does NOT delete; it just
 *      unlocks the principal's Delete button.
 *
 *   2. Soft-deleted schools — principals have pulled the trigger.
 *      < 30 days  → super-admin can Restore (everything resurrected).
 *      ≥ 30 days  → super-admin can Permanently Delete (manual click,
 *                   typed-phrase confirmation; no cron does this).
 *
 * Every destructive action goes through a typed-phrase confirm so a
 * stray tap can never destroy data.
 */

interface Props { onBack: () => void; }

interface PendingRow {
  id: string;
  name: string;
  code: string;
  requestedAt: string;
  requestedBy: string | null;
  note: string | null;
}
interface DeletedRow {
  id: string;
  name: string;
  code: string;
  deletedAt: string;
  daysSinceDelete: number;
  canPermanentDelete: boolean;
}

export const SchoolDeletionManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const session = useAuthStore(s => s.session);
  const last4 = (session?.mobileNumber ?? '').replace(/\D/g, '').slice(-4);

  const [pending, setPending] = useState<PendingRow[]>([]);
  const [deleted, setDeleted] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([
        schoolService.getPendingDeletionRequests(),
        schoolService.getSoftDeletedSchools(),
      ]);
      setPending(p);
      setDeleted(d);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const askConfirm = async (title: string, message: string, requiredPhrase?: string): Promise<boolean> => {
    if (last4.length !== 4) {
      showToast('Mobile number missing on profile — set it first', 'error');
      return false;
    }
    return useUIStore.getState().askMobileConfirm({ title, message, expectedLast4: last4, requiredPhrase });
  };

  const approve = async (row: PendingRow) => {
    const ok = await askConfirm(
      `Allow deletion for ${row.name}?`,
      'Principal ka Delete button enable ho jayega. Aap kabhi bhi yeh approval wapas le sakte hain agar principal abhi delete na kare.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await schoolService.setSchoolDeletionAllowed(row.id, true);
      showToast(`${row.name}: deletion approved`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Approve failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (row: PendingRow) => {
    const ok = await askConfirm(
      `Revoke approval for ${row.name}?`,
      'Principal ka Delete button dobara disable ho jayega. Pending request waisi ki waisi rahegi.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await schoolService.setSchoolDeletionAllowed(row.id, false);
      showToast(`${row.name}: approval revoked`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Revoke failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (row: DeletedRow) => {
    const ok = await askConfirm(
      `Restore ${row.name}?`,
      'School wapas active ho jayega. Saare users login kar sakenge.',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await schoolService.restoreSchool(row.id);
      showToast(`${row.name} restored`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Restore failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const permanentDelete = async (row: DeletedRow) => {
    // Hardest gate in the entire app: typed phrase + last4 + the
    // backend RPC additionally checks "30 days have actually passed".
    const ok = await askConfirm(
      `PERMANENT delete ${row.name}?`,
      'Yeh action irreversible hai. Saara data — students, fees, attendance, files — permanently delete ho jayega. 30 din ka grace window khatm ho gaya hai.',
      'PERMANENTLY DELETE',
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      await schoolService.permanentDeleteSchool(row.id);
      showToast(`${row.name} permanently deleted`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      <div className="bg-white border-b border-slate-100 px-4 lg:px-8 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 lg:max-w-5xl lg:mx-auto lg:w-full">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">School Deletion</h2>
            <p className="text-[10px] font-bold text-rose-600 mt-0.5">Requests · Soft-deleted · Permanent</p>
          </div>
          <button onClick={() => void load()} disabled={loading}
            className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 lg:max-w-5xl lg:mx-auto lg:w-full space-y-6">

        {/* ── Pending Requests ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-600 flex items-center gap-1.5">
              <AlertTriangle size={12}/> Pending Requests
            </h3>
            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-700">
              {pending.length}
            </span>
          </div>
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-[11px] font-bold text-slate-400">Loading…</p>
            </div>
          ) : pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
              <ShieldCheck size={24} className="mx-auto text-emerald-500 mb-2"/>
              <p className="text-sm font-black text-slate-700">No pending requests</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">All clear</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(row => (
                <div key={row.id} className="bg-white rounded-2xl border-2 border-rose-200 shadow-sm p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertTriangle size={18}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-black text-slate-900 truncate">{row.name}</h4>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        Code: {row.code} · Requested {fmtDate(row.requestedAt)}
                      </p>
                    </div>
                  </div>
                  {row.note && (
                    <div className="bg-slate-50 rounded-xl p-2.5 mb-3 border border-slate-100">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Principal's note</p>
                      <p className="text-xs font-medium text-slate-700 whitespace-pre-line">{row.note}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => approve(row)} disabled={busyId === row.id}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                      <ShieldOff size={13}/> Allow Deletion
                    </button>
                    <button onClick={() => revoke(row)} disabled={busyId === row.id}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                      <ShieldCheck size={13}/> Keep Protected
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Soft-Deleted Schools ───────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
              <Clock size={12}/> Soft-Deleted Schools
            </h3>
            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700">
              {deleted.length}
            </span>
          </div>
          {!loading && deleted.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
              <ShieldCheck size={24} className="mx-auto text-emerald-500 mb-2"/>
              <p className="text-sm font-black text-slate-700">No soft-deleted schools</p>
            </div>
          ) : deleted.length > 0 && (
            <div className="space-y-3">
              {deleted.map(row => {
                const daysLeft = Math.max(0, 30 - row.daysSinceDelete);
                return (
                  <div key={row.id} className={`bg-white rounded-2xl border-2 shadow-sm p-4 ${row.canPermanentDelete ? 'border-rose-300' : 'border-amber-200'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${row.canPermanentDelete ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        <Clock size={18}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-black text-slate-900 truncate">{row.name}</h4>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                          Code: {row.code} · Deleted {fmtDate(row.deletedAt)}
                        </p>
                        <p className={`text-[10px] font-black mt-1 ${row.canPermanentDelete ? 'text-rose-600' : 'text-amber-700'}`}>
                          {row.canPermanentDelete
                            ? `Grace period expired (${row.daysSinceDelete} days ago)`
                            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to restore`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => restore(row)} disabled={busyId === row.id || row.canPermanentDelete}
                        title={row.canPermanentDelete ? '30-day restore window has expired' : ''}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
                        <Undo2 size={13}/> Restore
                      </button>
                      <button onClick={() => permanentDelete(row)} disabled={busyId === row.id || !row.canPermanentDelete}
                        title={!row.canPermanentDelete ? 'Wait 30 days from soft-delete' : ''}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] uppercase tracking-widest py-2.5 rounded-xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
                        <Trash2 size={13}/> Permanent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};
