import { Router } from 'express';
import { adminDb, userDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const staffRouter = Router();

// POST /api/staff/deactivate
staffRouter.post('/deactivate', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { staffId } = requireBody<{ staffId: string }>(req, ['staffId']);
    const { error } = await adminDb.from('staff').update({
      is_active: false,
      status: 'SUSPENDED',
      updated_at: new Date().toISOString(),
    }).eq('id', staffId).eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, { staffId });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/pay — record_salary_payment RPC (auth.uid() required)
staffRouter.post('/salary/pay', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; month: string; amount: number;
      note?: string; method?: string; transactionId?: string;
    }>(req, ['staffId', 'month', 'amount']);

    if (!Number.isFinite(body.amount) || body.amount <= 0)
      throw new ApiError(400, 'Amount must be positive');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('record_salary_payment', {
      p_staff_id: body.staffId,
      p_month:    body.month,
      p_amount:   Math.round(body.amount),
      p_note:     body.note ?? null,
      p_method:   body.method ?? null,
      p_txn_id:   body.transactionId ?? null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, month: body.month, amount: body.amount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/salary/update — update_staff_salary RPC (auth.uid() required)
staffRouter.post('/salary/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; newAmount: number; effectiveFrom: string; reason: string;
    }>(req, ['staffId', 'newAmount', 'effectiveFrom', 'reason']);

    if (!Number.isFinite(body.newAmount) || body.newAmount < 0)
      throw new ApiError(400, 'Salary must be non-negative');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('update_staff_salary', {
      p_staff_id:       body.staffId,
      p_new_amount:     Math.round(body.newAmount),
      p_effective_from: body.effectiveFrom,
      p_reason:         body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, newAmount: body.newAmount });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/relieve — set_staff_relieving_date RPC (auth.uid() required)
staffRouter.post('/relieve', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      staffId: string; date: string; reason: string;
    }>(req, ['staffId', 'date', 'reason']);
    if (!body.date) throw new ApiError(400, 'Relieving date required');

    const db = userDb(req.jwt);
    const { error } = await db.rpc('set_staff_relieving_date', {
      p_staff_id: body.staffId,
      p_date:     body.date,
      p_reason:   body.reason || null,
    });
    if (error) throw new ApiError(500, error.message);

    ok(res, { staffId: body.staffId, date: body.date });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/document/delete — delete staff_documents row
staffRouter.post('/document/delete', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const { documentId } = requireBody<{ documentId: string }>(req, ['documentId']);

    // Verify document belongs to this school via staff join
    const { data: row } = await adminDb
      .from('staff_documents')
      .select('id, doc_url, staff_id, staff!inner(school_id)')
      .eq('id', documentId)
      .maybeSingle();
    if (!row) throw new ApiError(404, 'Document not found');
    if ((row as any).staff?.school_id !== req.user.school_id) throw new ApiError(403, 'Access denied');

    const { error } = await adminDb.from('staff_documents').delete().eq('id', documentId);
    if (error) throw new ApiError(500, error.message);

    ok(res, { documentId, docUrl: (row as any).doc_url });
  } catch (err) { fail(res, err); }
});

// POST /api/staff/create — insert staff row + seed salary + class assignments
staffRouter.post('/create', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      userId: string | null;
      name: string; role: string; salary: number;
      subject?: string; phone?: string; email?: string; aadhaarNo?: string;
      joiningDate?: string; status?: string; address?: string; photo?: string;
      assignedClasses?: string[];
    }>(req, ['name', 'role', 'salary']);

    const schoolId = req.user.school_id!;

    // Insert staff row
    const { data, error } = await adminDb.from('staff').insert({
      school_id:    schoolId,
      user_id:      body.userId ?? null,
      name:         body.name,
      role:         body.role,
      subject:      body.subject ?? null,
      phone:        body.phone ?? null,
      email:        body.email ?? null,
      aadhaar_no:   body.aadhaarNo ?? null,
      salary:       body.salary,
      joining_date: body.joiningDate ?? null,
      status:       body.status ?? 'ACTIVE',
      address:      body.address ?? null,
      photo:        body.photo ?? null,
      is_active:    true,
    }).select().single();
    if (error) throw new ApiError(500, error.message);
    const row = data as any;

    // Seed initial salary history
    if (body.salary > 0) {
      const db = userDb(req.jwt);
      const { error: seedErr } = await db.rpc('update_staff_salary', {
        p_staff_id:       row.id,
        p_new_amount:     body.salary,
        p_effective_from: body.joiningDate ?? new Date().toISOString().slice(0, 10),
        p_reason:         'Initial',
      });
      if (seedErr) {
        await adminDb.from('staff').delete().eq('id', row.id);
        throw new ApiError(500, `Failed to seed initial salary: ${seedErr.message}`);
      }
    }

    // Insert class assignments
    if (body.assignedClasses?.length) {
      const { data: ay } = await adminDb
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      const ayId = (ay as any)?.id ?? null;
      const rows = (body.assignedClasses).map((cls: string) => ({
        school_id: schoolId, staff_id: row.id, academic_year_id: ayId, class_name: cls,
      }));
      const { error: assignErr } = await adminDb.from('staff_class_assignments').insert(rows);
      if (assignErr) throw new ApiError(500, assignErr.message);
    }

    ok(res, row, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/staff/update — profile patch + class assignment replace
staffRouter.post('/update', requireAuth, requireRole('PRINCIPAL'), async (req, res) => {
  try {
    const body = requireBody<{
      id: string; patch: Record<string, unknown>; assignedClasses?: string[];
    }>(req, ['id', 'patch']);

    const schoolId = req.user.school_id!;

    const safe: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = ['name','role','subject','phone','email','aadhaar_no','salary',
                     'joining_date','status','address','photo'];
    for (const k of allowed) if (body.patch[k] !== undefined) safe[k] = body.patch[k];

    const { error } = await adminDb.from('staff').update(safe)
      .eq('id', body.id).eq('school_id', schoolId);
    if (error) throw new ApiError(500, error.message);

    if (body.assignedClasses !== undefined) {
      const { data: ay, error: ayErr } = await adminDb
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).limit(1);
      if (ayErr) throw new ApiError(500, `Active-year lookup failed: ${ayErr.message}`);
      const ayId = ((ay ?? [])[0] as any)?.id;
      if (!ayId) throw new ApiError(400, 'No active academic year — activate one before changing class assignments.');

      const { error: delErr } = await adminDb.from('staff_class_assignments')
        .delete().eq('school_id', schoolId).eq('staff_id', body.id).eq('academic_year_id', ayId);
      if (delErr) throw new ApiError(500, `Clearing old assignments: ${delErr.message}`);

      if (body.assignedClasses.length) {
        const rows = body.assignedClasses.map((cls: string) => ({
          school_id: schoolId, staff_id: body.id, academic_year_id: ayId, class_name: cls,
        }));
        const { error: insErr } = await adminDb.from('staff_class_assignments').insert(rows);
        if (insErr) throw new ApiError(500, `Class assignments: ${insErr.message}`);
      }
    }

    ok(res, { id: body.id });
  } catch (err) { fail(res, err); }
});
