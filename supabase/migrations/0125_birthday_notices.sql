-- 0125_birthday_notices.sql
-- Auto-greeting: every active student whose DOB month-day matches today
-- (IST) gets a personal notice inserted on their behalf. Surfaces in the
-- existing Notices feed + the dashboard "Today's Notice" hero banner.
--
-- Zero extra queries from the app — the daily Vercel cron calls this RPC
-- once. Idempotent: same-day re-runs skip students that already got the
-- greeting (de-dup by title + IST date + target_student_id).

CREATE OR REPLACE FUNCTION public.post_birthday_notices()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inserted INT := 0;
  v_today_ist DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_today_md  TEXT := to_char(v_today_ist, 'MM-DD');
  s RECORD;
BEGIN
  FOR s IN
    SELECT id, name, school_id
      FROM public.students
     WHERE is_active = TRUE
       AND dob IS NOT NULL
       AND to_char(dob, 'MM-DD') = v_today_md
       AND NOT EXISTS (
         SELECT 1 FROM public.notices n
          WHERE n.target_student_id = students.id
            AND n.title = 'Happy Birthday! 🎉'
            AND (n.sent_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_today_ist
       )
  LOOP
    INSERT INTO public.notices (
      school_id, title, body, audience, sent_by_name,
      target_student_id, is_active, pinned
    ) VALUES (
      s.school_id,
      'Happy Birthday! 🎉',
      'Wishing ' || s.name || ' a very happy birthday from your school. Have a wonderful day!',
      'SPECIFIC_STUDENT',
      'School',
      s.id,
      TRUE,
      FALSE
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END $$;

REVOKE EXECUTE ON FUNCTION public.post_birthday_notices() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.post_birthday_notices() TO service_role;
