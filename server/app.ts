import express from 'express';
import { authRouter }         from './routes/auth';
import { academicYearRouter } from './routes/academic-year';
import { studentsRouter }     from './routes/students';
import { feesRouter }         from './routes/fees';
import { transportRouter }    from './routes/transport';
import { attendanceRouter }   from './routes/attendance';
import { examsRouter }        from './routes/exams';
import { promotionRouter }    from './routes/promotion';
import { teacherRouter }      from './routes/teacher';
import { settingsRouter }     from './routes/settings';

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0', ts: new Date().toISOString() });
});

app.use('/api/auth',          authRouter);
app.use('/api/academic-year', academicYearRouter);
app.use('/api/students',      studentsRouter);
app.use('/api/fees',          feesRouter);
app.use('/api/transport',     transportRouter);
app.use('/api/attendance',    attendanceRouter);
app.use('/api/exam',          examsRouter);
app.use('/api/promotion',     promotionRouter);
app.use('/api/teacher',       teacherRouter);
app.use('/api/settings',      settingsRouter);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});
