import { redirect } from 'next/navigation';
import { checkAdminAuth, getAdminTimeSlots } from '@/lib/actions';
import AdminDashboard from '@/components/AdminDashboard';
import { Shield } from 'lucide-react';

export const revalidate = 0; // Disable static caching for admin panel

export default async function AdminPage() {
  const isAuth = await checkAdminAuth();

  if (!isAuth) {
    redirect('/admin/login');
  }

  // Fetch slots list (includes related bookings)
  const initialSlots = await getAdminTimeSlots();

  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';

  return (
    <div className="relative min-h-screen bg-black text-zinc-100 flex flex-col justify-between overflow-x-hidden">
      {/* Admin Panel Header */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 flex-grow">
        <header className="mb-6 flex items-center justify-between border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-zinc-900 rounded-lg text-zinc-100">
              <Shield className="w-5 h-5" />
            </span>
            <span className="text-base font-bold text-white tracking-tight">{businessName} Console</span>
          </div>
          <a href="/" className="text-xs font-semibold text-zinc-400 hover:text-white hover:underline transition-all">
            View Live Booking Page &rarr;
          </a>
        </header>

        {/* Dashboard Component */}
        <main className="w-full">
          <AdminDashboard initialSlots={initialSlots} />
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-black py-4 text-center text-[10px] text-zinc-700 tracking-wider font-semibold uppercase relative z-10">
        <p>&copy; {new Date().getFullYear()} {businessName}. Secure Session Enabled.</p>
      </footer>
    </div>
  );
}
