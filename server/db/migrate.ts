import pool from './pool';
import bcrypt from 'bcryptjs';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── schools ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        location VARCHAR(255),
        address TEXT,
        phone VARCHAR(50),
        principal_name VARCHAR(255),
        principal_email VARCHAR(255),
        principal_phone VARCHAR(50),
        status VARCHAR(20) DEFAULT 'ACTIVE',
        plan VARCHAR(20) DEFAULT 'BASIC',
        student_count INT DEFAULT 0,
        teacher_count INT DEFAULT 0,
        payment_status VARCHAR(20) DEFAULT 'PENDING',
        payment_start_date DATE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── academic_years ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS academic_years (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        label VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        board VARCHAR(50),
        medium VARCHAR(50),
        total_students INT DEFAULT 0,
        total_revenue BIGINT DEFAULT 0,
        total_expense BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── sections ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id SERIAL PRIMARY KEY,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        class_name VARCHAR(50) NOT NULL,
        section VARCHAR(10) NOT NULL,
        class_teacher VARCHAR(255),
        student_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── users ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        mobile_number VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        school_id INT REFERENCES schools(id),
        first_login_changed BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── parent_student_links ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS parent_student_links (
        id SERIAL PRIMARY KEY,
        parent_user_id INT REFERENCES users(id) ON DELETE CASCADE,
        student_id INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── students ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        admission_no VARCHAR(100) UNIQUE NOT NULL,
        roll_no VARCHAR(20),
        dob DATE,
        gender VARCHAR(10),
        blood_group VARCHAR(10),
        aadhaar_no VARCHAR(20),
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        photo VARCHAR(500),
        father_name VARCHAR(255),
        father_phone VARCHAR(50),
        father_email VARCHAR(255),
        father_occupation VARCHAR(100),
        father_income VARCHAR(100),
        mother_name VARCHAR(255),
        mother_phone VARCHAR(50),
        mother_occupation VARCHAR(100),
        guardian_name VARCHAR(255),
        guardian_phone VARCHAR(50),
        guardian_relation VARCHAR(100),
        religion VARCHAR(50),
        caste VARCHAR(50),
        pen_number VARCHAR(50),
        birth_cert_no VARCHAR(50),
        tc_number VARCHAR(50),
        is_rte BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        admission_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── student_academic_records ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_academic_records (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        section_id INT REFERENCES sections(id),
        class_name VARCHAR(50),
        section VARCHAR(10),
        roll_no VARCHAR(20),
        fee_status VARCHAR(20) DEFAULT 'PENDING',
        total_fee BIGINT DEFAULT 0,
        paid_fee BIGINT DEFAULT 0,
        attendance_percent DECIMAL(5,2) DEFAULT 0,
        is_promoted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(student_id, academic_year_id)
      )
    `);

    // ── staff ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        subject VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        aadhaar_no VARCHAR(20),
        salary BIGINT DEFAULT 0,
        joining_date DATE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        address TEXT,
        photo VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── staff_class_assignments ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS staff_class_assignments (
        id SERIAL PRIMARY KEY,
        staff_id INT REFERENCES staff(id) ON DELETE CASCADE,
        class_name VARCHAR(100) NOT NULL
      )
    `);

    // ── salary_payments ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS salary_payments (
        id SERIAL PRIMARY KEY,
        staff_id INT REFERENCES staff(id) ON DELETE CASCADE,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        month VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        paid_at DATE DEFAULT CURRENT_DATE,
        transaction_id VARCHAR(100),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── fee_installments ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_installments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        month VARCHAR(30) NOT NULL,
        due_date DATE NOT NULL,
        fee_type VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        paid_amount BIGINT DEFAULT 0,
        write_off_amount BIGINT DEFAULT 0,
        write_off_reason TEXT,
        status VARCHAR(20) DEFAULT 'UNPAID',
        payer_type VARCHAR(20) DEFAULT 'PARENT',
        related_id INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── payment_records ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        amount BIGINT NOT NULL,
        method VARCHAR(30) NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        receipt_no VARCHAR(100) UNIQUE NOT NULL,
        advance_amount BIGINT DEFAULT 0,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── payment_installment_links ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_installment_links (
        id SERIAL PRIMARY KEY,
        payment_id INT REFERENCES payment_records(id) ON DELETE CASCADE,
        installment_id INT REFERENCES fee_installments(id) ON DELETE CASCADE,
        amount_applied BIGINT DEFAULT 0
      )
    `);

    // ── advance_balances ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS advance_balances (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE UNIQUE,
        amount BIGINT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── government_payments ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS government_payments (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        amount BIGINT NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        reference_no VARCHAR(100),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── govt_payment_student_links ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS govt_payment_student_links (
        id SERIAL PRIMARY KEY,
        govt_payment_id INT REFERENCES government_payments(id) ON DELETE CASCADE,
        student_id INT REFERENCES students(id) ON DELETE CASCADE
      )
    `);

    // ── attendance_records ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        section_id INT REFERENCES sections(id),
        class_name VARCHAR(50),
        section VARCHAR(10),
        date DATE NOT NULL,
        total_present INT DEFAULT 0,
        total_absent INT DEFAULT 0,
        total_students INT DEFAULT 0,
        marked_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(section_id, date)
      )
    `);

    // ── attendance_student_details ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_student_details (
        id SERIAL PRIMARY KEY,
        attendance_id INT REFERENCES attendance_records(id) ON DELETE CASCADE,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        is_present BOOLEAN NOT NULL,
        UNIQUE(attendance_id, student_id)
      )
    `);

    // ── timetable_slots ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS timetable_entries (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        section_id INT REFERENCES sections(id) ON DELETE CASCADE,
        class_id VARCHAR(20) NOT NULL,
        day VARCHAR(15) NOT NULL,
        slot_id VARCHAR(20) NOT NULL,
        subject VARCHAR(100),
        teacher_id INT REFERENCES staff(id),
        teacher_name VARCHAR(255),
        room VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(section_id, day, slot_id)
      )
    `);

    // ── transport_vehicles ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS transport_vehicles (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        vehicle_no VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) DEFAULT 'BUS',
        capacity INT DEFAULT 0,
        route_name VARCHAR(255),
        driver_id INT REFERENCES staff(id),
        driver_name VARCHAR(255),
        driver_phone VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── route_stops ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS route_stops (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES transport_vehicles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        estimated_time VARCHAR(10),
        lat DECIMAL(10,7),
        lng DECIMAL(10,7),
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── student_transport_assignments ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_transport_assignments (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        vehicle_id INT REFERENCES transport_vehicles(id),
        stop_id INT REFERENCES route_stops(id),
        monthly_amount BIGINT DEFAULT 0,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── homework_assignments ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS homework_assignments (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        section_id INT REFERENCES sections(id),
        teacher_id INT REFERENCES staff(id),
        class_name VARCHAR(50),
        section VARCHAR(10),
        subject VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_date DATE DEFAULT CURRENT_DATE,
        due_date DATE,
        submitted_count INT DEFAULT 0,
        total_students INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── notices ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notices (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        audience VARCHAR(20) DEFAULT 'ALL',
        sent_by INT REFERENCES users(id),
        sent_by_name VARCHAR(255),
        pinned BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── test_schedules ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_schedules (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        section_id INT REFERENCES sections(id),
        teacher_id INT REFERENCES staff(id),
        class_name VARCHAR(50),
        section VARCHAR(10),
        subject VARCHAR(100),
        test_type VARCHAR(30) DEFAULT 'UNIT_TEST',
        title VARCHAR(255) NOT NULL,
        scheduled_date DATE,
        duration INT,
        max_marks INT,
        syllabus TEXT,
        results_uploaded BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── exam_results ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_results (
        id SERIAL PRIMARY KEY,
        test_id INT REFERENCES test_schedules(id) ON DELETE CASCADE,
        student_id INT REFERENCES students(id) ON DELETE CASCADE,
        academic_year_id INT REFERENCES academic_years(id) ON DELETE CASCADE,
        obtained_marks DECIMAL(6,2),
        grade VARCHAR(5),
        remarks TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(test_id, student_id)
      )
    `);

    // ── complaints ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        from_role VARCHAR(20) NOT NULL,
        from_name VARCHAR(255),
        from_user_id INT REFERENCES users(id),
        from_class VARCHAR(50),
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'OPEN',
        response TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);

    // ── broadcasts ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id SERIAL PRIMARY KEY,
        sent_by INT REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        target_schools INT[],
        sent_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── school_billing_schedules ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_billing_schedules (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
        plan VARCHAR(20) NOT NULL,
        annual_amount BIGINT NOT NULL,
        billing_start_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── school_billing_years ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_billing_years (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        year_label VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        annual_amount BIGINT NOT NULL,
        carried_forward BIGINT DEFAULT 0,
        total_due BIGINT NOT NULL,
        total_paid BIGINT DEFAULT 0,
        outstanding BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── school_payments ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS school_payments (
        id SERIAL PRIMARY KEY,
        school_id INT REFERENCES schools(id) ON DELETE CASCADE,
        billing_year_id INT REFERENCES school_billing_years(id),
        amount BIGINT NOT NULL,
        paid_at DATE DEFAULT CURRENT_DATE,
        txn_id VARCHAR(100),
        method VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── system_logs ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        school_id INT REFERENCES schools(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INT,
        details JSONB,
        ip_address VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── schema additions (safe ALTER TABLE) ──────────────────────────────────
    // Add user_id to students for direct user-student linkage (student app login)
    await client.query(`
      ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL
    `);

    await client.query('COMMIT');
    console.log('✅ All migrations completed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function seedInitialData() {
  const client = await pool.connect();
  try {
    // Check if super admin already exists
    const existing = await client.query(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`);
    if (existing.rows.length > 0) {
      console.log('✅ Seed data already exists, skipping');
      return;
    }

    // Super admin is seeded with first_login_changed = FALSE to enforce first-login password change
    // After first login, super admin must change password via /api/auth/change-password
    const passwordHash = await bcrypt.hash('admin@123', 10);
    await client.query(`
      INSERT INTO users (mobile_number, password_hash, role, name, email, first_login_changed, is_active)
      VALUES ('9999999999', $1, 'SUPER_ADMIN', 'Super Admin', 'admin@school.app', FALSE, TRUE)
    `, [passwordHash]);

    console.log('✅ Seed data created. Super Admin: mobile=9999999999, password=admin@123 (must change on first login)');
  } finally {
    client.release();
  }
}
