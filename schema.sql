-- Database schema for Appointment Booking Web Application

-- 1. Create time_slots table
CREATE TABLE IF NOT EXISTS time_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slot_time TIMESTAMP WITH TIME ZONE UNIQUE NOT NULL
);

-- 2. Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    service_reason TEXT,
    slot_time TIMESTAMP WITH TIME ZONE NOT NULL REFERENCES time_slots(slot_time) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'no-show', 'cancelled')),
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Unique index to prevent double-booking on active appointments
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_appointment_slot 
ON appointments(slot_time) 
WHERE status IN ('booked', 'completed', 'no-show');

-- 4. Dynamic Seed Data for testing (adds slots starting tomorrow)
-- This adds slots for tomorrow between 10 PM and 10 AM the next day (15-min intervals)
INSERT INTO time_slots (slot_time)
VALUES 
  -- Tomorrow 10:00 PM to 11:45 PM slots
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '22 hours'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '22 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '22 hours 30 minutes'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '22 hours 45 minutes'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '23 hours'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '23 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '23 hours 30 minutes'),
  (date_trunc('day', NOW() + INTERVAL '1 day') + INTERVAL '23 hours 45 minutes'),
  -- Day after tomorrow 12:00 AM to 10:00 AM slots
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '0 hours'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '0 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '0 hours 30 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '0 hours 45 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '1 hours'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '1 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '8 hours'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '8 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '8 hours 30 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '8 hours 45 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '9 hours'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '9 hours 15 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '9 hours 30 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '9 hours 45 minutes'),
  (date_trunc('day', NOW() + INTERVAL '2 days') + INTERVAL '10 hours')
ON CONFLICT (slot_time) DO NOTHING;
