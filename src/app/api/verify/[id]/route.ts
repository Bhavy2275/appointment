import { NextRequest, NextResponse } from 'next/server';
import { getAppointmentById } from '@/lib/actions';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const appointment = await getAppointmentById(id);
  if (!appointment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(appointment);
}
