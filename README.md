# 🎀 Study Buddy

Timetable, tasks, pomodoro with face presence, AI tutor, streaks and a friends leaderboard.

## Roadmap
- [x] **Phase 1:** login, subjects + tasks, weekly timetable, "Today" dashboard
- [ ] Phase 2: pomodoro timer
- [ ] Phase 3: webcam presence + face recognition (on-device)
- [ ] Phase 4: streaks, weekly hours, friend-group leaderboard
- [ ] Phase 5: Groq-powered tutor + interactive quizzes
- [ ] Reskin: pink / lavender / bows / pixel (waiting on Pinterest inspo)

## Setup (one time)

1. **Create a free Supabase project** at https://supabase.com → New project.
2. **Create the tables:** in the dashboard open **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
3. **Copy your keys:** open **Project Settings → API** (or the **Connect** button), then copy the *Project URL* and the *publishable* (or *anon*) key.
4. In this folder, copy `.env.example` to `.env` and paste those two values in.
5. *(Optional, makes testing easier)* **Authentication → Sign In / Providers → Email**: turn off "Confirm email" so sign-up logs you straight in.

## Run it

```
npm install
npm run dev
```

Open the link it prints (usually http://localhost:5173).
