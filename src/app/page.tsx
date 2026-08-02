import { Metadata } from 'next';
import { getAvailableTimeSlots } from '@/lib/actions';
import BookingContainer from '@/components/BookingContainer';
import { Calendar, Clock, MapPin, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Book an Appointment | Quick, Simple & Secure',
  description: 'Schedule your session easily. Select an available time slot, fill out your guest info, and receive instant email confirmations and reminders.',
};

export const revalidate = 0; // Disable static caching so slots are always up to date

export default async function Home() {
  const availableSlots = await getAvailableTimeSlots();

  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';
  const businessLocation = process.env.NEXT_PUBLIC_BUSINESS_LOCATION || '123 Wellness Way, Cityville';

  return (
    <div className="relative min-h-screen bg-black text-zinc-100 flex flex-col justify-between overflow-x-hidden">
      {/* Main Layout Wrapper */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10 flex-grow flex flex-col justify-center">
        {/* Header Hero Section */}
        <header className="text-center mb-12 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-semibold mb-4 tracking-wider uppercase">
            <Clock className="w-3.5 h-3.5" /> Book Online In Under 1 Minute
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            {businessName}
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg mb-6 leading-relaxed">
            Welcome! Select a date and time slot below to secure your session. No account or registration is required.
          </p>

          {/* Quick Business Details */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zinc-400" /> {businessLocation}
            </span>
            <span className="h-4 w-px bg-zinc-800 hidden sm:inline" />
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-zinc-400" /> Guest Checkout Enabled
            </span>
          </div>
        </header>

        {/* Dynamic Booking Interface */}
        <main className="w-full">
          <BookingContainer initialSlots={availableSlots} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-black py-6 text-center text-xs text-zinc-700 tracking-wider font-semibold uppercase relative z-10">
        <p className="max-w-7xl mx-auto px-4">
          &copy; {new Date().getFullYear()} {businessName}. All rights reserved. &bull;
          <a href="/admin" className="ml-2 text-zinc-400 hover:text-white hover:underline transition-all">
            Admin Login
          </a>
        </p>
      </footer>
    </div>
  );
}
