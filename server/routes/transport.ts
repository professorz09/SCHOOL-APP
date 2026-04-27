import { Router, Response } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

// GET /api/schools/:schoolId/transport/vehicles
router.get('/vehicles', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER', 'DRIVER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  try {
    const result = await pool.query(`
      SELECT v.*,
        COALESCE(json_agg(json_build_object(
          'id', rs.id, 'name', rs.name, 'estimatedTime', rs.estimated_time,
          'lat', rs.lat, 'lng', rs.lng, 'sortOrder', rs.sort_order
        ) ORDER BY rs.sort_order) FILTER (WHERE rs.id IS NOT NULL), '[]') as stops
      FROM transport_vehicles v
      LEFT JOIN route_stops rs ON rs.vehicle_id = v.id
      WHERE v.school_id = $1
      GROUP BY v.id
      ORDER BY v.route_name
    `, [schoolId]);
    return res.json(result.rows);
  } catch (err: unknown) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/transport/vehicles
router.post('/vehicles', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { vehicleNo, type, capacity, routeName, driverName, driverPhone } = req.body;
  if (!vehicleNo) return res.status(400).json({ error: 'vehicleNo required' });
  try {
    const result = await pool.query(`
      INSERT INTO transport_vehicles (school_id, vehicle_no, type, capacity, route_name, driver_name, driver_phone)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [schoolId, vehicleNo, type || 'BUS', capacity || 0, routeName, driverName, driverPhone]);
    return res.status(201).json({ ...result.rows[0], stops: [] });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') return res.status(409).json({ error: 'Vehicle number already exists' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/transport/vehicles/:id
router.put('/vehicles/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { vehicleNo, type, capacity, routeName, driverId, driverName, driverPhone, isActive } = req.body;
  try {
    const result = await pool.query(`
      UPDATE transport_vehicles SET
        vehicle_no = COALESCE($3, vehicle_no), type = COALESCE($4, type), capacity = COALESCE($5, capacity),
        route_name = COALESCE($6, route_name), driver_id = COALESCE($7, driver_id),
        driver_name = COALESCE($8, driver_name), driver_phone = COALESCE($9, driver_phone),
        is_active = COALESCE($10, is_active), updated_at = NOW()
      WHERE id = $1 AND school_id = $2 RETURNING *
    `, [id, schoolId, vehicleNo, type, capacity, routeName, driverId, driverName, driverPhone, isActive]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Vehicle not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/transport/vehicles/:id
router.delete('/vehicles/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    await pool.query(`DELETE FROM transport_vehicles WHERE id = $1 AND school_id = $2`, [id, schoolId]);
    return res.json({ message: 'Vehicle deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/transport/vehicles/:vehicleId/stops
router.post('/vehicles/:vehicleId/stops', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const vehicleId = parseInt(req.params.vehicleId);
  const { name, estimatedTime, lat, lng, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    // Verify vehicle belongs to this school
    const vCheck = await pool.query(`SELECT id FROM transport_vehicles WHERE id = $1 AND school_id = $2`, [vehicleId, schoolId]);
    if (!vCheck.rows[0]) return res.status(404).json({ error: 'Vehicle not found' });

    const result = await pool.query(`
      INSERT INTO route_stops (vehicle_id, name, estimated_time, lat, lng, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [vehicleId, name, estimatedTime, lat, lng, sortOrder || 0]);
    return res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/schools/:schoolId/transport/vehicles/:vehicleId/stops/:stopId
router.put('/vehicles/:vehicleId/stops/:stopId', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const vehicleId = parseInt(req.params.vehicleId);
  const stopId = parseInt(req.params.stopId);
  const { name, estimatedTime, lat, lng, sortOrder } = req.body;
  try {
    // Verify vehicle belongs to this school
    const vCheck = await pool.query(`SELECT id FROM transport_vehicles WHERE id = $1 AND school_id = $2`, [vehicleId, schoolId]);
    if (!vCheck.rows[0]) return res.status(404).json({ error: 'Vehicle not found' });

    const result = await pool.query(`
      UPDATE route_stops SET
        name = COALESCE($2, name), estimated_time = COALESCE($3, estimated_time),
        lat = COALESCE($4, lat), lng = COALESCE($5, lng), sort_order = COALESCE($6, sort_order)
      WHERE id = $1 AND vehicle_id = $7 RETURNING *
    `, [stopId, name, estimatedTime, lat, lng, sortOrder, vehicleId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Stop not found' });
    return res.json(result.rows[0]);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/schools/:schoolId/transport/vehicles/:vehicleId/stops/:stopId
router.delete('/vehicles/:vehicleId/stops/:stopId', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const vehicleId = parseInt(req.params.vehicleId);
  const stopId = parseInt(req.params.stopId);
  try {
    const result = await pool.query(
      `DELETE FROM route_stops rs
       USING transport_vehicles v
       WHERE rs.id = $1 AND rs.vehicle_id = $2 AND v.id = $2 AND v.school_id = $3`,
      [stopId, vehicleId, schoolId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Stop not found' });
    return res.json({ message: 'Stop deleted' });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/schools/:schoolId/transport/assignments
router.get('/assignments', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'TEACHER', 'DRIVER'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const { academicYearId, vehicleId, studentId } = req.query;
  try {
    let query = `
      SELECT sta.*, s.name as student_name, s.admission_no,
        v.vehicle_no, v.route_name, rs.name as stop_name
      FROM student_transport_assignments sta
      JOIN students s ON s.id = sta.student_id
      JOIN transport_vehicles v ON v.id = sta.vehicle_id
      LEFT JOIN route_stops rs ON rs.id = sta.stop_id
      WHERE v.school_id = $1
    `;
    const params: (string | number | boolean | null)[] = [schoolId];
    if (academicYearId) { query += ` AND sta.academic_year_id = $${params.length+1}`; params.push(academicYearId); }
    if (vehicleId) { query += ` AND sta.vehicle_id = $${params.length+1}`; params.push(vehicleId); }
    if (studentId) { query += ` AND sta.student_id = $${params.length+1}`; params.push(studentId); }
    query += ` ORDER BY s.name`;
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err: unknown) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/schools/:schoolId/transport/assignments
router.post('/assignments', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  if (req.user?.role === 'PRINCIPAL' && req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { studentId, academicYearId, vehicleId, stopId, monthlyAmount, startDate, endDate } = req.body;
  if (!studentId || !vehicleId || !academicYearId) {
    return res.status(400).json({ error: 'studentId, vehicleId, academicYearId required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deactivate existing assignments
    await client.query(`
      UPDATE student_transport_assignments SET is_active = FALSE, end_date = CURRENT_DATE
      WHERE student_id = $1 AND academic_year_id = $2 AND is_active = TRUE
    `, [studentId, academicYearId]);

    const result = await client.query(`
      INSERT INTO student_transport_assignments (student_id, academic_year_id, vehicle_id, stop_id, monthly_amount, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [studentId, academicYearId, vehicleId, stopId, monthlyAmount || 0, startDate || new Date().toISOString().split('T')[0], endDate]);

    const assignment = result.rows[0];

    // Generate transport fee installments
    if (monthlyAmount && monthlyAmount > 0) {
      const ay = await client.query(`SELECT * FROM academic_years WHERE id = $1`, [academicYearId]);
      if (ay.rows[0]) {
        const start = new Date(startDate || ay.rows[0].start_date);
        const end = new Date(endDate || ay.rows[0].end_date);
        const d = new Date(start);
        d.setDate(10);
        while (d <= end) {
          const monthName = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
          const dueDate = d.toISOString().split('T')[0];
          await client.query(`
            INSERT INTO fee_installments (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type, related_id)
            VALUES ($1,$2,$3,$4,$5,'TRANSPORT',$6,'PARENT',$7)
            ON CONFLICT DO NOTHING
          `, [studentId, academicYearId, schoolId, monthName, dueDate, monthlyAmount, assignment.id]);
          d.setMonth(d.getMonth() + 1);
        }
      }
    }

    await client.query('COMMIT');
    return res.status(201).json(assignment);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/schools/:schoolId/transport/assignments/:id
router.delete('/assignments/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req: AuthRequest, res: Response) => {
  const schoolId = parseInt(req.params.schoolId);
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Verify assignment belongs to this school via vehicle
    const assignment = await client.query(
      `SELECT sta.* FROM student_transport_assignments sta
       JOIN transport_vehicles v ON v.id = sta.vehicle_id
       WHERE sta.id = $1 AND v.school_id = $2`,
      [id, schoolId]
    );
    if (!assignment.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }

    await client.query(`UPDATE student_transport_assignments SET is_active = FALSE, end_date = CURRENT_DATE WHERE id = $1`, [id]);

    // Remove future unpaid transport fees for this assignment
    await client.query(`
      DELETE FROM fee_installments
      WHERE related_id = $1 AND fee_type = 'TRANSPORT' AND status NOT IN ('PAID','WAIVED') AND due_date > CURRENT_DATE
    `, [id]);

    await client.query('COMMIT');
    return res.json({ message: 'Assignment removed' });
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
