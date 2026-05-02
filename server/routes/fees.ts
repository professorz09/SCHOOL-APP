import { Router } from 'express';
import { adminDb } from '../lib/db';
import { ok, fail, ApiError, requireBody } from '../lib/helpers';
import { requireAuth, requireRole } from '../middleware/auth';

export const feesRouter = Router();

const PRINCIPAL = requireRole('PRINCIPAL');

// GET /api/fees/student/:studentId
feesRouter.get('/student/:studentId', requireAuth, requireRole('PRINCIPAL', 'TEACHER', 'STUDENT'), async (req, res) => {
  try {
    const { data: installments, error } = await adminDb
      .from('fee_installments')
      .select('*')
      .eq('student_id', req.params.studentId)
      .order('due_date');
    if (error) throw new ApiError(500, error.message);

    const { data: payments } = await adminDb
      .from('payments')
      .select('*, payment_links(installment_id, amount_applied)')
      .eq('student_id', req.params.studentId)
      .order('date', { ascending: false });

    ok(res, { installments, payments });
  } catch (err) { fail(res, err); }
});

// GET /api/fees/structures
feesRouter.get('/structures', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('fee_structures')
      .select('*, fee_components(*)')
      .eq('school_id', req.user.school_id!);
    if (error) throw new ApiError(500, error.message);
    ok(res, data);
  } catch (err) { fail(res, err); }
});

// POST /api/fees/structure/create
feesRouter.post('/structure/create', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      name: string; description?: string;
      installmentType: string;
      components: { name: string; amount: number }[];
    }>(req, ['name', 'installmentType', 'components']);

    if (!Array.isArray(body.components) || body.components.length === 0) {
      throw new ApiError(400, 'At least one fee component required');
    }

    const { data: structure, error: se } = await adminDb
      .from('fee_structures')
      .insert({
        school_id:        req.user.school_id,
        name:             body.name,
        description:      body.description ?? null,
        installment_type: body.installmentType,
      })
      .select()
      .single();
    if (se) throw new ApiError(500, se.message);

    const components = body.components.map(c => ({
      fee_structure_id: structure.id,
      name:   c.name,
      amount: c.amount,
    }));
    const { error: ce } = await adminDb.from('fee_components').insert(components);
    if (ce) throw new ApiError(500, ce.message);

    ok(res, { ...structure, components: body.components }, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/fees/assign
feesRouter.post('/assign', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; feeStructureId: string;
      startDate: string; endDate?: string;
    }>(req, ['studentId', 'feeStructureId', 'startDate']);

    // Close any existing open assignment
    await adminDb
      .from('student_fee_assignments')
      .update({ end_date: body.startDate })
      .eq('student_id', body.studentId)
      .is('end_date', null);

    const { data, error } = await adminDb
      .from('student_fee_assignments')
      .insert({
        student_id:       body.studentId,
        fee_structure_id: body.feeStructureId,
        start_date:       body.startDate,
        end_date:         body.endDate ?? null,
      })
      .select()
      .single();
    if (error) throw new ApiError(500, error.message);

    await adminDb.rpc('log_audit', {
      p_action: 'ASSIGN_FEE_STRUCTURE',
      p_entity_type: 'student_fee_assignment',
      p_entity_id: data.id,
      p_details: { studentId: body.studentId, feeStructureId: body.feeStructureId },
    });
    ok(res, data, 201);
  } catch (err) { fail(res, err); }
});

// POST /api/fees/pay  — ledger-safe, oldest-due-first
feesRouter.post('/pay', requireAuth, PRINCIPAL, async (req, res) => {
  try {
    const body = requireBody<{
      studentId: string; amount: number; method: string;
      note?: string; referenceNo?: string;
    }>(req, ['studentId', 'amount', 'method']);

    if (body.amount <= 0) throw new ApiError(400, 'Amount must be positive');

    // 1. Get all unpaid/partially-paid installments oldest-due-first
    const { data: installments, error: ie } = await adminDb
      .from('fee_installments')
      .select('id, due_date, amount, paid_amount, status')
      .eq('student_id', body.studentId)
      .in('status', ['PENDING', 'PARTIAL'])
      .order('due_date');
    if (ie) throw new ApiError(500, ie.message);

    // 2. Create immutable payment record
    const { data: payment, error: pe } = await adminDb
      .from('payments')
      .insert({
        student_id:   body.studentId,
        amount:       body.amount,
        date:         new Date().toISOString().split('T')[0],
        method:       body.method,
        note:         body.note ?? null,
        reference_no: body.referenceNo ?? null,
        created_by:   req.user.id,
      })
      .select()
      .single();
    if (pe) throw new ApiError(500, pe.message);

    // 3. Allocate oldest-due-first — create payment_links + update installments
    let remaining = body.amount;
    const links: { payment_id: string; installment_id: string; amount_applied: number }[] = [];
    const updates: { id: string; paid_amount: number; status: string }[] = [];

    for (const inst of installments ?? []) {
      if (remaining <= 0) break;
      const outstanding = inst.amount - (inst.paid_amount ?? 0);
      const apply = Math.min(remaining, outstanding);
      const newPaid = (inst.paid_amount ?? 0) + apply;
      const newStatus = newPaid >= inst.amount ? 'PAID' : 'PARTIAL';

      links.push({ payment_id: payment.id, installment_id: inst.id, amount_applied: apply });
      updates.push({ id: inst.id, paid_amount: newPaid, status: newStatus });
      remaining -= apply;
    }

    if (links.length > 0) {
      await adminDb.from('payment_links').insert(links);
      for (const u of updates) {
        await adminDb
          .from('fee_installments')
          .update({ paid_amount: u.paid_amount, status: u.status })
          .eq('id', u.id);
      }
    }

    await adminDb.rpc('log_audit', {
      p_action: 'RECORD_FEE_PAYMENT',
      p_entity_type: 'payment',
      p_entity_id: payment.id,
      p_details: { studentId: body.studentId, amount: body.amount, method: body.method, installmentsAllocated: links.length },
    });

    ok(res, { payment, links, amountAllocated: body.amount - remaining, surplus: remaining });
  } catch (err) { fail(res, err); }
});
