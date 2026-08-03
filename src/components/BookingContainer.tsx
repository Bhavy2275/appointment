'use client';

import { useState, useTransition } from 'react';
import { Calendar, Clock, User, Mail, Phone, MessageSquare, CheckCircle, MapPin, Building, ArrowRight, AlertCircle } from 'lucide-react';
import { bookAppointment, TimeSlot } from '@/lib/actions';

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

  // Group slots by local date string
  const slotsByDate: { [dateStr: string]: TimeSlot[] } = {};
  slots.forEach((slot) => {
    const localDate = new Date(slot.slot_time);
    const dateStr = localDate.toLocaleDateString('en-CA'); // YYYY-MM-DD local format
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
        const slotDate = new Date(selectedSlotTime);
        setSuccessData({
          id: result.appointmentId,
          dateFormatted: slotDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          timeFormatted: slotDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
        
        // Remove the booked slot from client state to prevent re-booking without reloading
        setSlots(prev => prev.filter(s => new Date(s.slot_time).toISOString() !== new Date(selectedSlotTime).toISOString()));
      } else {
        setError(result.error || 'Failed to book appointment.');
      }
    });
  };

  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';
  const businessLocation = process.env.NEXT_PUBLIC_BUSINESS_LOCATION || '123 Wellness Way, Cityville';

  // Render Success Screen
  if (successData) {
    return (
      <div className="w-full max-w-xl mx-auto bg-zinc-900/40 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-zinc-800 text-white rounded-full mb-6">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">Booking Confirmed!</h2>
        <p className="text-zinc-400 mb-6 font-semibold">
          {email ? (
            <>We've reserved your slot and sent a confirmation email to <span className="text-white font-bold">{email}</span></>
          ) : (
            <>We've reserved your slot successfully!</>
          )}
        </p>
        
        <div className="bg-zinc-950/60 border border-zinc-850 rounded-2xl p-6 mb-8 text-left space-y-4">
          <div className="flex items-start gap-4">
            <Building className="w-5 h-5 text-zinc-400 mt-1" />
            <div>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Business</p>
              <p className="text-base text-zinc-200 font-semibold">{businessName}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <MapPin className="w-5 h-5 text-zinc-400 mt-1" />
            <div>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Location</p>
              <p className="text-base text-zinc-200">{businessLocation}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Calendar className="w-5 h-5 text-zinc-400 mt-1" />
            <div>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Date</p>
              <p className="text-base text-zinc-200">{successData.dateFormatted}</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Clock className="w-5 h-5 text-zinc-400 mt-1" />
            <div>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Time</p>
              <p className="text-base text-zinc-200">{successData.timeFormatted}</p>
            </div>
          </div>
        </div>

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
          className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-4 px-6 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
        >
          Book Another Appointment
        </button>
      </div>
    );
  }

  // Formatting utility for calendar day item
  const formatDayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00'); // enforce local interpretation
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatDayNum = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { day: 'numeric' });
  };

  const formatMonthName = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start">
      {/* Date & Time Selection (Left/Larger panel) */}
      <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <Calendar className="text-zinc-400" /> Select Date & Time
        </h2>

        {availableDates.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/20">
            <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-300 font-semibold text-lg">No Time Slots Available</p>
            <p className="text-zinc-500 text-sm mt-1">There are no upcoming appointments scheduled at this time. Please check back later.</p>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Horizontal Date Picker */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Select a Date</p>
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
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
                          ? 'bg-white border-white text-black shadow-md'
                          : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <span className={`text-[10px] uppercase tracking-wider mb-1 ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>
                        {formatDayName(dateStr)}
                      </span>
                      <span className="text-2xl font-bold leading-none">{formatDayNum(dateStr)}</span>
                      <span className={`text-[10px] mt-1 ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>
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
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Available Times</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {slotsByDate[selectedDateStr].map((slot) => {
                    const slotIso = new Date(slot.slot_time).toISOString();
                    const isSelected = selectedSlotTime === slotIso;
                    const slotStart = new Date(slot.slot_time);
                    const slotEnd = new Date(slotStart.getTime() + 15 * 60000);
                    const slotTimeStr = `${slotStart.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} - ${slotEnd.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => handleSlotSelect(slotIso)}
                        className={`flex items-center justify-center py-3.5 px-4 rounded-xl border font-semibold text-sm transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white border-white text-black'
                            : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white'
                        }`}
                      >
                        <Clock className="w-4 h-4 mr-2" />
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
      <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
          <User className="text-zinc-400" /> Guest Booking Form
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selected Booking Info Card */}
          {selectedSlotTime ? (
            <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-4 flex gap-3.5 items-start">
              <Clock className="w-5 h-5 text-zinc-400 mt-1 flex-shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Selected Time Slot</p>
                <p className="text-sm text-zinc-200 font-semibold mt-0.5">
                  {new Date(selectedSlotTime).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  at{' '}
                  {new Date(selectedSlotTime).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-950/40 border border-zinc-800 border-dashed rounded-2xl p-4 text-center">
              <p className="text-sm text-zinc-500">Select a date and time slot above to begin booking.</p>
            </div>
          )}

          {/* Customer Input Fields */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-600">
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
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Email Address <span className="text-zinc-600">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-600">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  disabled={!selectedSlotTime || isPending}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-600">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="phone"
                  type="tel"
                  required
                  disabled={!selectedSlotTime || isPending}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="alternativePhone" className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Alternative Phone Number <span className="text-zinc-600">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-600">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  id="alternativePhone"
                  type="tel"
                  disabled={!selectedSlotTime || isPending}
                  value={alternativePhone}
                  onChange={(e) => setAlternativePhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reason" className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Reason for Appointment <span className="text-zinc-600">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute top-3 left-4 pointer-events-none text-zinc-600">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <textarea
                  id="reason"
                  disabled={!selectedSlotTime || isPending}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Consultation, checkup, massage, etc."
                  rows={3}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-3 pl-11 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Submission and Error Display */}
          {error && (
            <div className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-xl p-4 flex gap-3 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-zinc-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedSlotTime || isPending}
            className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-4 px-6 rounded-2xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Confirm Appointment <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
