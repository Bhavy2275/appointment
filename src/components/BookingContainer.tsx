'use client';

import { useState, useTransition, useEffect } from 'react';
import { Calendar, Clock, User, Mail, Phone, MessageSquare, CheckCircle, MapPin, ArrowRight, AlertCircle, ScanLine } from 'lucide-react';
import { bookAppointment, getAvailableTimeSlots, TimeSlot } from '@/lib/actions';
import QrScanner from '@/components/QrScanner';
import {
  formatSlotDate,
  formatSlotTime,
  formatSlotRange,
  getKolkataDateString,
  getKolkataDayName,
  getKolkataDayNum,
  getKolkataMonthName,
} from '@/lib/timezone';

interface BookingContainerProps {
  initialSlots: TimeSlot[];
}

export default function BookingContainer({ initialSlots }: BookingContainerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>(initialSlots);
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [reason, setReason] = useState('');
  
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    id: string;
    dateFormatted: string;
    timeFormatted: string;
  } | null>(null);

  // Periodic background polling (every 3 seconds) & tab focus listener to keep slot availability in real-time sync across devices
  useEffect(() => {
    let isMounted = true;

    const fetchLatestSlots = async () => {
      try {
        const latest = await getAvailableTimeSlots();
        if (isMounted && Array.isArray(latest)) {
          setSlots(latest);
          // If current selected slot was booked by someone else in real-time, deselect it and show warning
          setSelectedSlotTime((current) => {
            if (current && !latest.some((s) => new Date(s.slot_time).toISOString() === new Date(current).toISOString())) {
              setError('The slot you selected was just booked by another guest. Please select a different time slot.');
              return '';
            }
            return current;
          });
        }
      } catch (err) {
        console.error('Failed to poll latest time slots:', err);
      }
    };

    const intervalId = setInterval(fetchLatestSlots, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLatestSlots();
      }
    };

    window.addEventListener('focus', fetchLatestSlots);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', fetchLatestSlots);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Group slots by IST date string (YYYY-MM-DD)
  const slotsByDate: { [dateStr: string]: TimeSlot[] } = {};
  slots.forEach((slot) => {
    const dateStr = getKolkataDateString(slot.slot_time);
    if (!slotsByDate[dateStr]) {
      slotsByDate[dateStr] = [];
    }
    slotsByDate[dateStr].push(slot);
  });

  // Sort slots in each date group by time
  Object.keys(slotsByDate).forEach((dateStr) => {
    slotsByDate[dateStr].sort((a, b) => new Date(a.slot_time).getTime() - new Date(b.slot_time).getTime());
  });

  // Get list of available unique date strings (sorted)
  const availableDates = Object.keys(slotsByDate).sort();

  // Handle slot click
  const handleSlotSelect = (slotTimeIso: string) => {
    setSelectedSlotTime(slotTimeIso);
    setError(null);
  };

  // Basic Validation
  const validateForm = () => {
    if (!selectedSlotTime) return 'Please select an appointment time slot.';
    if (!name.trim()) return 'Name is required.';
    
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return 'Please enter a valid email address.';
    }
    
    if (!phone.trim()) return 'Phone number is required.';
    const phoneRegex = /^[+]?[0-9\s\-()]{7,15}$/;
    if (!phoneRegex.test(phone)) return 'Please enter a valid phone number.';
    
    if (alternativePhone.trim()) {
      const altPhoneRegex = /^[+]?[0-9\s\-()]{7,15}$/;
      if (!altPhoneRegex.test(alternativePhone)) return 'Please enter a valid alternative phone number.';
    }
    
    return null;
  };

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await bookAppointment({
        name,
        email: email.trim() || undefined,
        phone,
        alternativePhone: alternativePhone.trim() || undefined,
        reason,
        slotTime: selectedSlotTime,
      });

      if (result.success && result.appointmentId) {
        setSuccessData({
          id: result.appointmentId,
          dateFormatted: formatSlotDate(selectedSlotTime, 'full'),
          timeFormatted: formatSlotRange(selectedSlotTime, 15),
        });
        
        // Remove the booked slot from client state to prevent re-booking without reloading
        setSlots(prev => prev.filter(s => new Date(s.slot_time).toISOString() !== new Date(selectedSlotTime).toISOString()));
      } else {
        setError(result.error || 'Failed to book appointment.');
        // Re-fetch latest available slots immediately on error so user sees updated slot list
        try {
          const latest = await getAvailableTimeSlots();
          if (Array.isArray(latest)) setSlots(latest);
        } catch (_) {}
      }
    });
  };

  // Render Success Screen
  if (successData) {
    return (
      <div className="w-full max-w-xl mx-auto text-center animate-fade-in font-sans">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#EEF2F6] rounded-full mb-4 shadow-lg">
            <CheckCircle className="w-9 h-9 text-[#101566]" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">Booking Confirmed!</h2>
          <p className="text-white/60 text-sm font-semibold">
            {email ? (
              <>Confirmation sent to <span className="text-white font-bold">{email}</span></>
            ) : (
              <>Your VR session has been reserved!</>
            )}
          </p>
        </div>

        {/* Session Info Card */}
        <div className="bg-[#0B0E42]/80 border border-white/15 rounded-3xl p-6 mb-6 text-left space-y-4 backdrop-blur-md shadow-2xl">
          <div className="flex items-start gap-4">
            <MapPin className="w-5 h-5 text-white/50 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/50 font-semibold uppercase tracking-wider">Location</p>
              <p className="text-base text-white font-bold">Stall H11- 0208</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Calendar className="w-5 h-5 text-white/50 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/50 font-semibold uppercase tracking-wider">Date</p>
              <p className="text-base text-white font-semibold">{successData.dateFormatted}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Clock className="w-5 h-5 text-white/50 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-white/50 font-semibold uppercase tracking-wider">Time Slot</p>
              <p className="text-base text-white font-semibold">{successData.timeFormatted}</p>
            </div>
          </div>
        </div>

        {/* QR Code Scanner Section after Booking */}
        <div className="bg-[#0B0E42]/80 border border-white/15 rounded-3xl p-6 mb-6 text-left space-y-4 backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <ScanLine className="w-4 h-4 text-[#EEF2F6]" />
            <p className="text-white font-extrabold text-sm uppercase tracking-widest">QR Code Scanner</p>
          </div>
          <p className="text-white/60 text-xs mb-3">Scan any QR code using camera or upload a QR image</p>
          <QrScanner appointmentId={successData.id} />
        </div>

        {/* Book Another */}
        <button
          onClick={() => {
            setSuccessData(null);
            setSelectedSlotTime('');
            setName('');
            setEmail('');
            setPhone('');
            setAlternativePhone('');
            setReason('');
          }}
          className="w-full bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold uppercase tracking-widest py-4 px-6 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer text-sm"
        >
          Book Another Session
        </button>
      </div>
    );
  }

  // Formatting utility for calendar day item in IST
  const formatDayName = (dateStr: string) => {
    return getKolkataDayName(dateStr + 'T00:00:00+05:30');
  };

  const formatDayNum = (dateStr: string) => {
    return getKolkataDayNum(dateStr + 'T00:00:00+05:30');
  };

  const formatMonthName = (dateStr: string) => {
    return getKolkataMonthName(dateStr + 'T00:00:00+05:30');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start font-sans">
      {/* Date & Time Selection (Left/Larger panel) */}
      <div className="lg:col-span-7 bg-[#0B0E42]/80 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2 tracking-tight">
          <Calendar className="text-white/70" /> Select Date & Time
        </h2>

        {availableDates.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-white/20 rounded-2xl bg-[#080A30]/40">
            <AlertCircle className="w-12 h-12 text-white/40 mx-auto mb-4" />
            <p className="text-white font-semibold text-lg">No Time Slots Available</p>
            <p className="text-white/60 text-sm mt-1">There are no upcoming appointments scheduled at this time. Please check back later.</p>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Horizontal Date Picker */}
            <div>
              <p className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-widest">Select a Date</p>
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {availableDates.map((dateStr) => {
                  const isSelected = selectedDateStr === dateStr;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDateStr(dateStr);
                        setSelectedSlotTime('');
                      }}
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-24 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#EEF2F6] border-[#EEF2F6] text-[#101566] shadow-lg font-bold'
                          : 'bg-[#080A30]/60 border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30'
                      }`}
                    >
                      <span className={`text-[10px] uppercase tracking-widest mb-1 ${isSelected ? 'text-[#101566]/70' : 'text-white/50'}`}>
                        {formatDayName(dateStr)}
                      </span>
                      <span className="text-2xl font-extrabold leading-none">{formatDayNum(dateStr)}</span>
                      <span className={`text-[10px] mt-1 ${isSelected ? 'text-[#101566]/70' : 'text-white/50'}`}>
                        {formatMonthName(dateStr)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slot Picker */}
            {selectedDateStr && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-widest">Available Times</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {slotsByDate[selectedDateStr].map((slot) => {
                    const slotIso = new Date(slot.slot_time).toISOString();
                    const isSelected = selectedSlotTime === slotIso;
                    const slotTimeStr = formatSlotRange(slot.slot_time, 15);

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => handleSlotSelect(slotIso)}
                        className={`flex items-center justify-center py-3.5 px-4 rounded-xl border font-semibold text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#EEF2F6] border-[#EEF2F6] text-[#101566] font-extrabold shadow-lg'
                            : 'bg-[#080A30]/60 border-white/15 text-white/90 hover:bg-white/10 hover:border-white/30'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 mr-2 opacity-80" />
                        {slotTimeStr}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking Form (Right/Smaller panel) */}
      <div className="lg:col-span-5 bg-[#0B0E42]/80 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2 tracking-tight">
          <User className="text-white/70" /> Guest Details
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selected Booking Info Card */}
          {selectedSlotTime ? (
            <div className="bg-[#080A30]/90 border border-white/20 rounded-2xl p-4 flex gap-3.5 items-start">
              <Clock className="w-5 h-5 text-white/80 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs text-white/60 font-semibold uppercase tracking-wider">Selected VR Session</p>
                <p className="text-sm text-white font-bold mt-0.5" suppressHydrationWarning>
                  {formatSlotDate(selectedSlotTime, 'medium')} at {formatSlotTime(selectedSlotTime)}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[#080A30]/40 border border-white/15 border-dashed rounded-2xl p-4 text-center">
              <p className="text-sm text-white/50">Select a date and time slot above to begin booking.</p>
            </div>
          )}

          {/* Customer Input Fields */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  disabled={!selectedSlotTime || isPending}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3 pl-11 pr-4 text-white placeholder-white/30 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Email Address <span className="text-white/40">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  disabled={!selectedSlotTime || isPending}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3 pl-11 pr-4 text-white placeholder-white/30 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="phone"
                  type="tel"
                  required
                  disabled={!selectedSlotTime || isPending}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3 pl-11 pr-4 text-white placeholder-white/30 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="alternativePhone" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Alternative Phone Number <span className="text-white/40">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="alternativePhone"
                  type="tel"
                  disabled={!selectedSlotTime || isPending}
                  value={alternativePhone}
                  onChange={(e) => setAlternativePhone(e.target.value)}
                  placeholder="Alternative phone number"
                  className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3 pl-11 pr-4 text-white placeholder-white/30 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reason" className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                Notes / Requirements <span className="text-white/40">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute top-3 left-4 pointer-events-none text-white/50">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <textarea
                  id="reason"
                  disabled={!selectedSlotTime || isPending}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Any specific requests or requirements..."
                  rows={3}
                  className="w-full bg-[#080A30]/90 border border-white/20 focus:border-white rounded-xl py-3 pl-11 pr-4 text-white placeholder-white/30 outline-none text-sm transition-all resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Submission and Error Display */}
          {error && (
            <div className="bg-[#080A30] border border-white/20 text-white rounded-xl p-4 flex gap-3 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-white/70" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedSlotTime || isPending}
            className="w-full bg-[#EEF2F6] hover:bg-white text-[#101566] font-extrabold uppercase tracking-widest py-4 px-6 rounded-2xl transition-all shadow-lg active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-[#101566]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Confirm Booking <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
