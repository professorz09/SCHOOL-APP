import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runMigrations, seedInitialData } from './db/migrate';
import { authenticate, requireSchoolAccess, requirePasswordChanged } from './middleware/auth';

// Routes
import authRoutes from './routes/auth';
import schoolRoutes from './routes/schools';
import academicYearRoutes from './routes/academic-years';
import sectionRoutes from './routes/sections';
import studentRoutes from './routes/students';
import staffRoutes from './routes/staff';
import feeRoutes from './routes/fees';
import attendanceRoutes from './routes/attendance';
import timetableRoutes from './routes/timetable';
import homeworkRoutes from './routes/homework';
import noticeRoutes from './routes/notices';
import examRoutes from './routes/exams';
import transportRoutes from './routes/transport';
import complaintRoutes from './routes/complaints';
import broadcastRoutes from './routes/broadcasts';
import billingRoutes from './routes/billing';
import userRoutes from './routes/users';

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth (no school scoping)
app.use('/api/auth', authRoutes);

// Broadcasts (super admin level) — require password changed
app.use('/api/broadcasts', authenticate, requirePasswordChanged, broadcastRoutes);

// Billing (super admin level) — require password changed
app.use('/api/billing', authenticate, requirePasswordChanged, billingRoutes);

// Schools — require password changed for all school management
app.use('/api/schools', authenticate, requirePasswordChanged, schoolRoutes);

// School-scoped routes — authenticate + password change check + school access applied centrally
const schoolScopedMiddleware = [authenticate, requirePasswordChanged, requireSchoolAccess];
app.use('/api/schools/:schoolId/academic-years', schoolScopedMiddleware, academicYearRoutes);
app.use('/api/schools/:schoolId/sections', schoolScopedMiddleware, sectionRoutes);
app.use('/api/schools/:schoolId/students', schoolScopedMiddleware, studentRoutes);
app.use('/api/schools/:schoolId/staff', schoolScopedMiddleware, staffRoutes);
app.use('/api/schools/:schoolId/fees', schoolScopedMiddleware, feeRoutes);
app.use('/api/schools/:schoolId/attendance', schoolScopedMiddleware, attendanceRoutes);
app.use('/api/schools/:schoolId/timetable', schoolScopedMiddleware, timetableRoutes);
app.use('/api/schools/:schoolId/homework', schoolScopedMiddleware, homeworkRoutes);
app.use('/api/schools/:schoolId/notices', schoolScopedMiddleware, noticeRoutes);
app.use('/api/schools/:schoolId/exams', schoolScopedMiddleware, examRoutes);
app.use('/api/schools/:schoolId/transport', schoolScopedMiddleware, transportRoutes);
app.use('/api/schools/:schoolId/complaints', schoolScopedMiddleware, complaintRoutes);
app.use('/api/schools/:schoolId/users', schoolScopedMiddleware, userRoutes);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    console.log('🔄 Running database migrations...');
    await runMigrations();
    console.log('🌱 Seeding initial data...');
    await seedInitialData();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 API Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
