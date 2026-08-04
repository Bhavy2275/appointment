import { getAppointmentById } from '@/lib/actions';
import { notFound } from 'next/navigation';
import { CheckCircle, Clock, XCircle, MapPin, User, Phone, Calendar } from 'lucide-react';
import DamLogo from '@/components/DamLogo';

export const revalidate = 0;

interface Props {
  params: { id: string };
}

const STATUS_CONFIG = {
  booked: {
    label: 'Confirmed',
    icon: CheckCircle,
    color: '#22c55e',
    bg: '#052e16',
    border: 'rgba(34,197,94,0.3)',
  },
  completed: {
    label: 'Checked In ✓',
    icon: CheckCircle,
    color: '#86efac',
    bg: '#052e16',
    border: 'rgba(134,239,172,0.4)',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: '#f87171',
    bg: '#450a0a',
    border: 'rgba(248,113,113,0.3)',
  },
  'no-show': {
    label: 'No Show',
    icon: Clock,
    color: '#fbbf24',
    bg: '#451a03',
    border: 'rgba(251,191,36,0.3)',
  },
};

export default async function VerifyPage({ params }: Props) {
  const { id } = await params;
  const appointment = await getAppointmentById(id);

  if (!appointment) notFound();

  const tz = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
  const slotDate = new Date(appointment.slot_time);
  const dateFormatted = slotDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
  });
  const timeFormatted = `${slotDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: tz,
  })} - ${new Date(slotDate.getTime() + 15 * 60000).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short',
  })}`;

  const status = appointment.status as keyof typeof STATUS_CONFIG;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['booked'];
  const StatusIcon = cfg.icon;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#101566', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', textAlign: 'center' }}>
        <h1 style={{ color: '#ffffff', fontSize: '22px', fontWeight: '800', margin: '0 0 4px 0' }}>DAM Lighting Solutions</h1>
        <p style={{ color: '#EEF2F6', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', margin: 0, fontWeight: '600' }}>VR World Ticket Pass</p>
      </div>

      {/* Ticket Card */}
      <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#0B0E42', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        {/* Status Banner */}
        <div style={{ backgroundColor: cfg.bg, borderBottom: `1px solid ${cfg.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <StatusIcon style={{ width: '20px', height: '20px', color: cfg.color, flexShrink: 0 }} />
          <span style={{ color: cfg.color, fontWeight: '700', fontSize: '15px' }}>Status: {cfg.label}</span>
        </div>

        {/* Ticket Details */}
        <div style={{ padding: '24px' }}>
          {/* Guest Name */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
            <User style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 2px 0', fontWeight: '600' }}>Guest</p>
              <p style={{ color: '#ffffff', fontSize: '17px', fontWeight: '700', margin: 0 }}>{appointment.customer_name}</p>
            </div>
          </div>

          {/* Date */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
            <Calendar style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 2px 0', fontWeight: '600' }}>Session Date</p>
              <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '600', margin: 0 }}>{dateFormatted}</p>
            </div>
          </div>

          {/* Time */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
            <Clock style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 2px 0', fontWeight: '600' }}>Time Slot</p>
              <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '600', margin: 0 }}>{timeFormatted}</p>
            </div>
          </div>

          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
            <MapPin style={{ width: '16px', height: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 2px 0', fontWeight: '600' }}>Location</p>
              <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: '600', margin: 0 }}>Stall H11- 0208</p>
            </div>
          </div>

          {/* Booking Details */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '10px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 3px 0', fontWeight: '600' }}>Booking Reference</p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontFamily: 'monospace', margin: 0, wordBreak: 'break-all' }}>{appointment.id}</p>
          </div>
          <div style={{ marginTop: '12px', color: '#ffffff', fontSize: '13px' }}>
            {appointment.email && (<p>Email: {appointment.email}</p>)}
            {appointment.phone && (<p>Phone: {appointment.phone}</p>)}
            {appointment.alternativePhone && (<p>Alt Phone: {appointment.alternativePhone}</p>)}
            {appointment.reason && (<p>Reason: {appointment.reason}</p>)}
          </div>
        </div>

        {/* Footer Strip */}
        <div style={{ backgroundColor: '#080A30', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 24px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', margin: 0, fontWeight: '600' }}>
            DAM Lighting Solutions · Stall H11- 0208 · VR World
          </p>
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', marginTop: '20px', textAlign: 'center' }}>
        This ticket is unique to your booking. Please show it at the stall for entry.
      </p>
    </div>
  );
}
