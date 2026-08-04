'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';

interface QrTicketProps {
  appointmentId: string;
  verifyUrl: string;
}

export default function QrTicket({ appointmentId, verifyUrl }: QrTicketProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(verifyUrl, {
          width: 240,
          margin: 2,
          color: { dark: '#101566', light: '#ffffff' },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        console.error('[QrTicket] Failed to generate QR:', e);
      }
    }
    generate();
    return () => { cancelled = true; };
  }, [verifyUrl]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `DAM-VR-Pass-${appointmentId.slice(0, 8)}.png`;
    link.click();
  };

  if (!qrDataUrl) {
    return (
      <div className="flex items-center justify-center w-[180px] h-[180px] bg-white/10 rounded-2xl border border-white/15 animate-pulse">
        <span className="text-white/40 text-xs">Generating ticket…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR Code */}
      <div className="bg-white p-3 rounded-2xl shadow-2xl">
        <img
          src={qrDataUrl}
          alt="VR Ticket QR Code"
          className="w-[180px] h-[180px] block"
        />
      </div>
      <p className="text-white/70 text-xs text-center font-medium">
        Show this QR Code at <span className="text-white font-bold">Stall H11-0208</span> for entry
      </p>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#EEF2F6] hover:bg-white text-[#101566] text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Save Pass
        </button>
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View Pass
        </a>
      </div>
    </div>
  );
}
