import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, AlertCircle, Loader } from 'lucide-react';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';

interface Props {
  onLoginSuccess: () => void;
}

type LoginRole = 'PARENT' | 'PRINCIPAL';

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const { setSession, setLoading, setError, error: authError } = useAuthStore();
  const [role, setRole] = useState<LoginRole>('PARENT');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    setLocalError('');

    if (!mobileNumber.trim() || !password.trim()) {
      setLocalError('Mobile number and password required');
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      let session = null;

      if (role === 'PARENT') {
        session = authService.parentLogin(mobileNumber, password);
      } else {
        session = authService.principalLogin(mobileNumber, password);
      }

      if (session) {
        setSession(session);
        onLoginSuccess();
      } else {
        setLocalError('Invalid mobile number or password');
        setError('Invalid credentials');
      }
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  // Demo credentials hint
  const demoCredentials =
    role === 'PARENT'
      ? { mobile: '9876543210', password: 'parent123' }
      : { mobile: '9000000001', password: 'principal123' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center sm:py-8 sm:px-4">
      <div className="w-full h-screen sm:h-[850px] sm:max-w-[400px] bg-slate-50 relative sm:rounded-[40px] sm:border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-12 pb-8 text-white">
          <div className="mb-2">
            <div className="text-3xl font-black">SchoolApp</div>
            <div className="text-xs font-bold text-blue-100">School Management System</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col p-6 pb-28 justify-center">
          {/* Role Selector */}
          <div className="flex gap-3 mb-8">
            {(['PARENT', 'PRINCIPAL'] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  setLocalError('');
                }}
                className={`flex-1 py-3 px-4 rounded-xl font-black text-sm transition-all ${
                  role === r
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {r === 'PARENT' ? '👨‍👩‍👧\nParent' : '🏫\nPrincipal'}
              </button>
            ))}
          </div>

          {/* Error Message */}
          {(localError || authError) && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-6 flex gap-2 items-start">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm font-bold text-rose-700">{localError || authError}</div>
            </div>
          )}

          {/* Mobile Input */}
          <div className="mb-4">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">
              Mobile Number
            </label>
            <div className="relative">
              <Phone size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="10-digit mobile number"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-1">Demo: {demoCredentials.mobile}</div>
          </div>

          {/* Password Input */}
          <div className="mb-6">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter password"
                className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="text-[9px] font-bold text-slate-400 mt-1">Demo: {demoCredentials.password}</div>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={isSubmitting}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader size={20} className="animate-spin" />
                Logging in...
              </>
            ) : (
              'Login'
            )}
          </button>

          {/* Demo Credentials Hint */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mt-6 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1">Demo Credentials</div>
            <div className="text-[10px] font-bold text-blue-600">
              Mobile: {demoCredentials.mobile}<br />
              Password: {demoCredentials.password}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-4 text-center">
          <div className="text-[10px] font-bold text-slate-500">
            School Management System v1.0
          </div>
        </div>
      </div>
    </div>
  );
};
