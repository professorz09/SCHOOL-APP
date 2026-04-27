import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, AlertCircle, Loader } from 'lucide-react';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';

interface Props {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const { setSession, setLoading, setError, error: authError } = useAuthStore();
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
      const session = authService.login(mobileNumber, password);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 pt-10 pb-8 text-white">
          <div className="text-3xl font-black">SchoolApp</div>
          <div className="text-xs font-bold text-blue-100 mt-1">School Management System</div>
        </div>

        {/* Content */}
        <div className="p-8">
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
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 px-8 py-4 text-center">
          <div className="text-[10px] font-bold text-slate-400">
            School Management System v1.0
          </div>
        </div>
      </div>
    </div>
  );
};
