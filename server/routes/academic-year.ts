import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
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

// GET /api/academic-year/active
academicYearRouter.get('/active', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'STUDENT', 'PARENT', 'DRIVER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('academic_years')
      .select('*')
      .eq('school_id', req.user.school_id!)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    ok(res, data ?? null);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/create
academicYearRouter.post('/create', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      label: string; startDate: string; endDate: string;
      board?: string; medium?: string;
    }>(req, ['label', 'startDate', 'endDate']);

    const { data, error } = await adminDb
      .from('academic_years')
      .insert({
        school_id:  req.user.school_id,
        label:      body.label,
        start_date: body.startDate,
        end_date:   body.endDate,
        board:      body.board ?? null,
        medium:     body.medium ?? null,
        is_active:  false,
        is_closed:  false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, `Academic year "${body.label}" already exists`);
      throw new ApiError(500, error.message);
    }

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/set-active
academicYearRouter.post('/set-active', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = requireBody<{ yearId: string }>(req, ['yearId']);

    // Verify year belongs to school
    const { data: year } = await adminDb
      .from('academic_years')
      .select('id, is_closed')
      .eq('id', yearId)
      .eq('school_id', req.user.school_id!)
      .single();
    if (!year) throw new ApiError(404, 'Academic year not found');
    if ((year as any).is_closed) throw new ApiError(400, 'Cannot activate a closed year');

    // RPC needs auth.uid() — use user JWT
    const db = userDb(req.jwt);
    const { error } = await db.rpc('set_active_academic_year', { p_year_id: yearId });
    if (error) throw new ApiError(500, error.message);

    ok(res, { yearId, active: true });
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/close
academicYearRouter.post('/close', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { yearId } = requireBody<{ yearId: string }>(req, ['yearId']);

    const { data: year } = await adminDb
      .from('academic_years')
      .select('id, is_closed')
      .eq('id', yearId)
      .eq('school_id', req.user.school_id!)
      .single();
    if (!year) throw new ApiError(404, 'Academic year not found');
    if ((year as any).is_closed) throw new ApiError(400, 'Academic year is already closed');

    // RPC needs auth.uid() — use user JWT
    const db = userDb(req.jwt);
    const { error } = await db.rpc('close_academic_year', { p_year_id: yearId });
    if (error) throw new ApiError(500, error.message);

    ok(res, { yearId, closed: true });
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/sections — create sections for a year
academicYearRouter.post('/sections', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      yearId: string;
      sections: { className: string; section: string; classTeacher?: string }[];
    }>(req, ['yearId', 'sections']);

    if (!Array.isArray(body.sections) || body.sections.length === 0) {
      throw new ApiError(400, 'sections array required');
    }

    const rows = body.sections.map(s => ({
      school_id:        req.user.school_id,
      academic_year_id: body.yearId,
      class_name:       s.className,
      section:          s.section,
      class_teacher:    s.classTeacher ?? null,
    }));

    const { data, error } = await adminDb
      .from('sections')
      .insert(rows)
      .select();
    if (error) {
      if (error.code === '23505') throw new ApiError(409, 'One or more sections already exist for this year');
      throw new ApiError(500, error.message);
    }

    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/create-with-sections — full wizard RPC (auth.uid() required)
academicYearRouter.post('/create-with-sections', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      label: string; startDate: string; endDate: string;
      board: string; medium: string; streams: string[];
      sections: { className: string; section: string; stream?: string | null; capacity: number }[];
    }>(req, ['label', 'startDate', 'endDate', 'board', 'medium', 'streams', 'sections']);

    const db = userDb(req.jwt);
    const { data, error } = await db.rpc('create_academic_year_with_sections', {
      p_label:    body.label.trim(),
      p_start:    body.startDate,
      p_end:      body.endDate,
      p_board:    body.board,
      p_medium:   body.medium,
      p_streams:  body.streams,
      p_sections: body.sections.map(s => ({
        class_name: s.className,
        section:    s.section,
        stream:     s.stream ?? null,
        capacity:   s.capacity,
      })),
    });
    if (error) throw new ApiError(500, error.message);
    ok(res, { yearId: data as string }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/academic-year/commit-closing — commit_year_closing RPC (auth.uid() required)
academicYearRouter.post('/commit-closing', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      oldYearId: string; newLabel: string; newStart: string; newEnd: string;
      newBoard: string; newMedium: string;
      decisions: { student_id: string; action: string; new_class_name?: string; new_section?: string }[];
      duesHandling: 'WRITEOFF' | 'ARREARS' | 'NONE';
    }>(req, ['oldYearId', 'newLabel', 'newStart', 'newEnd', 'newBoard', 'newMedium', 'decisions', 'duesHandling']);

    // Verify the year belongs to this school
    const { data: yr } = await adminDb
      .from('academic_years').select('id')
      .eq('id', body.oldYearId).eq('school_id', req.user.school_id!).maybeSingle();
    if (!yr) throw new ApiError(404, 'Academic year not found');

    const db = userDb(req.jwt);
    const { data, error } = await db.rpc('commit_year_closing', {
      p_old_year_id:  body.oldYearId,
      p_new_label:    body.newLabel,
      p_new_start:    body.newStart,
      p_new_end:      body.newEnd,
      p_new_board:    body.newBoard,
      p_new_medium:   body.newMedium,
      p_decisions:    body.decisions,
      p_dues_handling: body.duesHandling,
    });
    if (error) throw new ApiError(500, `Year closing failed: ${error.message}`);

    const result = (data ?? {}) as {
      new_year_id?: string; promoted?: number;
      written_off_rows?: number; written_off_amt?: number;
    };
    ok(res, {
      newYearId:       result.new_year_id,
      promoted:        result.promoted ?? 0,
      writtenOffRows:  result.written_off_rows ?? 0,
      writtenOffAmt:   result.written_off_amt ?? 0,
    });
  } catch (err) { fail(res, err); }
});

// GET /api/academic-year/:yearId/sections
academicYearRouter.get('/:yearId/sections', requireAuth, requireRole('PRINCIPAL', 'TEACHER'), async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('sections')
      .select('*')
      .eq('academic_year_id', req.params.yearId)
      .eq('school_id', req.user.school_id!)
      .order('class_name')
      .order('section');
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});
