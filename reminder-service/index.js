require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Client } = require('pg');
const { Resend } = require('resend');
const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────
const connectionString        = process.env.DATABASE_URL;
const resendApiKey            = process.env.RESEND_API_KEY;
const reminderHours           = parseInt(process.env.REMINDER_HOURS_BEFORE || '48', 10);
const businessName            = process.env.NEXT_PUBLIC_BUSINESS_NAME || 'Aura Wellness';
const fromEmail               = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// SMS (Fast2SMS)
const smsEnabled              = process.env.SMS_ENABLED === 'true';
const fast2smsApiKey          = process.env.FAST2SMS_API_KEY;

// WhatsApp (Baileys service)
const whatsappEnabled         = process.env.WHATSAPP_ENABLED === 'true';
const whatsappServiceUrl      = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:3001';

// ─── SMS sender (Fast2SMS Quick SMS — no DLT required) ────────────────────────
async function sendSms(appointment, dateFormatted, timeFormatted) {
  if (!smsEnabled) return;
  if (!fast2smsApiKey) {
    console.warn('[SMS] Skipped: FAST2SMS_API_KEY is not set.');
    return;
  }

  const phone = (appointment.customer_phone || '').replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) {
    console.warn(`[SMS] Skipped for appointment ${appointment.id}: phone number "${appointment.customer_phone}" could not be normalised to 10 digits.`);
    return;
  }

  const message =
    `Reminder: You have an appointment with ${businessName} on ${dateFormatted} at ${timeFormatted}. Please be on time.`;

  try {
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: fast2smsApiKey,
        variables_values: message,
        route: 'q',          // Quick SMS — no DLT registration required
        numbers: phone,
      },
      timeout: 10000,
    });

    const data = response.data;
    if (data && data.return === true) {
      console.log(`[SMS] ✓ Sent to ${phone}. Request ID: ${data.request_id}`);
      return true;
    } else {
      console.error(`[SMS] ✗ Fast2SMS returned an error for ${phone}:`, JSON.stringify(data));
      return false;
    }
  } catch (err) {
    console.error(`[SMS] ✗ Failed to send SMS for appointment ${appointment.id}:`, err.message);
    return false;
  }
}

// ─── WhatsApp sender (via always-on whatsapp-service) ─────────────────────────
async function sendWhatsApp(appointment, phone, dateFormatted, timeFormatted) {
  if (!whatsappEnabled) return false;

  const normalisedPhone = (phone || '').replace(/\D/g, '');
  if (!normalisedPhone) {
    console.warn(`[WhatsApp] Skipped for appointment ${appointment.id}: no phone number.`);
    return false;
  }

  const message = `Hi ${appointment.customer_name},

 *Your VR experience is ready.* 

 It begins in 5 minutes.
 Please make your way to Stall: H11- 0208.

DAM Lighting Solutions Team looks forward to take you to the  World of Lighting.`;

  try {
    const response = await axios.post(
      `${whatsappServiceUrl}/send`,
      { phone: normalisedPhone, message },
      { timeout: 15000 }
    );

    if (response.data && response.data.ok) {
      console.log(`[WhatsApp] ✓ Message queued for ${normalisedPhone}.`);
      return true;
    } else {
      console.warn(`[WhatsApp] ✗ Service responded with:`, JSON.stringify(response.data));
      return false;
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error(`[WhatsApp] ✗ whatsapp-service is unreachable at ${whatsappServiceUrl}. Is it running?`);
    } else {
      console.error(`[WhatsApp] ✗ Failed for appointment ${appointment.id} phone ${normalisedPhone}:`, err.message);
    }
    return false;
  }
}

