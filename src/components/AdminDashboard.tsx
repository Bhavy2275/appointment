'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, Clock, User, Mail, Phone, MessageSquare, 
  Trash2, Check, X, Edit, Plus, ListFilter, 
  Search, ShieldAlert, CheckCircle, LogOut
} from 'lucide-react';
import { 
  createTimeSlots, deleteTimeSlot, 
  updateAppointmentStatus, updateAppointmentDetails, 
  adminBookAppointment, logoutAdmin 
} from '@/lib/actions';

interface AdminSlotRow {
  slot_id: string;
  slot_time: string;
  appointment_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_alternative_phone: string | null;
  service_reason: string | null;
  appointment_status: 'booked' | 'completed' | 'no-show' | 'cancelled' | null;
  reminder_sent: boolean | null;
}

interface AdminDashboardProps {
  initialSlots: AdminSlotRow[];
}

// Returns today's date in YYYY-MM-DD format using LOCAL timezone (not UTC)
function getLocalTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminDashboard({ initialSlots }: AdminDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<AdminSlotRow[]>(initialSlots);

  // Sync data whenever server re-renders with new initialSlots (after router.refresh())
  useEffect(() => {
    setData(initialSlots);
  }, [initialSlots]);
  const [activeTab, setActiveTab] = useState<'appointments' | 'slots'>('appointments');
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Single Slot Create State
  const [singleDate, setSingleDate] = useState('');
  const [singleTime, setSingleTime] = useState('');
  
  // Bulk Slot Create State
  const [bulkDate, setBulkDate] = useState('');
  const [bulkStart, setBulkStart] = useState('10:00 AM'); 
  const [bulkEnd, setBulkEnd] = useState('10:00 PM');   
  const [bulkInterval, setBulkInterval] = useState('15'); // default to 15 minutes

  // Edit Appointment Modal State
  const [editingAppointment, setEditingAppointment] = useState<{
    id: string;
    name: string;
    email: string;
    phone: string;
    alternativePhone: string;
    reason: string;
    slot_time: string;
  } | null>(null);

  // Manual Appointment Booking State
  const [manualBooking, setManualBooking] = useState<{
    slotTime: string;
    name: string;
    email: string;
    phone: string;
    alternativePhone: string;
    reason: string;
  } | null>(null);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleLogout = async () => {
    await logoutAdmin();
    window.location.href = '/admin/login';
  };

  // --- ACTIONS ---

  // Create single slot
  const handleCreateSingleSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleDate || !singleTime) {
      showNotification('error', 'Please select both date and time.');
      return;
    }

    // Robust parsing of date (DD/MM/YYYY) and time strings
    let localDate: Date;
    const timeClean = singleTime.trim();
    const dateCleaned = singleDate.trim();

    // Parse date: accept DD/MM/YYYY or DD-MM-YYYY
    const dateMatch = dateCleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!dateMatch) {
      showNotification('error', 'Invalid date. Use DD/MM/YYYY format (e.g. 15/08/2026).');
      return;
    }
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // 0-based
    const year = parseInt(dateMatch[3], 10);

    // Matches "14:15", "2:15 PM", "14.15", "2.15 PM", etc.
    const timeMatch = timeClean.match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/i);
    if (!timeMatch) {
      showNotification('error', 'Invalid time. Use HH:MM format (e.g. 14:30 or 2:30 PM).');
      return;
    }
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }

    localDate = new Date(year, month, day, hours, minutes, 0);

    if (isNaN(localDate.getTime())) {
      showNotification('error', 'Invalid date or time value. Use HH:MM format.');
      return;
    }

    const dateTimeStr = localDate.toISOString();
    console.log('[SlotCreate] Sending dateTimeStr:', dateTimeStr, '| Local:', localDate.toLocaleString());
    startTransition(async () => {
      const result = await createTimeSlots([dateTimeStr]);
      console.log('[SlotCreate] Result:', result);
      if (result.success && result.count && result.count > 0) {
        showNotification('success', `✓ Slot created: ${localDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`);
        setSingleDate('');
        setSingleTime('');
        refreshData();
      } else if (result.error === 'Unauthorized') {
        showNotification('error', 'Session expired. Redirecting to login...');
        setTimeout(() => router.push('/admin/login'), 2000);
      } else if (result.success && (!result.count || result.count === 0)) {
        showNotification('error', `Slot already exists for ${localDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} — pick a different time.`);
      } else {
        showNotification('error', result.error || 'Failed to create slot.');
      }
    });
  };

  // Bulk generate slots
  const handleBulkGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkDate || !bulkStart || !bulkEnd) {
      showNotification('error', 'Please fill in all bulk slot options.');
      return;
    }

    // Parse date (DD/MM/YYYY or DD-MM-YYYY)
    const dateCleaned = bulkDate.trim();
    const dateMatch = dateCleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    let day: number, month: number, year: number;

    if (dateMatch) {
      day = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10) - 1; // 0-based
      year = parseInt(dateMatch[3], 10);
    } else {
      // Fallback YYYY-MM-DD
      const parts = dateCleaned.split('-');
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else {
        showNotification('error', 'Invalid date format for bulk generation. Use DD/MM/YYYY (e.g. 08/05/2026).');
        return;
      }
    }

    const baseDate = new Date(year, month, day);
    if (isNaN(baseDate.getTime())) {
      showNotification('error', 'Invalid date value. Use DD/MM/YYYY format.');
      return;
    }

    const startMinutes = parseTimeToMinutes(bulkStart);
    const endMinutes = parseTimeToMinutes(bulkEnd);

    if (startMinutes === null || endMinutes === null) {
      showNotification('error', 'Invalid start or end time format. Use HH:MM or 10:00 AM format.');
      return;
    }

    const interval = parseInt(bulkInterval, 10);
    const slotTimes: string[] = [];

    if (startMinutes <= endMinutes) {
      // Normal range within the same calendar day
      for (let m = startMinutes; m <= endMinutes; m += interval) {
        const hours = Math.floor(m / 60);
        const mins = m % 60;
        const localDate = new Date(year, month, day, hours, mins, 0);
        slotTimes.push(localDate.toISOString());
      }
    } else {
      // Range spans across midnight
      for (let m = startMinutes; m < 1440; m += interval) {
        const hours = Math.floor(m / 60);
        const mins = m % 60;
        const localDate = new Date(year, month, day, hours, mins, 0);
        slotTimes.push(localDate.toISOString());
      }
      
      const nextDayObj = new Date(year, month, day + 1);
      const nextYear = nextDayObj.getFullYear();
      const nextMonth = nextDayObj.getMonth();
      const nextDay = nextDayObj.getDate();

      let lastSlotMin = startMinutes;
      while (lastSlotMin + interval < 1440) {
        lastSlotMin += interval;
      }
      const nextDayStartMin = (lastSlotMin + interval) - 1440;

      for (let m = nextDayStartMin; m <= endMinutes; m += interval) {
        const hours = Math.floor(m / 60);
        const mins = m % 60;
        const localDate = new Date(nextYear, nextMonth, nextDay, hours, mins, 0);
        slotTimes.push(localDate.toISOString());
      }
    }

    startTransition(async () => {
      const result = await createTimeSlots(slotTimes);
      if (result.success) {
        const dateFormatted = baseDate.toLocaleDateString('en-IN', { dateStyle: 'medium' });
        showNotification('success', `✓ Bulk generated ${result.count || 0} slot(s) starting ${dateFormatted}`);
        refreshData();
      } else if (result.error === 'Unauthorized') {
        showNotification('error', 'Session expired. Redirecting to login...');
        setTimeout(() => router.push('/admin/login'), 2000);
      } else {
        showNotification('error', result.error || 'Failed to generate slots.');
      }
    });
  };

  const parseTimeToMinutes = (timeStr: string): number | null => {
    if (!timeStr) return null;
    const clean = timeStr.trim();
    const match = clean.match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];

    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  };

  // Delete slot
  const handleDeleteSlot = async (slotId: string, isBooked: boolean) => {
    const confirmMsg = isBooked
      ? 'WARNING: This slot is currently booked. Deleting this slot will also CANCEL the appointment. Do you want to proceed?'
      : 'Are you sure you want to delete this time slot?';

    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      const result = await deleteTimeSlot(slotId);
      if (result.success) {
        showNotification('success', 'Time slot deleted.');
        refreshData();
      } else {
        showNotification('error', result.error || 'Failed to delete slot.');
      }
    });
  };

  // Update Status (Completed, No-show, Cancelled)
  const handleStatusUpdate = async (appointmentId: string, status: 'booked' | 'completed' | 'no-show' | 'cancelled') => {
    startTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, status);
      if (result.success) {
        showNotification('success', `Appointment status updated to ${status}.`);
        refreshData();
      } else {
        showNotification('error', result.error || 'Failed to update status.');
      }
    });
  };

  // Update customer details
  const handleEditDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppointment) return;

    startTransition(async () => {
      const result = await updateAppointmentDetails(editingAppointment.id, {
        name: editingAppointment.name,
        email: editingAppointment.email.trim() || undefined,
        phone: editingAppointment.phone,
        alternativePhone: editingAppointment.alternativePhone.trim() || undefined,
        reason: editingAppointment.reason,
      });

      if (result.success) {
        showNotification('success', 'Appointment details updated successfully.');
        setEditingAppointment(null);
        refreshData();
      } else {
        showNotification('error', result.error || 'Failed to update details.');
      }
    });
  };

  // Create manual booking
  const handleManualBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBooking) return;

    startTransition(async () => {
      const result = await adminBookAppointment({
        name: manualBooking.name,
        email: manualBooking.email.trim() || undefined,
        phone: manualBooking.phone,
        alternativePhone: manualBooking.alternativePhone.trim() || undefined,
        reason: manualBooking.reason,
        slotTime: manualBooking.slotTime,
      });

      if (result.success) {
        showNotification('success', 'Manual booking created successfully.');
        setManualBooking(null);
        refreshData();
      } else {
        showNotification('error', result.error || 'Failed to book appointment.');
      }
    });
  };

  const refreshData = useCallback(() => {
    router.refresh();
  }, [router]);

  // --- FILTERS & COMPUTED ---

  const filteredAppointments = data.filter((item) => {
    if (!item.appointment_id) return false;
    
    // Status Filter
    if (statusFilter !== 'all' && item.appointment_status !== statusFilter) {
      return false;
    }

    // Search Term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      const nameMatch = (item.customer_name || '').toLowerCase().includes(search);
      const emailMatch = (item.customer_email || '').toLowerCase().includes(search);
      const phoneMatch = (item.customer_phone || '').toLowerCase().includes(search);
      const altPhoneMatch = (item.customer_alternative_phone || '').toLowerCase().includes(search);
      const reasonMatch = (item.service_reason || '').toLowerCase().includes(search);
      return nameMatch || emailMatch || phoneMatch || altPhoneMatch || reasonMatch;
    }

    return true;
  });

  // Sort appointments: booked first, then by date ascending
  const sortedAppointments = [...filteredAppointments].sort((a, b) => {
    if (a.appointment_status === 'booked' && b.appointment_status !== 'booked') return -1;
    if (a.appointment_status !== 'booked' && b.appointment_status === 'booked') return 1;
    return new Date(a.slot_time).getTime() - new Date(b.slot_time).getTime();
  });

  return (
    <div className="space-y-8 animate-fade-in relative text-zinc-100">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border bg-zinc-900 border-zinc-800 text-white transition-all`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5 text-zinc-300" /> : <ShieldAlert className="w-5 h-5 text-zinc-400" />}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Dashboard Top Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Control Center</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Manage schedules, slot lists, and bookings</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'appointments'
                ? 'bg-white text-black shadow-md'
                : 'bg-zinc-950/60 hover:bg-zinc-950/90 text-zinc-400 hover:text-white'
            }`}
          >
            Bookings
          </button>
          <button
            onClick={() => setActiveTab('slots')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'slots'
                ? 'bg-white text-black shadow-md'
                : 'bg-zinc-950/60 hover:bg-zinc-950/90 text-zinc-400 hover:text-white'
            }`}
          >
            Time Slots
          </button>
          <button
            onClick={handleLogout}
            className="p-2 bg-zinc-950/60 border border-zinc-800 hover:border-white hover:text-white text-zinc-400 rounded-xl transition-all cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* --- APPOINTMENTS TAB --- */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl">
            {/* Search */}
            <div className="md:col-span-6 relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, or phone..."
                className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl py-2.5 pl-10 pr-4 text-zinc-200 placeholder-zinc-700 outline-none text-sm transition-all"
              />
            </div>

            {/* Filter status */}
            <div className="md:col-span-6 flex items-center gap-3 justify-end">
              <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
                <ListFilter className="w-3.5 h-3.5" /> Status:
              </span>
              <div className="flex gap-2 overflow-x-auto">
                {['all', 'booked', 'completed', 'no-show', 'cancelled'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === status
                        ? 'bg-zinc-800 text-white'
                        : 'bg-zinc-950/45 border border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {status === 'all' ? 'All' : status.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bookings List */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            {sortedAppointments.length === 0 ? (
              <div className="text-center py-16 px-4">
                <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-300 font-semibold text-lg">No appointments found</p>
                <p className="text-zinc-500 text-sm mt-1">Try modifying your search or filter tags.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                      <th className="py-4 px-6">Customer</th>
                      <th className="py-4 px-6">Date & Time</th>
                      <th className="py-4 px-6">Reason / Service</th>
                      <th className="py-4 px-6">Reminders</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {sortedAppointments.map((item) => {
                      const dateObj = new Date(item.slot_time);
                      const formattedDate = dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      const formattedTime = dateObj.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <tr key={item.appointment_id} className="hover:bg-zinc-900/20 transition-all text-sm">
                          {/* Customer */}
                          <td className="py-4 px-6">
                            <div>
                              <p className="font-semibold text-zinc-200">{item.customer_name}</p>
                              <p className="text-xs text-zinc-550 mt-0.5">{item.customer_email || <span className="italic text-zinc-600">No email</span>}</p>
                              <p className="text-xs text-zinc-500 mt-0.5">Primary: {item.customer_phone}</p>
                              {item.customer_alternative_phone && (
                                <p className="text-xs text-zinc-500 mt-0.5">Alt: {item.customer_alternative_phone}</p>
                              )}
                            </div>
                          </td>
                          {/* Date & Time */}
                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span className="text-zinc-200 font-medium">{formattedDate}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="w-3.5 h-3.5 text-zinc-600" />
                              <span className="text-zinc-500 text-xs">{formattedTime}</span>
                            </div>
                          </td>
                          {/* Reason */}
                          <td className="py-4 px-6">
                            <p className="text-zinc-300 max-w-[200px] truncate" title={item.service_reason || ''}>
                              {item.service_reason || <span className="text-zinc-600 italic">None provided</span>}
                            </p>
                          </td>
                          {/* Reminder status */}
                          <td className="py-4 px-6">
                            {item.appointment_status === 'booked' ? (
                              item.reminder_sent ? (
                                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-white font-medium border border-zinc-700">
                                  Sent
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-zinc-950 text-zinc-500 font-medium border border-zinc-800">
                                  Pending
                                </span>
                              )
                            ) : (
                              <span className="text-zinc-600 text-xs">&mdash;</span>
                            )}
                          </td>
                          {/* Status */}
                          <td className="py-4 px-6">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                              item.appointment_status === 'booked'
                                ? 'bg-zinc-800 border-zinc-700 text-white'
                                : item.appointment_status === 'completed'
                                ? 'bg-white text-black border-white'
                                : item.appointment_status === 'no-show'
                                ? 'bg-zinc-950 border-zinc-850 text-zinc-500'
                                : 'bg-zinc-950 border-zinc-900 text-zinc-600'
                            }`}>
                              {item.appointment_status}
                            </span>
                          </td>
                          {/* Actions */}
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {item.appointment_status === 'booked' && (
                                <>
                                  <button
                                    onClick={() => handleStatusUpdate(item.appointment_id!, 'completed')}
                                    className="p-2 bg-zinc-950/60 hover:bg-white hover:text-black text-zinc-400 border border-zinc-800 rounded-xl transition-all cursor-pointer"
                                    title="Mark Completed"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleStatusUpdate(item.appointment_id!, 'no-show')}
                                    className="p-2 bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-xl transition-all cursor-pointer"
                                    title="Mark No-Show"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              
                              <button
                                onClick={() => setEditingAppointment({
                                  id: item.appointment_id!,
                                  name: item.customer_name || '',
                                  email: item.customer_email || '',
                                  phone: item.customer_phone || '',
                                  alternativePhone: item.customer_alternative_phone || '',
                                  reason: item.service_reason || '',
                                  slot_time: item.slot_time
                                })}
                                className="p-2 bg-zinc-950/60 hover:bg-white hover:text-black text-zinc-400 border border-zinc-800 rounded-xl transition-all cursor-pointer"
                                title="Edit Customer Details"
                              >
                                <Edit className="w-4 h-4" />
                              </button>

                              {item.appointment_status !== 'cancelled' && (
                                <button
                                  onClick={() => handleStatusUpdate(item.appointment_id!, 'cancelled')}
                                  className="text-xs font-semibold px-2.5 py-1.5 bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-xl transition-all cursor-pointer"
                                  title="Cancel Appointment"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TIME SLOTS TAB --- */}
      {activeTab === 'slots' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in">
          {/* Creator panel (left) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Single Slot Creator */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5 text-zinc-400" /> Create Single Slot
              </h2>
              <form onSubmit={handleCreateSingleSlot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Date</label>
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/YYYY"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    maxLength={10}
                    className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all placeholder:text-zinc-600"
                  />
                  {singleDate && singleDate.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/) && (() => {
                    const [d, m, y] = singleDate.split(/[\/-]/).map(Number);
                    const parsed = new Date(y, m - 1, d);
                    return !isNaN(parsed.getTime()) ? (
                      <p className="text-xs text-emerald-400 mt-1 font-medium">
                        ✓ {parsed.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Time</label>
                  <input
                    type="time"
                    required
                    value={singleTime}
                    onChange={(e) => setSingleTime(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-3 px-4 rounded-xl text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  Create Time Slot
                </button>
              </form>
            </div>

            {/* Bulk Slot Generator */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-zinc-400" /> Bulk Slot Generator
              </h2>
              <form onSubmit={handleBulkGenerate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Day Date</label>
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all placeholder:text-zinc-600"
                  />
                  {bulkDate && bulkDate.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/) && (() => {
                    const [d, m, y] = bulkDate.split(/[\/-]/).map(Number);
                    const parsed = new Date(y, m - 1, d);
                    return !isNaN(parsed.getTime()) ? (
                      <p className="text-xs text-emerald-400 mt-1 font-medium">
                        ✓ {parsed.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    ) : null;
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Start Time</label>
                    <input
                      type="text"
                      required
                      placeholder="10:00 AM"
                      value={bulkStart}
                      onChange={(e) => setBulkStart(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">End Time</label>
                    <input
                      type="text"
                      required
                      placeholder="10:00 PM"
                      value={bulkEnd}
                      onChange={(e) => setBulkEnd(e.target.value)}
                      className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all placeholder:text-zinc-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Interval</label>
                  <select
                    value={bulkInterval}
                    onChange={(e) => setBulkInterval(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 outline-none text-sm transition-all"
                  >
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="45">Every 45 minutes</option>
                    <option value="60">Every 60 minutes (1 Hour)</option>
                    <option value="120">Every 120 minutes (2 Hours)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-semibold py-3 px-4 rounded-xl text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  Bulk Generate Slots
                </button>
              </form>
            </div>
          </div>

          {/* Slots List (Right) */}
          <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="py-4 px-6 bg-zinc-950/40 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Configured Time Slots</h2>
              <span className="text-xs text-zinc-500 font-semibold">{data.length} total slots</span>
            </div>
            {data.length === 0 ? (
              <div className="text-center py-16 px-4">
                <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-300 font-semibold text-lg">No slots configured</p>
                <p className="text-zinc-500 text-sm mt-1">Use the left generator tools to populate available times.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-850 max-h-[600px] overflow-y-auto">
                {data.map((item) => {
                  const dateObj = new Date(item.slot_time);
                  const endDateObj = new Date(dateObj.getTime() + 15 * 60000);
                  
                  const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });
                  const startTimeStr = dateObj.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const endTimeStr = endDateObj.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const formattedDateTime = `${formattedDate} @ ${startTimeStr} - ${endTimeStr}`;

                  const isBooked = !!item.appointment_id;

                  return (
                    <div key={item.slot_id} className="p-4 flex items-center justify-between hover:bg-zinc-900/10 transition-all text-sm">
                      <div className="flex items-center gap-3">
                        <Clock className={`w-4 h-4 ${isBooked ? 'text-zinc-300' : 'text-zinc-600'}`} />
                        <div>
                          <p className="font-semibold text-zinc-200">{formattedDateTime}</p>
                          {isBooked ? (
                            <p className="text-xs text-zinc-300 font-semibold mt-0.5 flex items-center gap-1">
                              Booked by {item.customer_name} 
                              <span className="text-zinc-500">&bull; {item.appointment_status}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-450 font-semibold mt-0.5">Available for Bookings</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!isBooked && (
                          <button
                            onClick={() => setManualBooking({
                              slotTime: item.slot_time,
                              name: '',
                              email: '',
                              phone: '',
                              alternativePhone: '',
                              reason: '',
                            })}
                            className="text-xs font-semibold px-2.5 py-1 rounded bg-white text-black hover:bg-zinc-200 transition-all cursor-pointer"
                          >
                            Book Manually
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSlot(item.slot_id, isBooked)}
                          className="p-1.5 bg-zinc-950/60 hover:bg-zinc-800 text-zinc-500 hover:text-white border border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Delete slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- EDIT DETAILS MODAL --- */}
      {editingAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setEditingAppointment(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Edit className="text-zinc-450" /> Edit Booking Details
            </h3>
            <p className="text-xs text-zinc-500 mb-6">
              Modifying appointment for {new Date(editingAppointment.slot_time).toLocaleString()}
            </p>

            <form onSubmit={handleEditDetailsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Customer Name</label>
                <input
                  type="text"
                  required
                  value={editingAppointment.name}
                  onChange={(e) => setEditingAppointment({...editingAppointment, name: e.target.value})}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Email Address <span className="text-zinc-600">(Optional)</span></label>
                <input
                  type="email"
                  value={editingAppointment.email}
                  onChange={(e) => setEditingAppointment({...editingAppointment, email: e.target.value})}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input
                  type="text"
                  required
                  value={editingAppointment.phone}
                  onChange={(e) => setEditingAppointment({...editingAppointment, phone: e.target.value})}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Alternative Phone Number <span className="text-zinc-600">(Optional)</span></label>
                <input
                  type="text"
                  value={editingAppointment.alternativePhone}
                  onChange={(e) => setEditingAppointment({...editingAppointment, alternativePhone: e.target.value})}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Service Reason</label>
                <textarea
                  value={editingAppointment.reason}
                  onChange={(e) => setEditingAppointment({...editingAppointment, reason: e.target.value})}
                  rows={3}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none resize-none transition-all"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingAppointment(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-400 font-semibold text-sm hover:text-white transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MANUAL BOOKING MODAL --- */}
      {manualBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setManualBooking(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Plus className="text-zinc-450" /> Book Slot Manually
            </h3>
            <p className="text-xs text-zinc-550 mb-6">
              Creating reservation for {new Date(manualBooking.slotTime).toLocaleString()}
            </p>

            <form onSubmit={handleManualBookingSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Customer Name</label>
                <input
                  type="text"
                  required
                  value={manualBooking.name}
                  onChange={(e) => setManualBooking({...manualBooking, name: e.target.value})}
                  placeholder="John Doe"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Email Address <span className="text-zinc-600">(Optional)</span></label>
                <input
                  type="email"
                  value={manualBooking.email}
                  onChange={(e) => setManualBooking({...manualBooking, email: e.target.value})}
                  placeholder="john@example.com"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input
                  type="text"
                  required
                  value={manualBooking.phone}
                  onChange={(e) => setManualBooking({...manualBooking, phone: e.target.value})}
                  placeholder="555-555-5555"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Alternative Phone Number <span className="text-zinc-600">(Optional)</span></label>
                <input
                  type="text"
                  value={manualBooking.alternativePhone}
                  onChange={(e) => setManualBooking({...manualBooking, alternativePhone: e.target.value})}
                  placeholder="555-555-5555"
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Service Reason</label>
                <textarea
                  value={manualBooking.reason}
                  onChange={(e) => setManualBooking({...manualBooking, reason: e.target.value})}
                  placeholder="Service description or notes"
                  rows={3}
                  className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-white rounded-xl p-3 text-zinc-200 text-sm outline-none resize-none transition-all"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setManualBooking(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-400 font-semibold text-sm hover:text-white transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-3 px-4 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-sm transition-all active:scale-[0.98] cursor-pointer"
                >
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
