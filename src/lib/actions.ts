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
  email: string;
  phone: string;
  reason?: string;
  slotTime: string; // ISO String
}

// Customer Booking Server Action
export async function bookAppointment(input: BookingInput): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  // 1. Email verification
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email)) {
    return { success: false, error: 'Invalid email address format.' };
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
      `INSERT INTO appointments (customer_name, customer_email, customer_phone, service_reason, slot_time, status)
       VALUES ($1, $2, $3, $4, $5, 'booked')
       RETURNING id`,
      [input.name, input.email, input.phone, input.reason || '', input.slotTime]
    );

    const appointmentId = result.rows[0].id;

    // 5. Send instant confirmation email (SMTP or Resend)
    const dateFormatted = slotDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeFormatted = slotDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-top: 0;">Appointment Confirmed!</h2>
        <p>Hi <strong>${input.name}</strong>,</p>
        <p>Thank you for booking with us. Your appointment has been successfully scheduled.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Business:</strong></td>
            <td style="padding: 8px 0;">${businessName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Location:</strong></td>
            <td style="padding: 8px 0;">${businessLocation}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Date:</strong></td>
            <td style="padding: 8px 0;">${dateFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Time:</strong></td>
            <td style="padding: 8px 0;">${timeFormatted}</td>
          </tr>
          ${input.reason ? `
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Service/Reason:</strong></td>
            <td style="padding: 8px 0;">${input.reason}</td>
          </tr>
          ` : ''}
        </table>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 0.875rem; color: #64748b; margin-bottom: 0;">
          If you need to reschedule or cancel, please contact us directly. We look forward to seeing you!
        </p>
      </div>
    `;

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
          subject: `Appointment Confirmed - ${businessName}`,
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
          subject: `Appointment Confirmed - ${businessName}`,
          html: emailHtml,
        });
        console.log(`[Instant Confirmation] Email sent via Resend.`);
      } catch (err) {
        console.error('[Instant Confirmation] Failed to send email via Resend:', err);
      }
    }

    // 6. Send INSTANT SMS confirmation (Fast2SMS)
    if (process.env.SMS_ENABLED === 'true' && process.env.FAST2SMS_API_KEY) {
      try {
        const phone10 = (input.phone || '').replace(/\D/g, '').slice(-10);
        if (phone10.length === 10) {
          const smsMsg = `Confirmed: Your appointment with ${businessName} is set for ${dateFormatted} at ${timeFormatted}. Thank you!`;
          const axios = require('axios');
          await axios.get('https://www.fast2sms.com/dev/bulkV2', {
            params: {
              authorization: process.env.FAST2SMS_API_KEY,
              variables_values: smsMsg,
              route: 'q',
              numbers: phone10,
            },
            timeout: 5000,
          });
          console.log(`[Instant Confirmation] SMS sent to ${phone10}.`);
        }
      } catch (err: any) {
        console.error('[Instant Confirmation] SMS send error:', err.message);
      }
    }

    // 7. Send INSTANT WhatsApp confirmation (via whatsapp-service)
    if (process.env.WHATSAPP_ENABLED === 'true') {
      try {
        const rawPhone = (input.phone || '').replace(/\D/g, '');
        if (rawPhone) {
          const waUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
          const waMsg = `Hi ${input.name}, your appointment with ${businessName} has been confirmed for ${dateFormatted} at ${timeFormatted}. Location: ${businessLocation}. We look forward to seeing you!`;
          const axios = require('axios');
          await axios.post(`${waUrl}/send`, { phone: rawPhone, message: waMsg }, { timeout: 5000 });
          console.log(`[Instant Confirmation] WhatsApp sent to ${rawPhone}.`);
        }
      } catch (err: any) {
        console.error('[Instant Confirmation] WhatsApp send error:', err.message);
      }
    }

    revalidatePath('/');
    revalidatePath('/admin');

    return { success: true, appointmentId };
  } catch (err: any) {
    console.error('Error booking appointment:', err);
    // Standardize Postgres unique key violation code: 23505
    if (err.code === '23505') {
      return { success: false, error: 'This slot has already been booked. Please select a different time slot.' };
    }
    return { success: false, error: err.message || 'An unexpected error occurred during booking.' };
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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(input.email)) {
    return { success: false, error: 'Invalid email address format.' };
  }

  try {
    await query(
      `UPDATE appointments 
       SET customer_name = $1, customer_email = $2, customer_phone = $3, service_reason = $4
       WHERE id = $5`,
      [input.name, input.email, input.phone, input.reason || '', id]
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
      `INSERT INTO appointments (customer_name, customer_email, customer_phone, service_reason, slot_time, status)
       VALUES ($1, $2, $3, $4, $5, 'booked')
       RETURNING id`,
      [input.name, input.email, input.phone, input.reason || '', input.slotTime]
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
