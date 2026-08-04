'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { query } from './db';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

// Business Metadata
const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';
const businessLocation = process.env.NEXT_PUBLIC_BUSINESS_LOCATION || '123 Wellness Way, Cityville';
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// --- AUTHENTICATION ACTIONS ---

export async function loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return { success: false, error: 'ADMIN_PASSWORD is not set in server environment.' };
  }

  if (password !== adminPassword) {
    return { success: false, error: 'Incorrect password.' };
  }

  const hash = crypto.createHash('sha256').update(adminPassword).digest('hex');
  const cookieStore = await cookies();
  cookieStore.set('admin_session', hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  return { success: true };
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
  return { success: true };
}

export async function checkAdminAuth(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return false;

  const expected = crypto.createHash('sha256').update(adminPassword).digest('hex');
  return token === expected;
}

// --- TIME SLOT ACTIONS ---

export interface TimeSlot {
  id: string;
  slot_time: Date;
  is_booked?: boolean;
}

// Fetch all slots (with appointments if any) - Admin only
export async function getAdminTimeSlots() {
  const auth = await checkAdminAuth();
  if (!auth) throw new Error('Unauthorized');

  const sql = `
    SELECT 
      ts.id as slot_id, 
      ts.slot_time, 
      a.id as appointment_id, 
      a.customer_name, 
      a.customer_email, 
      a.customer_phone, 
      a.customer_alternative_phone, 
      a.service_reason, 
      a.status as appointment_status, 
      a.reminder_sent
    FROM time_slots ts
    LEFT JOIN appointments a ON ts.slot_time = a.slot_time AND a.status IN ('booked', 'completed', 'no-show')
    ORDER BY ts.slot_time ASC
  `;
  const result = await query(sql);
  return result.rows;
}

// Fetch available slots for the customer (future slots only, not booked)
export async function getAvailableTimeSlots(): Promise<TimeSlot[]> {
  const sql = `
    SELECT ts.id, ts.slot_time
    FROM time_slots ts
    LEFT JOIN appointments a ON ts.slot_time = a.slot_time AND a.status IN ('booked', 'completed', 'no-show')
    WHERE ts.slot_time > NOW()
      AND a.id IS NULL
    ORDER BY ts.slot_time ASC
  `;
  const result = await query(sql);
  return result.rows.map(row => ({
    id: row.id,
    slot_time: new Date(row.slot_time),
    is_booked: false
  }));
}

// Create new time slots (Admin only)
export async function createTimeSlots(dateTimeStrings: string[]): Promise<{ success: boolean; count?: number; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  try {
    let insertedCount = 0;
    for (const dt of dateTimeStrings) {
      const res = await query(
        'INSERT INTO time_slots (slot_time) VALUES ($1) ON CONFLICT (slot_time) DO NOTHING',
        [new Date(dt).toISOString()]
      );
      if (res.rowCount && res.rowCount > 0) {
        insertedCount++;
      }
    }
    revalidatePath('/');
    revalidatePath('/admin');
    return { success: true, count: insertedCount };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create time slots' };
  }
}

// Delete time slot (Admin only)
export async function deleteTimeSlot(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  try {
    await query('DELETE FROM time_slots WHERE id = $1', [id]);
    revalidatePath('/');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete time slot' };
  }
}

// --- APPOINTMENT ACTIONS ---

export interface BookingInput {
  name: string;
  email?: string;
  phone: string;
  alternativePhone?: string;
  reason?: string;
  slotTime: string; // ISO String
}

