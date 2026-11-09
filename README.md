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
2. **Create the tables:** in the dashboard open **SQL Editor → New query**, paste `supabase/001_phase1.sql`, click **Run**. Then do the same with `002_pomodoro.sql`, `003_presence.sql`, `004_streaks_groups.sql` and `005_quizzes.sql` (in order).
3. **Copy your keys:** open **Project Settings → API** (or the **Connect** button), then copy the *Project URL* and the *publishable* (or *anon*) key.
4. In this folder, copy `.env.example` to `.env` and paste those two values in.
5. *(Optional, makes testing easier)* **Authentication → Sign In / Providers → Email**: turn off "Confirm email" so sign-up logs you straight in.

6. **AI (free):** make a key at https://console.groq.com/keys and add `GROQ_API_KEY=...` to `.env`.
   No `VITE_` prefix: the key stays on the server (`api/` functions) and is never sent to the browser.

## Run it

```
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173).

## Camera buddy & privacy
- Face/pose detection runs entirely in the browser (face-api + MediaPipe; models in `public/models`).
- Face setup stores 5 face descriptors (128 numbers each, not photos) in this browser's localStorage only.
- The database only receives "logged in / logged out" times (`presence_events`).
