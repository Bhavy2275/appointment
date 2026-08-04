'use client';

import { useEffect, useRef, useState } from 'react';
import { ScanLine, X, AlertCircle, Loader2, Copy, ExternalLink, Check, QrCode } from 'lucide-react';
import { checkInAppointment, saveQrScan } from '@/lib/actions';

interface AppointmentInfo {
  id: string;
  name: string;
  status: string;
  slotTime: string;
  checkedIn: boolean;
}

export default function QrScanner({ appointmentId }: { appointmentId?: string }) {
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isStarted, setIsStarted] = useState(false);
  
  // Scanned raw result (for any QR code)
  const [scannedText, setScannedText] = useState<string | null>(null);
  const [appointmentInfo, setAppointmentInfo] = useState<AppointmentInfo | null>(null);
  
  const [copied, setCopied] = useState(false);
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

  const processDecodedText = async (rawText: string) => {
    await stopScanner();
    setScannedText(rawText);
    setAppointmentInfo(null);
    setError('');

    // Silently save scan to user's account if appointmentId is provided
    if (appointmentId) {
      saveQrScan(appointmentId, rawText).catch(() => {});
    }

    // Check if decoded text contains a booking verify ID
    const match = rawText.match(/\/verify\/([a-f0-9-]+)/i);
    if (match) {
      const bookingId = match[1];
      try {
        const res = await fetch(`/api/verify/${bookingId}`);
        if (res.ok) {
          const data = await res.json();
          setAppointmentInfo({
            id: bookingId,
            name: data.customer_name,
            status: data.status,
            slotTime: data.slot_time,
            checkedIn: false,
          });
        }
      } catch (_) {}
    }
  };

  const startScanner = async () => {
    setError('');
    setScannedText(null);
    setAppointmentInfo(null);
    setLoading(true);
    setIsStarted(true);

    try {
      // Allow React to mount #qr-scanner-container in the DOM
      await new Promise((resolve) => setTimeout(resolve, 150));

      const { Html5Qrcode } = await import('html5-qrcode');
      const container = document.getElementById('qr-scanner-container');
      if (!container) throw new Error('Scanner container element not ready');

      const scanner = new Html5Qrcode('qr-scanner-container');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await processDecodedText(decodedText);
        },
        undefined
      );
    } catch (e: any) {
      setIsStarted(false);
      const errMsg = e?.toString() || '';
      if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
        setError('No camera detected on this device.');
      } else {
        setError(e?.message || 'Camera access unavailable. Try the "Upload Image" option below.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setScannedText(null);
    setAppointmentInfo(null);
    setLoading(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      let container = document.getElementById('qr-file-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'qr-file-container';
        container.style.display = 'none';
        document.body.appendChild(container);
      }
      const html5QrCode = new Html5Qrcode('qr-file-container');
      const decodedText = await html5QrCode.scanFile(file, false);
      await processDecodedText(decodedText);
      html5QrCode.clear();
    } catch (err: any) {
      setError('Could not read QR code from image. Please ensure image is clear or try live camera.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCopy = () => {
    if (!scannedText) return;
    navigator.clipboard.writeText(scannedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCheckIn = async () => {
    if (!appointmentInfo) return;
    setCheckingIn(true);
    const result = await checkInAppointment(appointmentInfo.id);
    if (result.success) {
      setAppointmentInfo(prev => prev ? { ...prev, status: 'completed', checkedIn: true } : null);
    } else {
      setError(result.error || 'Check-in failed.');
    }
    setCheckingIn(false);
  };

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const isUrl = scannedText ? /^https?:\/\//i.test(scannedText.trim()) : false;

  return (
    <div className="space-y-6 font-sans">
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
        <div className="flex flex-col items-center justify-center gap-5 py-10 px-4 bg-[#080A30]/60 border border-white/10 rounded-2xl">
          <div className="p-5 bg-[#0B0E42] rounded-2xl border border-white/15">
            <QrCode className="w-10 h-10 text-[#EEF2F6]" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-white font-bold text-base">QR Code Scanner</p>
            <p className="text-white/50 text-xs mt-1">Scan any QR code using your phone camera or upload a QR image</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-xs">
            <button
              onClick={startScanner}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              {loading ? 'Starting…' : 'Live Camera'}
            </button>
            
            <label className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer text-center">
              Upload Image
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-3 bg-[#080A30] border border-white/20 rounded-xl p-4 text-sm text-white">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Scanned QR Result Display */}
      {scannedText && (
        <div className="bg-[#0B0E42]/90 border border-white/20 rounded-2xl p-6 space-y-4 backdrop-blur-md shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-white/60 uppercase tracking-widest flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" /> Scanned QR Code Result
            </span>
            <button
              onClick={() => { setScannedText(null); setAppointmentInfo(null); setError(''); }}
              className="text-xs text-white/50 hover:text-white underline cursor-pointer"
            >
              Clear Result
            </button>
          </div>

          <div className="bg-[#080A30] rounded-xl p-4 border border-white/15 break-all font-mono text-sm text-white select-all">
            {scannedText}
          </div>

          {/* Appointment Check-in Card (if scanned code is a valid ticket) */}
          {appointmentInfo && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm">{appointmentInfo.name}</p>
                  <p className="text-white/60 text-xs font-mono">ID: {appointmentInfo.id.slice(0, 12)}…</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-500/30">
                  {appointmentInfo.status}
                </span>
              </div>
              {appointmentInfo.status !== 'completed' && !appointmentInfo.checkedIn && (
                <button
                  onClick={handleCheckIn}
                  disabled={checkingIn}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs uppercase tracking-wider py-2.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                >
                  {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {checkingIn ? 'Checking In…' : 'Mark as Checked In'}
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {isUrl && (
              <a
                href={scannedText}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md"
              >
                <ExternalLink className="w-4 h-4" /> Open Link
              </a>
            )}

            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Text'}
            </button>

            <button
              onClick={startScanner}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#080A30] border border-white/20 text-white/80 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              <ScanLine className="w-4 h-4" /> Scan Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