// Customer Booking Server Action
export async function bookAppointment(input: BookingInput): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  // 1. Email verification (only if email is provided)
  if (input.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      return { success: false, error: 'Invalid email address format.' };
    }
  }

  // 2. Block past dates
  const slotDate = new Date(input.slotTime);
  if (slotDate.getTime() < Date.now()) {
    return { success: false, error: 'Cannot book appointments in the past.' };
  }

  try {
    // 3. Double-booking prevention at application level check (before insert)
    const existingCheck = await query(
      "SELECT id FROM appointments WHERE slot_time = $1 AND status IN ('booked', 'completed', 'no-show')",
      [input.slotTime]
    );
    if (existingCheck.rows.length > 0) {
      return { success: false, error: 'This time slot has already been booked. Please choose another slot.' };
    }

    // Check if slot exists in time_slots
    const slotCheck = await query('SELECT id FROM time_slots WHERE slot_time = $1', [input.slotTime]);
    if (slotCheck.rows.length === 0) {
      return { success: false, error: 'The selected time slot is not available or has been deleted.' };
    }

    // 4. Insert booking
    const result = await query(
      `INSERT INTO appointments (customer_name, customer_email, customer_phone, customer_alternative_phone, service_reason, slot_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'booked')
       RETURNING id`,
      [input.name, input.email || null, input.phone, input.alternativePhone || null, input.reason || '', input.slotTime]
    );

    const appointmentId = result.rows[0].id;

    // Build verification URL for the QR code ticket
    const appHost = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verifyUrl = `${appHost.replace(/\/$/, '')}/verify/${appointmentId}`;

    // Generate QR Code Data URL
    let qrDataUrl = '';
    try {
      const QRCode = require('qrcode');
      qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 2 });
    } catch (qrErr) {
      console.error('[QR] Error generating QR data URL:', qrErr);
    }

    // 5. Send instant confirmation email (SMTP or Resend)
    const businessTimezone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
    const dateFormatted = slotDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: businessTimezone
    });
    const timeFormatted = `${slotDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: businessTimezone
    })} - ${new Date(slotDate.getTime() + 15 * 60000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: businessTimezone,
      timeZoneName: 'short'
    })}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background-color: #101566; color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">DAM Lighting Solutions</h2>
          <p style="color: #EEF2F6; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px; font-weight: 600;">VR World Session Ticket</p>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.15); margin: 20px 0;" />
        <p style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 12px;">Hi ${input.name},</p>
        <p style="font-size: 15px; color: #EEF2F6; margin-bottom: 12px;">Welcome to the <strong>DAM Lighting Solutions</strong> VR World.</p>
        <p style="font-size: 15px; color: #ffffff; font-weight: 700; margin-bottom: 8px;"><em>Your immersive VR experience awaits.</em></p>
        <p style="font-size: 14px; color: #D1D5DB; font-style: italic; margin-bottom: 20px;">Step inside. Explore. Experience lighting like never before.</p>
        
        <div style="background-color: #0B0E42; padding: 18px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15); margin-bottom: 20px;">
          <p style="font-size: 15px; color: #ffffff; margin: 0 0 6px 0; font-weight: 600;">${dateFormatted}</p>
          <p style="font-size: 14px; color: #EEF2F6; margin: 0 0 6px 0;">time ${timeFormatted}</p>
          <p style="font-size: 14px; color: #ffffff; margin: 0; font-weight: 600;">📍Stall H11- 0208</p>
        </div>

        ${qrDataUrl ? `
        <div style="text-align: center; background-color: #ffffff; padding: 16px; border-radius: 12px; margin-bottom: 20px; display: inline-block; width: 100%; box-sizing: border-box;">
          <img src="${qrDataUrl}" alt="VR Ticket Pass QR Code" style="width: 180px; height: 180px; display: block; margin: 0 auto;" />
          <p style="color: #101566; font-size: 12px; font-weight: 700; margin-top: 8px;">Show this QR Code at Stall H11- 0208 for entry</p>
          <a href="${verifyUrl}" style="color: #101566; font-size: 12px; text-decoration: underline; font-weight: 600;">View Ticket Pass Online &rarr;</a>
        </div>
        ` : ''}

        <hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.15); margin: 20px 0;" />
        <p style="font-size: 13px; color: #D1D5DB; margin: 0;">
          We look forward to seeing you at the DAM Lighting Solutions VR World!
        </p>
      </div>
    `;

    if (input.email) {
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpUser && smtpPass) {
        try {
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          await transporter.sendMail({
            from: `"${businessName}" <${smtpUser}>`,
            to: input.email,
            subject: `VR Experience Pass - DAM Lighting Solutions`,
            html: emailHtml,
          });
          console.log(`[Instant Confirmation] Email sent via Gmail SMTP.`);
        } catch (err) {
          console.error('[Instant Confirmation] Failed to send email via SMTP:', err);
        }
      } else if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_dummy_key') {
        try {
          await resend.emails.send({
            from: `${businessName} <${fromEmail}>`,
            to: input.email,
            subject: `VR Experience Pass - DAM Lighting Solutions`,
            html: emailHtml,
          });
          console.log(`[Instant Confirmation] Email sent via Resend.`);
        } catch (err) {
          console.error('[Instant Confirmation] Failed to send email via Resend:', err);
        }
      }
    }

    // 6. Send INSTANT SMS confirmation (Fast2SMS)
    const isSmsEnabled = String(process.env.SMS_ENABLED || '').toLowerCase().trim() === 'true';
    if (isSmsEnabled && process.env.FAST2SMS_API_KEY) {
      const smsMsg = encodeURIComponent(`Confirmed: Your DAM Lighting VR session is set for ${dateFormatted} at ${timeFormatted}. Pass: ${verifyUrl}`);
      const sendSingleSms = async (targetPhone: string) => {
        try {
          const phone10 = (targetPhone || '').replace(/\D/g, '').slice(-10);
          if (phone10.length === 10) {
            const smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&variables_values=${smsMsg}&route=q&numbers=${phone10}`;
            const res = await fetch(smsUrl);
            console.log(`[Instant Confirmation] SMS sent to ${phone10}. Status: ${res.status}`);
          }
        } catch (err: any) {
          console.error('[Instant Confirmation] SMS send error:', err.message);
        }
      };
      await sendSingleSms(input.phone);
      if (input.alternativePhone) {
        await sendSingleSms(input.alternativePhone);
      }
    }

    // 7. Send INSTANT WhatsApp confirmation (via whatsapp-service)
    const isWaEnabled = String(process.env.WHATSAPP_ENABLED || '').toLowerCase().trim() === 'true';
    if (isWaEnabled) {
      const rawUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
      const waUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
      const waMsg = `Hi ${input.name},

Welcome to the *DAM Lighting Solutions* VR World.

 *Your immersive VR experience awaits.* 

 _Step inside. Explore. Experience lighting like never before._

${dateFormatted}
time ${timeFormatted}
📍Stall H11- 0208

🎟️ *Your Ticket Pass:* ${verifyUrl}`;
      const sendSingleWa = async (targetPhone: string) => {
        try {
          const rawPhone = (targetPhone || '').replace(/\D/g, '');
          if (rawPhone) {
            const res = await fetch(`${waUrl}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: rawPhone, message: waMsg }),
            });
            const text = await res.text();
            console.log(`[Instant Confirmation] WhatsApp request sent to ${rawPhone}. Status: ${res.status}, Response: ${text}`);
          }
        } catch (err: any) {
          console.error('[Instant Confirmation] WhatsApp send error:', err.message);
        }
      };
      await sendSingleWa(input.phone);
      if (input.alternativePhone) {
        await sendSingleWa(input.alternativePhone);
      }
    }

    revalidatePath('/');
    revalidatePath('/admin');

    return { success: true, appointmentId };
  } catch (err: any) {
    console.error('Error booking appointment:', err);
    if (err.code === '23505') {
      return { success: false, error: 'This slot has already been booked. Please select a different time slot.' };
    }
    return { success: false, error: err.message || 'An unexpected error occurred during booking.' };
  }
}

