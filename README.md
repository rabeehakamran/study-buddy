# 🎀 Study Buddy

Timetable, tasks, pomodoro with face presence, AI tutor, streaks and a friends leaderboard.

## Roadmap
- [x] **Phase 1:** login, subjects + tasks, weekly timetable, "Today" dashboard
- [x] **Phase 2:** pomodoro timer (sessions saved for streaks)
- [x] **Phase 3:** Camera buddy: on-device presence + face recognition, auto-pause, desk log
- [x] **Phase 4:** streaks (25 min/day), weekly chart, study-day heatmap, per-subject time, friend groups + leaderboard
- [x] Pixel illustrations on every page, Buddy's daily affirmations on Today
- [x] **Phase 5:** "Ask Buddy" AI tutor (streaming, English/Hinglish/Urdu) + interactive AI quizzes (Groq)
- [x] Reskin: black + purple pixel style, Buddy the cat mascot

## Setup (one time)

1. **Create a free Supabase project** at https://supabase.com → New project.
2. **Create the tables:** in the dashboard open **SQL Editor → New query**, paste `supabase/001_phase1.sql`, click **Run**. Then do the same with `002_pomodoro.sql`, `003_presence.sql`, `004_streaks_groups.sql`, `005_quizzes.sql` and `006_ai_limits.sql` (in order).
3. **Copy your keys:** open **Project Settings → API** (or the **Connect** button), then copy the *Project URL* and the *publishable* (or *anon*) key.
4. In this folder, copy `.env.example` to `.env` and paste those two values in.
5. *(Optional, makes testing easier)* **Authentication → Sign In / Providers → Email**: turn off "Confirm email" so sign-up logs you straight in.

6. **AI (free):** make a key at https://console.groq.com/keys and add `GROQ_API_KEY=...` to `.env`.
   No `VITE_` prefix: the key stays on the server (`api/` functions) and is never sent to the browser.
   Each student gets 5 "Ask Buddy" messages a day (set `CHAT_DAILY_LIMIT` to change it; counted in `ai_usage`).
   Quizzes are generated, then independently re-solved by a second AI pass; questions where the two disagree are dropped.

## Run it

```
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173).

## Put it online (Vercel, free)

1. `npx vercel login`
2. `npx vercel --yes` creates the project and makes a first test deploy.
3. Vercel dashboard → your project → **Settings → Environment Variables**, add for all environments:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `GROQ_API_KEY` (optional: `CHAT_DAILY_LIMIT`).
4. `npx vercel --prod --yes` builds with those variables and prints your live link.
5. Supabase → **Authentication → URL Configuration**: set **Site URL** to your live link and add it under
   **Redirect URLs** (keep `http://localhost:5173` too), so confirmation emails point to the right place.

To update the live site later: `npx vercel --prod --yes`.

## Security & guardrails

Run `supabase/007_security.sql` **before** deploying this version of the app (the timer now saves through it).

- **No faking hours/streaks:** study sessions are started and finished through `begin_focus` / `end_focus`, which use the
  server clock and cap minutes at real elapsed time and the planned length. Students can't insert or edit sessions directly.
- **Row security** on every table: students only see their own data; leaderboards expose totals only.
- **Names:** display and group names are tidied (length, invisible characters) and checked against a rude-word list
  (English + Roman Urdu, incl. l33t/spaced/stretched spellings). Rude signup names become "Student xxxx".
- **Groups:** 8-character invite codes; owners can remove members and make a new code; max 5 groups created / 15 joined.
- **AI limits:** per-student daily limits for chats and quizzes plus app-wide daily caps, counted atomically in the database
  (parallel requests can't sneak past), with "today" decided by the server. Input size is capped.
- **AI safety rules** shared by the tutor and quiz maker (age-appropriate, no harmful content, care + trusted-adult advice for
  distress, teach rather than do assignments, prompt-injection resistant; student-typed text is passed as data).
- **Anti-spam:** per-student row limits (30 subjects, 1000 tasks, 300 timetable slots…) and text length limits.
- **Security headers** (in `vercel.json`): CSP, no framing, nosniff, camera only for this site, HSTS. `vite preview` sends the same headers.
- The Groq key and Supabase settings stay on the server; error details from the AI provider are never sent to the browser.

## Camera buddy & privacy
- Face/pose detection runs entirely in the browser (face-api + MediaPipe; models in `public/models`).
- Face setup stores 5 face descriptors (128 numbers each, not photos) in this browser's localStorage only.
- The database only receives "logged in / logged out" times (`presence_events`).