// ─── WhatsApp 5-Minute Reminder checker ────────────────────────────────────────
async function sendFiveMinuteWhatsAppReminders(client) {
  if (!whatsappEnabled) return;

  console.log('\n--- Checking for upcoming 5-minute WhatsApp reminders ---');

  try {
    // Select appointments starting in the next 6 minutes that haven't received WhatsApp reminders yet
    const queryText = `
      SELECT 
        id, 
        customer_name, 
        customer_phone, 
        customer_alternative_phone, 
        slot_time
      FROM appointments
      WHERE status = 'booked'
        AND whatsapp_reminder_sent = FALSE
        AND slot_time > NOW()
        AND slot_time <= NOW() + INTERVAL '6 minutes'
      ORDER BY slot_time ASC
    `;
    const result = await client.query(queryText);

    console.log(`Found ${result.rows.length} pending 5-minute WhatsApp reminders.`);

    for (const appointment of result.rows) {
      const businessTimezone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
      const slotDate = new Date(appointment.slot_time);
      const slotEndDate = new Date(slotDate.getTime() + 15 * 60 * 1000);
      const dateFormatted = slotDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: businessTimezone
      });
      const startTimeFormatted = slotDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: businessTimezone });
      const endTimeFormatted = slotEndDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: businessTimezone, timeZoneName: 'short' });
      const timeFormatted = `${startTimeFormatted} - ${endTimeFormatted}`;

      console.log(`\nSending 5-min WhatsApp reminder for appointment ${appointment.id} — ${appointment.customer_name}`);

      let sentSuccessfully = false;

      // Send to primary phone
      const primarySent = await sendWhatsApp(appointment, appointment.customer_phone, dateFormatted, timeFormatted);
      if (primarySent) {
        sentSuccessfully = true;
      }

      // Send to alternative phone if provided
      if (appointment.customer_alternative_phone && appointment.customer_alternative_phone.trim() !== '') {
        console.log(`Sending WhatsApp reminder to alternative number: ${appointment.customer_alternative_phone}`);
        const altSent = await sendWhatsApp(appointment, appointment.customer_alternative_phone, dateFormatted, timeFormatted);
        if (altSent) {
          sentSuccessfully = true;
        }
      }

      if (sentSuccessfully) {
        await client.query(
          'UPDATE appointments SET whatsapp_reminder_sent = TRUE WHERE id = $1',
          [appointment.id]
        );
        console.log(`[DB] ✓ whatsapp_reminder_sent = TRUE for appointment ${appointment.id}`);
      } else {
        console.warn(`[DB] Skipping whatsapp_reminder_sent update for ${appointment.id} — send failed.`);
      }
    }
  } catch (err) {
    console.error('Error in sendFiveMinuteWhatsAppReminders:', err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log('--- Appointment Reminder Service Started ---');
  console.log(`Time Window: Next ${reminderHours} hours`);
  console.log(`Channels enabled — Email: always | SMS: ${smsEnabled} | WhatsApp: ${whatsappEnabled}`);

  if (!connectionString) {
    console.error('CRITICAL ERROR: DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  if (!resendApiKey) {
    console.error('CRITICAL ERROR: RESEND_API_KEY environment variable is missing.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const resend = new Resend(resendApiKey);

  try {
    await client.connect();
    console.log('Successfully connected to the database.');

    // 1. Run 5-minute WhatsApp reminders
    await sendFiveMinuteWhatsAppReminders(client);

    // 2. Run long-term reminders (Email/SMS)
    const queryText = `
      SELECT 
        id, 
        customer_name, 
        customer_email, 
        customer_phone, 
        slot_time
      FROM appointments
      WHERE status = 'booked'
        AND reminder_sent = FALSE
        AND slot_time > NOW()
        AND slot_time <= NOW() + $1 * INTERVAL '1 hour'
      ORDER BY slot_time ASC
    `;
    const result = await client.query(queryText, [reminderHours]);

    console.log(`\nFound ${result.rows.length} pending long-term email/SMS reminders.`);

    for (const appointment of result.rows) {
      const businessTimezone = process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
      const slotDate     = new Date(appointment.slot_time);
      const slotEndDate  = new Date(slotDate.getTime() + 15 * 60 * 1000);
      const dateFormatted = slotDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: businessTimezone
      });
      
      const startTimeFormatted = slotDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: businessTimezone });
      const endTimeFormatted = slotEndDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: businessTimezone, timeZoneName: 'short' });
      const timeFormatted = `${startTimeFormatted} - ${endTimeFormatted}`;

      console.log(
        `\nProcessing appointment ${appointment.id} — ${appointment.customer_name} (${appointment.customer_email || 'No email'}) on ${dateFormatted} at ${timeFormatted}`
      );

      // ── 1. EMAIL (primary) ────────────────────────────────────────────────
      let anyChannelSucceeded = false;
      if (appointment.customer_email && appointment.customer_email.trim() !== '') {
        try {
          const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #4f46e5; margin-top: 0;">Appointment Reminder</h2>
              <p>Hi <strong>${appointment.customer_name}</strong>,</p>
              <p>This is a reminder for your upcoming appointment with <strong>${businessName}</strong>.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b;"><strong>Business:</strong></td>
                  <td style="padding: 8px 0;">${businessName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;"><strong>Date:</strong></td>
                  <td style="padding: 8px 0;">${dateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b;"><strong>Time:</strong></td>
                  <td style="padding: 8px 0;">${timeFormatted}</td>
                </tr>
              </table>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="font-size: 0.875rem; color: #64748b; margin-bottom: 0;">
                If you need to reschedule or cancel, please contact us. We look forward to seeing you soon!
              </p>
            </div>
          `;

          const smtpUser = process.env.SMTP_USER;
          const smtpPass = process.env.SMTP_PASS;

          if (smtpUser && smtpPass) {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: smtpUser, pass: smtpPass },
            });
            await transporter.sendMail({
              from: `"${businessName}" <${smtpUser}>`,
              to: appointment.customer_email,
              subject: `Reminder: Upcoming Appointment - ${businessName}`,
              html: emailHtml,
            });
            console.log(`[Email] ✓ Sent via Gmail SMTP.`);
            anyChannelSucceeded = true;
          } else if (resendApiKey && resendApiKey !== 're_dummy_key') {
            await resend.emails.send({
              from: `${businessName} <${fromEmail}>`,
              to: appointment.customer_email,
              subject: `Reminder: Upcoming Appointment - ${businessName}`,
              html: emailHtml,
            });
            console.log(`[Email] ✓ Sent via Resend.`);
            anyChannelSucceeded = true;
          }
        } catch (err) {
          console.error(`[Email] ✗ Failed for appointment ${appointment.id}:`, err.message);
        }
      } else {
        console.log(`[Email] Skipped: Customer has no email address configured.`);
      }

      // ── 2. SMS (optional — never blocks email) ─────────────────
      try {
        const smsResult = await sendSms(appointment, dateFormatted, timeFormatted);
        if (smsResult) anyChannelSucceeded = true;
      } catch (_) {}

      // ── Mark reminder sent if ANY channel succeeded ───────────────────────
      if (anyChannelSucceeded) {
        try {
          await client.query(
            'UPDATE appointments SET reminder_sent = TRUE WHERE id = $1',
            [appointment.id]
          );
          console.log(`[DB] ✓ reminder_sent = TRUE for appointment ${appointment.id}`);
        } catch (err) {
          console.error(`[DB] ✗ Failed to update reminder_sent for appointment ${appointment.id}:`, err.message);
        }
      } else {
        console.warn(`[DB] Skipping reminder_sent update for ${appointment.id} — no channels confirmed success.`);
      }
    }

    console.log('\nReminder service run finished successfully.');
  } catch (err) {
    console.error('CRITICAL RUNTIME ERROR:', err);
  } finally {
    await client.end();
    console.log('Database connection closed.');
    console.log('--- Appointment Reminder Service Ended ---');
  }
}

const isLoop = process.argv.includes('--watch') || process.argv.includes('--loop');

if (isLoop) {
  console.log('Starting Reminder Service in watch mode (polling database every 60 seconds)...');
  run().catch(err => console.error('Error in cron run:', err.message));
  setInterval(() => {
    run().catch(err => console.error('Error in cron run:', err.message));
  }, 60000);
} else {
  run().catch(err => console.error('Error in cron run:', err.message));
}
