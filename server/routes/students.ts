import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

async function generateAdmissionNo(schoolId: number): Promise<string> {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*) as cnt FROM students WHERE school_id = $1`,
    [schoolId]
  );
  const count = parseInt(result.rows[0].cnt) + 1;
  return `ADM-${year}-${String(count).padStart(3, '0')}`;
}

// GET /api/schools/:schoolId/students
router.get('/', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { academicYearId, className, section, isActive } = req.query;
  const role = req.user?.role;

  // STUDENT can only see their own record; PARENT sees linked children only
  if (role === 'STUDENT') {
    const self = await pool.query(
      `SELECT s.*, sar.class_name, sar.section, sar.roll_no, sar.fee_status,
         sar.total_fee, sar.paid_fee, sar.attendance_percent, sar.academic_year_id
       FROM students s
       LEFT JOIN users u ON u.id = $1
       LEFT JOIN student_academic_records sar ON sar.student_id = s.id
         ${academicYearId ? `AND sar.academic_year_id = $3` : ''}
       WHERE s.school_id = $2 AND s.user_id = $1`,
      academicYearId ? [req.user!.userId, schoolId, academicYearId] : [req.user!.userId, schoolId]
    );
    return res.json(self.rows);
  }

  if (role === 'PARENT') {
    const linked = await pool.query(
      `SELECT s.*, sar.class_name, sar.section, sar.roll_no, sar.fee_status,
         sar.total_fee, sar.paid_fee, sar.attendance_percent, sar.academic_year_id
       FROM students s
       JOIN parent_student_links psl ON psl.student_id = s.id AND psl.parent_user_id = $1
       LEFT JOIN student_academic_records sar ON sar.student_id = s.id
         ${academicYearId ? `AND sar.academic_year_id = $3` : ''}
       WHERE s.school_id = $2`,
      academicYearId ? [req.user!.userId, schoolId, academicYearId] : [req.user!.userId, schoolId]
    );
    return res.json(linked.rows);
  }

  // DRIVER has no access to student list
  if (role === 'DRIVER') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let query = `
      SELECT s.*, sar.class_name, sar.section, sar.roll_no, sar.fee_status,
        sar.total_fee, sar.paid_fee, sar.attendance_percent, sar.academic_year_id
      FROM students s
      LEFT JOIN student_academic_records sar ON sar.student_id = s.id
        ${academicYearId ? `AND sar.academic_year_id = $2` : ''}
      WHERE s.school_id = $1
    `;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (academicYearId) params.push(academicYearId as string);
    if (isActive !== undefined) {
      query += ` AND s.is_active = $${params.length + 1}`;
      params.push(isActive === 'true');
    }
    if (className) {
      query += ` AND sar.class_name = $${params.length + 1}`;
      params.push(className as string);
    }
    if (section) {
      query += ` AND sar.section = $${params.length + 1}`;
      params.push(section as string);
    }
    query += ` ORDER BY s.name`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/students/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const role = req.user?.role;

  // DRIVER has no access to individual student records
  if (role === 'DRIVER') return res.status(403).json({ error: 'Forbidden' });

  // STUDENT can only access their own record
  if (role === 'STUDENT') {
    const self = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND school_id = $2`, [req.user!.userId, schoolId]);
    if (!self.rows[0] || self.rows[0].id !== id) return res.status(403).json({ error: 'Forbidden' });
  }

  // PARENT can only access their linked children
  if (role === 'PARENT') {
    const links = await pool.query(
      `SELECT student_id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
      [req.user!.userId, id]
    );
    if (links.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM students WHERE id = $1 AND school_id = $2`,
      [id, schoolId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Student not found' });
    const records = await pool.query(
      `SELECT * FROM student_academic_records WHERE student_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    return res.json({ ...result.rows[0], academicRecords: records.rows });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/students
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    name, dob, gender, bloodGroup, aadhaarNo, phone, email, address, photo,
    fatherName, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
    motherName, motherPhone, motherOccupation,
    guardianName, guardianPhone, guardianRelation,
    religion, caste, penNumber, birthCertNo, tcNumber, isRte, admissionDate,
    academicYearId, className, section, sectionId, rollNo, totalFee,
    parentMobile, parentName
  } = req.body;

  if (!name || !academicYearId) {
    return res.status(400).json({ error: 'name and academicYearId required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const admissionNo = await generateAdmissionNo(schoolId);

    const studentResult = await client.query(`
      INSERT INTO students (
        school_id, name, admission_no, dob, gender, blood_group, aadhaar_no,
        phone, email, address, photo, father_name, father_phone, father_email,
        father_occupation, father_income, mother_name, mother_phone, mother_occupation,
        guardian_name, guardian_phone, guardian_relation, religion, caste,
        pen_number, birth_cert_no, tc_number, is_rte, admission_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING *
    `, [schoolId, name, admissionNo, dob, gender, bloodGroup, aadhaarNo,
        phone, email, address, photo, fatherName, fatherPhone, fatherEmail,
        fatherOccupation, fatherIncome, motherName, motherPhone, motherOccupation,
        guardianName, guardianPhone, guardianRelation, religion, caste,
        penNumber, birthCertNo, tcNumber, isRte || false, admissionDate || new Date().toISOString().split('T')[0]]);

    const student = studentResult.rows[0];

    // Create academic record
    await client.query(`
      INSERT INTO student_academic_records (student_id, academic_year_id, section_id, class_name, section, roll_no, total_fee, fee_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')
    `, [student.id, academicYearId, sectionId, className, section, rollNo, totalFee || 0]);

    // Update section student count
    if (sectionId) {
      await client.query(`UPDATE sections SET student_count = student_count + 1 WHERE id = $1`, [sectionId]);
    }

    // Create student user account when phone is provided (enables student portal login)
    if (phone) {
      const cleanStudentPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanStudentPhone.length === 10) {
        const studentTempPassword = admissionNo; // admission number as initial password
        const studentHash = await bcrypt.hash(studentTempPassword, 10);
        const existingStudentUser = await client.query(`SELECT id FROM users WHERE mobile_number = $1`, [cleanStudentPhone]);
        let studentUserId: number;
        if (existingStudentUser.rows.length > 0) {
          studentUserId = existingStudentUser.rows[0].id;
        } else {
          const studentUserResult = await client.query(`
            INSERT INTO users (mobile_number, password_hash, role, name, email, school_id, first_login_changed)
            VALUES ($1,$2,'STUDENT',$3,$4,$5,FALSE) RETURNING id
          `, [cleanStudentPhone, studentHash, name, email, schoolId]);
          studentUserId = studentUserResult.rows[0].id;
        }
        await client.query(`UPDATE students SET user_id = $1 WHERE id = $2`, [studentUserId, student.id]);
        student.user_id = studentUserId;
      }
    }

    // Create parent account if mobile provided
    if (parentMobile) {
      const cleanPhone = parentMobile.replace(/\D/g, '').slice(-10);
      const tempPassword = student.id.toString().slice(-4).padStart(4, '0');
      const hash = await bcrypt.hash(tempPassword, 10);
      let parentUserId: number;

      const existingParent = await client.query(`SELECT id FROM users WHERE mobile_number = $1`, [cleanPhone]);
      if (existingParent.rows.length > 0) {
        parentUserId = existingParent.rows[0].id;
      } else {
        const parentResult = await client.query(`
          INSERT INTO users (mobile_number, password_hash, role, name, school_id, first_login_changed)
          VALUES ($1,$2,'PARENT',$3,$4,FALSE) RETURNING id
        `, [cleanPhone, hash, parentName || fatherName || name + "'s Parent", schoolId]);
        parentUserId = parentResult.rows[0].id;
      }

      await client.query(`
        INSERT INTO parent_student_links (parent_user_id, student_id)
        VALUES ($1,$2) ON CONFLICT DO NOTHING
      `, [parentUserId, student.id]);
    }

    // Generate tuition fee installments if totalFee provided
    if (totalFee && totalFee > 0 && academicYearId) {
      const ay = await client.query(`SELECT * FROM academic_years WHERE id = $1`, [academicYearId]);
      if (ay.rows[0]) {
        const start = new Date(ay.rows[0].start_date);
        const end = new Date(ay.rows[0].end_date);
        const months = [];
        const d = new Date(start);
        d.setDate(10);
        while (d <= end) {
          months.push({ name: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }), due: d.toISOString().split('T')[0] });
          d.setMonth(d.getMonth() + 1);
        }
        const monthlyAmount = Math.round(totalFee / months.length);
        for (const m of months) {
          await client.query(`
            INSERT INTO fee_installments (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
            VALUES ($1,$2,$3,$4,$5,'TUITION',$6,$7)
          `, [student.id, academicYearId, schoolId, m.name, m.due, monthlyAmount, isRte ? 'GOVERNMENT' : 'PARENT']);
        }
      }
    }

    await client.query('COMMIT');
    return res.status(201).json(student);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/schools/:schoolId/students/:id
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const {
    name, dob, gender, bloodGroup, aadhaarNo, phone, email, address, photo,
    fatherName, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
    motherName, motherPhone, motherOccupation,
    guardianName, guardianPhone, guardianRelation,
    religion, caste, penNumber, birthCertNo, tcNumber, isRte, isActive,
    className, section, rollNo, academicYearId
  } = req.body;

  try {
    const result = await pool.query(`
      UPDATE students SET
        name = COALESCE($3, name), dob = COALESCE($4, dob), gender = COALESCE($5, gender),
        blood_group = COALESCE($6, blood_group), aadhaar_no = COALESCE($7, aadhaar_no),
        phone = COALESCE($8, phone), email = COALESCE($9, email), address = COALESCE($10, address),
        photo = COALESCE($11, photo), father_name = COALESCE($12, father_name),
        father_phone = COALESCE($13, father_phone), father_email = COALESCE($14, father_email),
        father_occupation = COALESCE($15, father_occupation), father_income = COALESCE($16, father_income),
        mother_name = COALESCE($17, mother_name), mother_phone = COALESCE($18, mother_phone),
        mother_occupation = COALESCE($19, mother_occupation),
        guardian_name = COALESCE($20, guardian_name), guardian_phone = COALESCE($21, guardian_phone),
        guardian_relation = COALESCE($22, guardian_relation), religion = COALESCE($23, religion),
        caste = COALESCE($24, caste), pen_number = COALESCE($25, pen_number),
        birth_cert_no = COALESCE($26, birth_cert_no), tc_number = COALESCE($27, tc_number),
        is_rte = COALESCE($28, is_rte), is_active = COALESCE($29, is_active), updated_at = NOW()
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, name, dob, gender, bloodGroup, aadhaarNo, phone, email, address, photo,
        fatherName, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
        motherName, motherPhone, motherOccupation, guardianName, guardianPhone, guardianRelation,
        religion, caste, penNumber, birthCertNo, tcNumber, isRte, isActive]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Student not found' });

    if (academicYearId) {
      await pool.query(`
        UPDATE student_academic_records SET
          class_name = COALESCE($3, class_name), section = COALESCE($4, section), roll_no = COALESCE($5, roll_no)
        WHERE student_id = $1 AND academic_year_id = $2
      `, [id, academicYearId, className, section, rollNo]);
    }

    return res.json(result.rows[0]);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/students/:id (deactivate only - permanent identity rule)
router.delete('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`UPDATE students SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Student deactivated' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
