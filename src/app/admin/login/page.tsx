'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { loginAdmin } from '@/lib/actions';
import DamLogo from '@/components/DamLogo';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter a password.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await loginAdmin(password);
      if (result.success) {
        router.refresh();
        router.push('/admin');
      } else {
        setError(result.error || 'Invalid credentials.');
      }
    });
  };

  const _envName = process.env.NEXT_PUBLIC_BUSINESS_NAME;
  const businessName = (_envName && _envName !== 'ABC' && _envName !== 'Aura Wellness') ? _envName : 'DAM Lighting Solutions';

  return (
    <div className="relative min-h-screen bg-[#101566] text-white flex flex-col justify-center items-center px-4 overflow-hidden font-sans">
      {/* Main card */}
      <div className="w-full max-w-md bg-[#0B0E42]/80 border border-white/15 rounded-3xl p-8 shadow-2xl backdrop-blur-md relative z-10 animate-fade-in text-center">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <DamLogo variant="header" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">{businessName}</h1>
          <p className="text-white/60 text-xs mt-1 uppercase tracking-widest font-semibold">Admin Control Center</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6 text-left">
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
              System Password
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isPending}
                className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3.5 px-4 text-white placeholder-white/30 outline-none text-sm transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="bg-[#080A30] border border-white/20 text-white rounded-xl p-4 flex gap-3 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/70" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold uppercase tracking-widest py-3.5 px-6 rounded-xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-[#101566]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Authenticating...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Access Dashboard <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>
      </div>

      <div className="mt-8 text-center text-xs text-white/60 relative z-10 font-semibold">
        <a href="/" className="hover:text-white underline transition-all">
          &larr; Back to Booking Form
        </a>
      </div>
    </div>
  );
}
