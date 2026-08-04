'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ScanLine, X, AlertCircle, Loader2 } from 'lucide-react';
import { checkInAppointment } from '@/lib/actions';

interface ScanResult {
  id: string;
  name: string;
  status: string;
  slotTime: string;
  checkedIn: boolean;
}

export default function QrScanner() {
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (_) {}
    setIsStarted(false);
  };

  const startScanner = async () => {
    setError('');
    setScanResult(null);
    setLoading(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-scanner-container');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await stopScanner();
          // Extract booking ID from the verify URL or use raw text as ID
          let bookingId = decodedText;
          const match = decodedText.match(/\/verify\/([a-f0-9-]+)/i);
          if (match) bookingId = match[1];

          try {
            const res = await fetch(`/api/verify/${bookingId}`);
            if (!res.ok) throw new Error('Ticket not found');
            const data = await res.json();
            setScanResult({
              id: bookingId,
              name: data.customer_name,
              status: data.status,
              slotTime: data.slot_time,
              checkedIn: false,
            });
          } catch {
            setError('Could not verify this ticket. Please try again.');
          }
        },
        undefined
      );
      setIsStarted(true);
    } catch (e: any) {
      setError('Camera access denied or unavailable. Please allow camera permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    if (!scanResult) return;
    setCheckingIn(true);
    const result = await checkInAppointment(scanResult.id);
    if (result.success) {
      setScanResult(prev => prev ? { ...prev, status: 'completed', checkedIn: true } : null);
    } else {
      setError(result.error || 'Check-in failed.');
    }
    setCheckingIn(false);
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const tz = 'Asia/Kolkata';

  return (
    <div className="space-y-6">
      {/* Scanner Viewport */}
      {isStarted ? (
        <div className="relative">
          <div
            id="qr-scanner-container"
            ref={containerRef}
            className="w-full rounded-2xl overflow-hidden border border-white/15 bg-black"
            style={{ minHeight: '300px' }}
          />
          <button
            onClick={stopScanner}
            className="absolute top-3 right-3 p-2 bg-[#080A30]/90 border border-white/20 rounded-xl text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 border-2 border-[#EEF2F6] rounded-2xl opacity-80" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-5 py-12 bg-[#080A30]/60 border border-white/10 rounded-2xl">
          <div className="p-5 bg-[#0B0E42] rounded-2xl border border-white/15">
            <ScanLine className="w-10 h-10 text-[#EEF2F6]" />
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base">Stall Check-In Scanner</p>
            <p className="text-white/50 text-xs mt-1">Point camera at guest's QR ticket</p>
          </div>
          <button
            onClick={startScanner}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {loading ? 'Starting Camera…' : 'Start Scanner'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-[#080A30] border border-white/20 rounded-xl p-4 text-sm text-white">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Scan Result */}
      {scanResult && (
        <div className="bg-[#0B0E42]/80 border border-white/15 rounded-2xl p-5 space-y-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${scanResult.checkedIn || scanResult.status === 'completed' ? 'bg-green-900/60' : 'bg-[#080A30]'} border border-white/15`}>
              <CheckCircle className={`w-5 h-5 ${scanResult.checkedIn || scanResult.status === 'completed' ? 'text-green-400' : 'text-white/60'}`} />
            </div>
            <div>
              <p className="text-white font-bold text-base">{scanResult.name}</p>
              <p className="text-white/50 text-xs font-mono">{scanResult.id.slice(0, 16)}…</p>
            </div>
            <span className={`ml-auto text-xs font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-full ${
              scanResult.status === 'completed' ? 'bg-green-900/60 text-green-300 border border-green-500/30' :
              scanResult.status === 'booked' ? 'bg-blue-900/60 text-blue-300 border border-blue-500/30' :
              'bg-white/10 text-white/60 border border-white/15'
            }`}>
              {scanResult.status === 'completed' ? '✓ Checked In' : scanResult.status}
            </span>
          </div>

          <div className="bg-[#080A30]/80 rounded-xl p-3 border border-white/10">
            <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-1">Session Slot</p>
            <p className="text-white text-sm font-semibold">
              {new Date(scanResult.slotTime).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz,
              })}
            </p>
          </div>

          <div className="flex gap-3">
            {scanResult.status !== 'completed' && !scanResult.checkedIn ? (
              <button
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="flex-1 flex items-center justify-center gap-2 bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-60"
              >
                {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {checkingIn ? 'Checking In…' : 'Mark as Checked In'}
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 bg-green-900/40 border border-green-500/30 text-green-300 font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl">
                <CheckCircle className="w-4 h-4" />
                Guest Checked In Successfully
              </div>
            )}
            <button
              onClick={() => { setScanResult(null); setError(''); }}
              className="px-4 py-3 bg-[#080A30]/80 border border-white/15 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Scan Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
