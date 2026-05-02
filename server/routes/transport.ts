import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const transportRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// POST /api/transport/assign
transportRouter.post('/assign', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; vehicleId: string;
      feeStructureId?: string; startDate: string;
    }>(req, ['studentId', 'vehicleId', 'startDate']);

    // Close existing open assignment
    await adminDb
      .from('transport_assignments')
      .update({ end_date: body.startDate })
      .eq('student_id', body.studentId)
      .is('end_date', null);

    const { data, error } = await adminDb
      .from('transport_assignments')
      .insert({
        student_id:       body.studentId,
        vehicle_id:       body.vehicleId,
        fee_structure_id: body.feeStructureId ?? null,
        start_date:       body.startDate,
        end_date:         null,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'ASSIGN_TRANSPORT',
      p_entity_type: 'transport_assignment',
      p_entity_id: data.id,
      p_details: { studentId: body.studentId, vehicleId: body.vehicleId },
    });
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/transport/remove
transportRouter.post('/remove', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{ studentId: string; endDate: string }>(req, ['studentId', 'endDate']);

    const { data, error } = await adminDb
      .from('transport_assignments')
      .update({ end_date: body.endDate })
      .eq('student_id', body.studentId)
      .is('end_date', null)
      .select();
    if (error) throw new ApiError(500, error.message);
    if (!data?.length) throw new ApiError(404, 'No active transport assignment found');

    await adminDb.rpc('log_audit', {
      p_action: 'REMOVE_TRANSPORT',
      p_entity_type: 'transport_assignment',
      p_entity_id: data[0].id,
      p_details: { studentId: body.studentId, endDate: body.endDate },
    });
    ok(res, { removed: data.length });
  } catch (err) { fail(res, err); }
});

// GET /api/transport/student/:studentId
transportRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'DRIVER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('transport_assignments')
      .select('*, transport_vehicles(*)')
      .eq('student_id', req.params.studentId)
      .order('start_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});