// Fetch appointment details by ID for ticket verification
export async function getAppointmentById(id: string) {
  try {
    const result = await query(
      `SELECT id, customer_name, customer_email, customer_phone, customer_alternative_phone, service_reason, slot_time, status, created_at
       FROM appointments
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (err: any) {
    console.error('Error fetching appointment by id:', err);
    return null;
  }
}

// Mark appointment status as completed/checked-in (Admin or Stall Scanner)
export async function checkInAppointment(id: string) {
  try {
    await query(
      `UPDATE appointments SET status = 'completed' WHERE id = $1`,
      [id]
    );
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath(`/verify/${id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to check in appointment' };
  }
}

// Update appointment status (Admin only)
export async function updateAppointmentStatus(
  id: string,
  status: 'booked' | 'completed' | 'no-show' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  try {
    await query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
    revalidatePath('/');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update appointment status' };
  }
}

// Edit appointment details (Admin only)
export async function updateAppointmentDetails(
  id: string,
  input: Omit<BookingInput, 'slotTime'>
): Promise<{ success: boolean; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  if (input.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      return { success: false, error: 'Invalid email address format.' };
    }
  }

  try {
    await query(
      `UPDATE appointments 
       SET customer_name = $1, customer_email = $2, customer_phone = $3, customer_alternative_phone = $4, service_reason = $5
       WHERE id = $6`,
      [input.name, input.email || null, input.phone, input.alternativePhone || null, input.reason || '', id]
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update appointment details' };
  }
}

// Manually book an appointment as Admin
export async function adminBookAppointment(
  input: BookingInput
): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  // Skip the past date limit if it's admin forcing it, but let's keep it safe.
  try {
    // Check if slot exists. If not, create it!
    const slotCheck = await query('SELECT id FROM time_slots WHERE slot_time = $1', [input.slotTime]);
    if (slotCheck.rows.length === 0) {
      await query('INSERT INTO time_slots (slot_time) VALUES ($1)', [input.slotTime]);
    }

    // Create booking
    const result = await query(
      `INSERT INTO appointments (customer_name, customer_email, customer_phone, customer_alternative_phone, service_reason, slot_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'booked')
       RETURNING id`,
      [input.name, input.email || null, input.phone, input.alternativePhone || null, input.reason || '', input.slotTime]
    );

    revalidatePath('/');
    revalidatePath('/admin');
    return { success: true, appointmentId: result.rows[0].id };
  } catch (err: any) {
    if (err.code === '23505') {
      return { success: false, error: 'This time slot already has an active appointment.' };
    }
    return { success: false, error: err.message || 'Failed to book appointment' };
  }
}
