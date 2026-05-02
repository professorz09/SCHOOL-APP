import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const academicYearRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/academic-year
academicYearRouter.get('/', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('academic_years')
      .select('*')
      .eq('school_id', req.user.school_id!)
      .order('start_date', { ascending: false });
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/create
academicYearRouter.post('/create', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      label: string; startDate: string; endDate: string;
    }>(req, ['label', 'startDate', 'endDate']);

    const { data, error } = await adminDb
      .from('academic_years')
      .insert({
        school_id:  req.user.school_id,
        label:      body.label,
        start_date: body.startDate,
        end_date:   body.endDate,
        is_active:  false,
        is_closed:  false,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'CREATE_ACADEMIC_YEAR',
      p_entity_type: 'academic_year',
      p_entity_id: data.id,
      p_details: { label: body.label },
    });
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/set-active
academicYearRouter.post('/set-active', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = requireBody<{ yearId: string }>(req, ['yearId']);

    const { data: year } = await adminDb
      .from('academic_years')
      .select('id, school_id')
      .eq('id', yearId)
      .eq('school_id', req.user.school_id!)
      .single();
    if (!year) throw new ApiError(404, 'Academic year not found');

    const { error } = await adminDb.rpc('set_active_academic_year', { p_year_id: yearId });
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'SET_ACTIVE_YEAR',
      p_entity_type: 'academic_year',
      p_entity_id: yearId,
      p_details: {},
    });
    ok(res, { yearId, active: true });
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/close
academicYearRouter.post('/close', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = requireBody<{ yearId: string }>(req, ['yearId']);

    const { data: year } = await adminDb
      .from('academic_years')
      .select('id, school_id, is_closed')
      .eq('id', yearId)
      .eq('school_id', req.user.school_id!)
      .single();
    if (!year) throw new ApiError(404, 'Academic year not found');
    if (year.is_closed) throw new ApiError(400, 'Academic year already closed');

    const { error } = await adminDb.rpc('close_academic_year', { p_year_id: yearId });
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'CLOSE_ACADEMIC_YEAR',
      p_entity_type: 'academic_year',
      p_entity_id: yearId,
      p_details: {},
    });
    ok(res, { yearId, closed: true });
  } catch (err) { fail(res, err); }
});
