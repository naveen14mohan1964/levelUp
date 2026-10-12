// A daily motivation quote: the same one all day (local date), a different one tomorrow.
// Every quote runs once per cycle (no repeats until all have been shown), and each cycle has a new order.
// Only quotes with well-known wording and attribution are listed; sayings without a clear author are labelled as such.
export const QUOTES = [
  ['You do not rise to the level of your goals. You fall to the level of your systems.', 'James Clear'],
  ['Every action you take is a vote for the type of person you wish to become.', 'James Clear'],
  ['Habits are the compound interest of self-improvement.', 'James Clear'],
  ['Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier'],
  ['Motivation is what gets you started. Habit is what keeps you going.', 'Jim Ryun'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant'],
  ['Discipline equals freedom.', 'Jocko Willink'],
  ['Hard work beats talent when talent doesn\'t work hard.', 'Tim Notke'],
  ['Don\'t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['Small daily improvements over time lead to stunning results.', 'Robin Sharma'],
  ['Amateurs sit and wait for inspiration, the rest of us just get up and go to work.', 'Stephen King'],
  ['Show up, show up, show up, and after a while the muse shows up, too.', 'Isabel Allende'],
  ['Sometimes magic is just someone spending more time on something than anyone else might reasonably expect.', 'Teller'],
  ['Be so good they can\'t ignore you.', 'Steve Martin'],
  ['What we fear doing most is usually what we most need to do.', 'Tim Ferriss'],
  ['You miss 100% of the shots you don\'t take.', 'Wayne Gretzky'],
  ['Arise, awake, and stop not till the goal is reached.', 'Swami Vivekananda'],
  ['Take up one idea. Make that one idea your life.', 'Swami Vivekananda'],
  ['You have to dream before your dreams can come true.', 'A. P. J. Abdul Kalam'],
  ['If you want to shine like a sun, first burn like a sun.', 'A. P. J. Abdul Kalam'],
  ['Excellence is a continuous process and not an accident.', 'A. P. J. Abdul Kalam'],
  ['You have a right to your actions, but never to their fruits.', 'Bhagavad Gita 2.47'],
  ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
  ['We suffer more often in imagination than in reality.', 'Seneca'],
  ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
  ['First say to yourself what you would be; and then do what you have to do.', 'Epictetus'],
  ['No man is free who is not master of himself.', 'Epictetus'],
  ['Knowing is not enough; we must apply. Willing is not enough; we must do.', 'Johann Wolfgang von Goethe'],
  ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'],
  ['Fall seven times, stand up eight.', 'Japanese proverb'],
  ['Slow is smooth, smooth is fast.', 'Military saying'],
  ['Genius is one percent inspiration and ninety-nine percent perspiration.', 'Thomas Edison'],
  ['If I have seen further it is by standing on the shoulders of Giants.', 'Isaac Newton'],
  ['The important thing is not to stop questioning.', 'Albert Einstein'],
  ['Experience is the name everyone gives to their mistakes.', 'Oscar Wilde'],
  ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
  ['The more that you read, the more things you will know. The more that you learn, the more places you\'ll go.', 'Dr. Seuss'],
  ['I fear not the man who has practiced 10,000 kicks once, but I fear the man who has practiced one kick 10,000 times.', 'Bruce Lee'],
  ['Absorb what is useful, discard what is useless and add what is specifically your own.', 'Bruce Lee'],
  ['Don\'t quit. Suffer now and live the rest of your life as a champion.', 'Muhammad Ali'],
  ['Stay hungry, stay foolish.', 'Steve Jobs'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['Real artists ship.', 'Steve Jobs'],
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', 'Martin Fowler'],
  ['The function of good software is to make the complex appear to be simple.', 'Grady Booch'],
  ['Ideas are easy. Implementation is hard.', 'Guy Kawasaki'],
  ['Almost everything will work again if you unplug it for a few minutes, including you.', 'Anne Lamott'],
].map(([text, author]) => ({ text, author }));

const EPOCH = Date.UTC(2026, 0, 1);

// Small seeded PRNG (mulberry32) so a cycle's order is the same on every reload and device.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The quote for a local date ('YYYY-MM-DD'). */
export function quoteFor(dayISO) {
  const [y, m, d] = dayISO.split('-').map(Number);
  const index = Math.floor((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
  const n = QUOTES.length;
  const cycle = Math.floor(index / n);
  const order = QUOTES.map((_, i) => i);
  const rand = rng(cycle + 1);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return QUOTES[order[((index % n) + n) % n]];
}
