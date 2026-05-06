import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, AlertCircle, Loader, GraduationCap, ArrowRight } from 'lucide-react';
import { authService } from '@/modules/auth/auth.service';
import { useAuthStore } from '@/store/authStore';

export const LoginPage: React.FC = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!mobileNumber.trim() || !password.trim()) {
      setError('Mobile number and password required');
      return;
    }
    setIsSubmitting(true);
    try {
      const session = await authService.login(mobileNumber, password);
      setSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  // ── Form fields (rendered the same on mobile + desktop) ────────────────────
  const formFields = (
    <>
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 flex gap-2 items-start">
          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm font-bold text-rose-700">{error}</div>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
          Mobile Number
        </label>
        <div className="relative">
          <Phone size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="10-digit mobile number"
            autoComplete="username"
            inputMode="numeric"
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
          Password
        </label>
        <div className="relative">
          <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter password"
            autoComplete="current-password"
            className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      <button
        onClick={handleLogin}
        disabled={isSubmitting}
        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-base rounded-xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader size={18} className="animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight size={18} />
          </>
        )}
      </button>

      <p className="text-[11px] font-bold text-slate-400 text-center mt-5">
        Default password is your mobile number on first login.
      </p>
    </>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* ── Mobile layout — single column, branded header ──────────────────── */}
      <div className="lg:hidden min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
        <div className="px-6 pt-12 pb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-200 mb-4">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">EduGrow</h1>
          <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">School Management</p>
        </div>

        <div className="flex-1 px-6 pb-8">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-black text-slate-900 mb-1">Welcome back</h2>
            <p className="text-sm font-bold text-slate-400 mb-6">Sign in to continue</p>
            {formFields}
          </div>

          <p className="text-[10px] font-bold text-slate-300 text-center mt-6">
            EduGrow · v1.0 · Secure school operations
          </p>
        </div>
      </div>

      {/* ── Desktop layout — split: brand panel left, form right ───────────── */}
      <div className="hidden lg:grid lg:grid-cols-[5fr_6fr] xl:grid-cols-[1fr_1fr] lg:min-h-screen">
        {/* LEFT — minimal brand panel */}
        <div className="relative flex flex-col justify-between p-12 xl:p-14 bg-slate-900 text-white overflow-hidden">
          {/* Subtle grid pattern + soft glow — modern, restrained */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute top-1/3 -right-32 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 bg-white text-slate-900 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap size={22} strokeWidth={2.5} />
            </div>
            <div className="text-xl font-black tracking-tight">EduGrow</div>
          </div>

          <div className="relative z-10 max-w-md">
            <h2 className="text-4xl xl:text-[2.6rem] font-black leading-[1.1] tracking-tight mb-5">
              Run your school,
              <br />
              <span className="text-blue-400">not your spreadsheets.</span>
            </h2>
            <p className="text-[15px] font-medium text-slate-300 leading-relaxed">
              Admissions · fees · attendance · results · transport — all in one place.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-6 text-[11px] font-bold text-slate-400">
            <span>© {new Date().getFullYear()} EduGrow</span>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span>v1.0</span>
          </div>
        </div>

        {/* RIGHT — form panel (white) */}
        <div className="flex items-center justify-center p-12 xl:p-16 bg-white">
          <div className="w-full max-w-md">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-sm font-bold text-slate-400 mt-1 mb-8">
              Sign in with your registered mobile number to continue.
            </p>
            {formFields}
          </div>
        </div>
      </div>
    </div>
  );
};
