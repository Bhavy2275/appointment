'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, AlertCircle, Building, Clock } from 'lucide-react';
import { loginAdmin } from '@/lib/actions';

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

  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';

  return (
    <div className="relative min-h-screen bg-black text-zinc-100 flex flex-col justify-center items-center px-4 overflow-hidden">
      {/* Main card */}
      <div className="w-full max-w-md bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-zinc-800 text-zinc-100 rounded-2xl mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{businessName}</h1>
          <p className="text-zinc-500 text-sm mt-1">Admin Control Center</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
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
                className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3.5 px-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="bg-zinc-900 border border-zinc-800 text-white rounded-xl p-4 flex gap-3 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-zinc-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-3.5 px-6 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
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

      <div className="mt-8 text-center text-xs text-zinc-600 relative z-10">
        <a href="/" className="hover:text-white hover:underline transition-all">
          &larr; Back to Booking Form
        </a>
      </div>
    </div>
  );
}
