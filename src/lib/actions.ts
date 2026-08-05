'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';
import { query } from './db';
import { formatSlotDate, formatSlotRange } from './timezone';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

// Business Metadata
const _envName = process.env.NEXT_PUBLIC_BUSINESS_NAME;
const businessName = (_envName && _envName !== 'ABC' && _envName !== 'Aura Wellness') ? _envName : 'DAM Lighting Solutions';
const _envLoc = process.env.NEXT_PUBLIC_BUSINESS_LOCATION;
const businessLocation = (_envLoc && !_envLoc.includes('ABC') && !_envLoc.includes('Cityville')) ? _envLoc : 'Stall: H11- 0208';
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

    // 5. Send instant confirmation email (SMTP or Resend)
    const dateFormatted = formatSlotDate(slotDate, 'full');
    const timeFormatted = formatSlotRange(slotDate, 15, true);

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

        <hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.15); margin: 20px 0;" />
        <p style="font-size: 13px; color: #D1D5DB; margin: 0;">
          We look forward to seeing you at the DAM Lighting Solutions VR World!
        </p>
      </div>
    `;

    // 5. Send instant confirmation notifications in parallel (non-blocking)
    const notificationPromises: Promise<any>[] = [];

    // --- EMAIL ---
    if (input.email) {
      const userEmail = input.email;
      const sendEmailTask = async () => {
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (smtpUser && smtpPass) {
          try {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: smtpUser, pass: smtpPass },
              connectionTimeout: 4000,
              greetingTimeout: 4000,
              socketTimeout: 4000,
            });

            await transporter.sendMail({
              from: `"${businessName}" <${smtpUser}>`,
              to: userEmail,
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
              to: userEmail,
              subject: `VR Experience Pass - DAM Lighting Solutions`,
              html: emailHtml,
            });
            console.log(`[Instant Confirmation] Email sent via Resend.`);
          } catch (err) {
            console.error('[Instant Confirmation] Failed to send email via Resend:', err);
          }
        }
      };
      notificationPromises.push(sendEmailTask());
    }

    // --- WHATSAPP ---
    const isWaEnabled = String(process.env.WHATSAPP_ENABLED || '').toLowerCase().trim() === 'true';
    if (isWaEnabled) {
      const sendWaTask = async () => {
        const rawUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';
        const waUrl = rawUrl.trim().replace(/^["']|["']$/g, '');
        const waMsg = `Hi ${input.name},

Welcome to the *DAM Lighting Solutions* VR World.

 *Your immersive VR experience awaits.* 

 _Step inside. Explore. Experience lighting like never before._

${dateFormatted}
time ${timeFormatted}
📍Stall H11- 0208`;

        const sendSingleWa = async (targetPhone: string) => {
          try {
            let rawPhone = (targetPhone || '').replace(/\D/g, '');
            if (rawPhone.startsWith('0')) {
              rawPhone = rawPhone.replace(/^0+/, '');
            }
            if (rawPhone.length === 10) {
              rawPhone = '91' + rawPhone;
            }
            if (rawPhone) {
              const res = await fetch(`${waUrl}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: rawPhone, message: waMsg }),
                signal: AbortSignal.timeout(4000),
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
      };
      notificationPromises.push(sendWaTask());
    }

    // Await all parallel notifications so Vercel keeps lambda alive until email and WhatsApp complete
    await Promise.allSettled(notificationPromises);

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

// --- QR SCAN ACTIONS ---

// Save a QR scan linked to a user's appointment (their "account")
export async function saveQrScan(
  appointmentId: string,
  qrContent: string
): Promise<{ success: boolean; error?: string }> {
  if (!appointmentId || !qrContent) {
    return { success: false, error: 'Missing appointmentId or qrContent' };
  }
  try {
    await query(
      `INSERT INTO qr_scans (appointment_id, qr_content) VALUES ($1, $2)`,
      [appointmentId, qrContent]
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Admin: Export all users + their QR scans as structured data
export async function exportUsersWithScans(): Promise<{
  success: boolean;
  data?: {
    name: string;
    email: string;
    phone: string;
    alternativePhone: string;
    slotTime: string;
    status: string;
    scans: string[];
  }[];
  error?: string;
}> {
  const auth = await checkAdminAuth();
  if (!auth) return { success: false, error: 'Unauthorized' };

  try {
    const result = await query(
      `SELECT
         a.id,
         a.customer_name      AS name,
         a.customer_email     AS email,
         a.customer_phone     AS phone,
         a.customer_alternative_phone AS alternative_phone,
         a.slot_time,
         a.status,
         COALESCE(
           json_agg(qs.qr_content ORDER BY qs.scanned_at ASC)
             FILTER (WHERE qs.qr_content IS NOT NULL),
           '[]'
         ) AS scans
       FROM appointments a
       LEFT JOIN qr_scans qs ON qs.appointment_id = a.id
       GROUP BY a.id
       ORDER BY a.slot_time DESC`,
      []
    );

    const data = result.rows.map((row: any) => ({
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      alternativePhone: row.alternative_phone || '',
      slotTime: row.slot_time,
      status: row.status,
      scans: Array.isArray(row.scans) ? row.scans : [],
    }));

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
