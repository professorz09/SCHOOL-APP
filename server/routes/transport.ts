import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const transportRouter = Router();

// GET /api/transport/student/:studentId
transportRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'DRIVER', 'PARENT'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .select('*, transport_vehicles(id, vehicle_no, route_name), route_stops(id, name, estimated_time)')
      .eq('student_id', req.params.studentId)
      .order('start_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// GET /api/transport/vehicles
transportRouter.get('/vehicles', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('transport_vehicles')
      .select('*, route_stops(*)')
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true)
      .order('vehicle_no');
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/assign
transportRouter.post('/assign', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; vehicleId: string; stopId: string;
      monthlyAmount: number; startDate: string; academicYearId: string;
      endDate?: string;
    }>(req, ['studentId', 'vehicleId', 'stopId', 'monthlyAmount', 'startDate', 'academicYearId']);

    // Deactivate existing open assignment
    await adminDb
      .from('student_transport_assignments')
      .update({ is_active: false, end_date: body.startDate })
      .eq('student_id', body.studentId)
      .eq('academic_year_id', body.academicYearId)
      .eq('is_active', true);

    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .insert({
        student_id:       body.studentId,
        academic_year_id: body.academicYearId,
        vehicle_id:       body.vehicleId,
        stop_id:          body.stopId,
        monthly_amount:   Math.round(body.monthlyAmount),
        start_date:       body.startDate,
        end_date:         body.endDate ?? null,
        is_active:        true,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/remove
transportRouter.post('/remove', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; academicYearId: string; endDate: string; reason?: string;
    }>(req, ['studentId', 'academicYearId', 'endDate']);

    const { data, error } = await adminDb
      .from('student_transport_assignments')
      .update({ is_active: false, end_date: body.endDate, end_reason: body.reason ?? null })
      .eq('student_id', body.studentId)
      .eq('academic_year_id', body.academicYearId)
      .eq('is_active', true)
      .select();
    if (error) throw new ApiError(500, error.message);
    if (!data?.length) throw new ApiError(404, 'No active transport assignment found');

    ok(res, { removed: data.length, endDate: body.endDate });
  } catch (err) { fail(res, err); }
});
