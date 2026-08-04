import { Metadata } from 'next';
import { getAvailableTimeSlots } from '@/lib/actions';
import BookingContainer from '@/components/BookingContainer';
import DamLogo from '@/components/DamLogo';
import { Clock, MapPin, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DAM Lighting Solutions | VR World Session Booking',
  description: 'Book your immersive VR experience with DAM Lighting Solutions. Select an available slot to reserve your session.',
};

export const revalidate = 0; // Disable static caching so slots are always up to date

export default async function Home() {
  const availableSlots = await getAvailableTimeSlots();

  const envName = process.env.NEXT_PUBLIC_BUSINESS_NAME;
  const businessName = (envName && envName !== 'ABC' && envName !== 'Aura Wellness') ? envName : 'DAM';

  const envLoc = process.env.NEXT_PUBLIC_BUSINESS_LOCATION;
  const businessLocation = (envLoc && !envLoc.includes('ABC') && !envLoc.includes('Cityville')) ? envLoc : 'Stall: H11- 0208';

  return (
    <div className="relative min-h-screen bg-[#101566] text-white flex flex-col justify-between overflow-x-hidden font-sans">
      {/* Main Layout Wrapper */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 flex-grow flex flex-col justify-center">
        
        {/* Top Branding Navigation Pill */}
        <div className="flex items-center justify-between mb-10 pb-4 border-b border-white/10">
          <DamLogo variant="header" />
          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#EEF2F6]/90 bg-white/10 px-4 py-2 rounded-full border border-white/15">
            <Sparkles className="w-3.5 h-3.5 text-[#EEF2F6]" /> Immersive VR World
          </div>
        </div>

        {/* Header Hero Section */}
        <header className="text-center mb-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-[#EEF2F6] text-xs font-semibold mb-5 tracking-widest uppercase">
            <Clock className="w-3.5 h-3.5" /> Book Your VR Experience
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            {businessName}
          </h1>
          <p className="text-white/80 text-base sm:text-lg mb-6 leading-relaxed font-normal">
            Step inside. Explore. Experience lighting like never before. Select an available time slot below to reserve your 15-minute VR session.
          </p>

          {/* Quick Business Details */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/70 font-medium">
            <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
              <MapPin className="w-4 h-4 text-white" /> Location: {businessLocation}
            </span>
          </div>
        </header>

        {/* Dynamic Booking Interface */}
        <main className="w-full">
          <BookingContainer initialSlots={availableSlots} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0B0E42] py-6 text-center text-xs text-white/60 tracking-wider font-semibold uppercase relative z-10">
        <p className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3 flex-wrap">
          <span>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</span>
          <span>&bull;</span>
          <a href="/admin" className="text-white/80 hover:text-white underline transition-all">
            Admin Portal
          </a>
        </p>
      </footer>
    </div>
  );
}
