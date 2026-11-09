# ðŸŽ€ Study Buddy

Timetable, tasks, pomodoro with face presence, AI tutor, streaks and a friends leaderboard.

## Roadmap
- [x] **Phase 1:** login, subjects + tasks, weekly timetable, "Today" dashboard
- [x] **Phase 2:** pomodoro timer (sessions saved for streaks)
- [ ] Phase 3: webcam presence + face recognition (on-device)
- [ ] Phase 4: streaks, weekly hours, friend-group leaderboard
- [ ] Phase 5: Groq-powered tutor + interactive quizzes
- [x] Reskin: black + purple pixel style, Buddy the cat mascot

## Setup (one time)

1. **Create a free Supabase project** at https://supabase.com â†’ New project.
2. **Create the tables:** in the dashboard open **SQL Editor â†’ New query**, paste `supabase/001_phase1.sql`, click **Run**. Then do the same with `supabase/002_pomodoro.sql`.
3. **Copy your keys:** open **Project Settings â†’ API** (or the **Connect** button), then copy the *Project URL* and the *publishable* (or *anon*) key.
4. In this folder, copy `.env.example` to `.env` and paste those two values in.
5. *(Optional, makes testing easier)* **Authentication â†’ Sign In / Providers â†’ Email**: turn off "Confirm email" so sign-up logs you straight in.

## Run it

```
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173).
