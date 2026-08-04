import { redirect } from 'next/navigation';
import { checkAdminAuth, getAdminTimeSlots } from '@/lib/actions';
import AdminDashboard from '@/components/AdminDashboard';
import DamLogo from '@/components/DamLogo';
import { Shield } from 'lucide-react';

export const revalidate = 0; // Disable static caching for admin panel

export default async function AdminPage() {
  const isAuth = await checkAdminAuth();

  if (!isAuth) {
    redirect('/admin/login');
  }

  // Fetch slots list (includes related bookings)
  const initialSlots = await getAdminTimeSlots();

  const _envName = process.env.NEXT_PUBLIC_BUSINESS_NAME;
  const businessName = (_envName && _envName !== 'ABC' && _envName !== 'Aura Wellness') ? _envName : 'DAM Lighting Solutions';

  return (
    <div className="relative min-h-screen bg-[#101566] text-white flex flex-col justify-between overflow-x-hidden font-sans">
      {/* Admin Panel Header */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 flex-grow">
        <header className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <DamLogo variant="header" />
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90">
              <Shield className="w-3.5 h-3.5 text-white/70" /> Admin Console
            </div>
          </div>
          <a href="/" className="text-xs font-semibold text-white/80 hover:text-white underline transition-all">
            View Live Booking Page &rarr;
          </a>
        </header>

        {/* Dashboard Component */}
        <main className="w-full">
          <AdminDashboard initialSlots={initialSlots} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0B0E42] py-4 text-center text-[10px] text-white/60 tracking-wider font-semibold uppercase relative z-10">
        <p>&copy; {new Date().getFullYear()} {businessName}. Secure Session Enabled.</p>
      </footer>
    </div>
  );
}
