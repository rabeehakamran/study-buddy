/** Cute affirmations from Buddy. One per day, with a "another one" button. */
export const QUOTES = [
  'You don’t have to be perfect, just a little better than yesterday 🎀',
  'Tiny steps still move you forward. Proud of you! 💜',
  'Your brain is growing every time you try something hard ✨',
  'One pomodoro at a time. You’ve totally got this 🍅',
  'It’s okay to rest. It’s not okay to give up 🌙',
  'Future you is going to be SO grateful for today 💌',
  'Mistakes are just proof you’re learning 📚',
  'You are smarter than you think and stronger than you feel 💪',
  'Thora thora karke, sab ho jayega 🌸',
  'Drink water, fix your posture, and be kind to yourself 💧',
  'Hard work + cute stationery = unstoppable 🖊️',
  'Bas 25 minute! Phir break 🧁',
  'You’re not behind. You’re on your own path 🌷',
  'Every expert was once a beginner who didn’t quit ⭐',
  'Focus on progress, not perfection 🫶',
  'Believe in yourself like Buddy believes in you 🐱',
  'Small daily wins make big dreams come true 🌈',
  'Aaj ka kaam aaj, phir Netflix kal se 😌',
  'You showed up today. That already counts 💜',
  'Your effort is never wasted, even when it’s slow 🐢',
  'Breathe in confidence, breathe out stress 🌬️',
  'Be the main character of your own study montage 🎬',
  'Done is better than perfect ✔️',
  'Mehnat kabhi waste nahi hoti 💫',
  'Today’s little effort is tomorrow’s big result 🌱',
  'Snacks are allowed. Quitting is not 🍪',
  'You can do hard things. You’ve done them before 🏆',
  'Shine bright, study hard, sleep well 🌟',
  'Ek ek chapter, ek ek din. Tum kar logi! 📖',
  'Proud of you for trying, even on the hard days 🫂',
];

export function quoteOfTheDay(offset = 0): string {
  const d = new Date();
  const dayNumber = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  return QUOTES[(((dayNumber + offset) % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
