import {
  Barbell, Brain, Briefcase, Buildings, BookOpenText, Cards, ChartBar, FileJs, ForkKnife, House,
  LinkedinLogo, Notebook, Path, PuzzlePiece, Robot, Scales, ShieldCheck, Sparkle, Stack, TrendUp, UserCircle,
} from '@phosphor-icons/react';

// Single source of truth for the app's areas: nav order, labels, icons and accent colour.
// Icon = Phosphor component for navigation (skill B6); icon = the emoji still used in a few page titles.
export const AREAS = [
  { key: 'home', to: '/', label: 'Today', icon: '🏠', Icon: House, color: 'var(--success)', end: true },
  { key: 'journey', to: '/journey', label: 'Journey', icon: '🧭', Icon: Path, color: 'var(--dsa)' },
  { key: 'journal', to: '/journal', label: 'Journal', icon: '📓', Icon: Notebook, color: 'var(--cards)' },
  { key: 'me', to: '/me', label: 'Me', icon: '🙂', Icon: UserCircle, color: 'var(--report)' },
  { key: 'dsa', to: '/dsa', label: 'DSA', icon: '🧠', Icon: Brain, color: 'var(--dsa)' },
  // .NET + React: one full-stack course (an API endpoint and the React screen that uses it, every week)
  { key: 'fullstack', to: '/fullstack', label: 'Full stack', icon: '🧱', Icon: Stack, color: 'var(--fullstack)' },
  { key: 'node', to: '/node', label: 'Node.js', icon: '🟢', Icon: FileJs, color: 'var(--node)' },
  { key: 'workout', to: '/workout', label: 'Workout', icon: '💪', Icon: Barbell, color: 'var(--workout)' },
  { key: 'meals', to: '/meals', label: 'Meals', icon: '🍽️', Icon: ForkKnife, color: 'var(--meals)' },
  { key: 'progress', to: '/progress', label: 'Progress', icon: '📈', Icon: TrendUp, color: 'var(--progress)' },
  { key: 'ai', to: '/ai', label: 'AI + FDE', icon: '✨', Icon: Sparkle, color: 'var(--ai)' },
  { key: 'lld', to: '/lld', label: 'LLD', icon: '🧩', Icon: PuzzlePiece, color: 'var(--lld)' },
  { key: 'hld', to: '/hld', label: 'HLD', icon: '🏗️', Icon: Buildings, color: 'var(--hld)' },
  { key: 'judge', to: '/judge', label: 'Judgement', icon: '⚖️', Icon: Scales, color: 'var(--judge)' },
  { key: 'assignments', to: '/assignments', label: 'Assignments', icon: '📘', Icon: BookOpenText, color: 'var(--assign)' },
  { key: 'cards', to: '/cards', label: 'Flashcards', icon: '🃏', Icon: Cards, color: 'var(--cards)' },
  { key: 'report', to: '/report', label: 'Weekly report', icon: '📊', Icon: ChartBar, color: 'var(--report)' },
  { key: 'linkedin', to: '/linkedin', label: 'LinkedIn', icon: '💼', Icon: LinkedinLogo, color: 'var(--linkedin)' },
  { key: 'mentor', to: '/mentor', label: 'Mentor', icon: '🤖', Icon: Robot, color: 'var(--mentor)' },
];

export const areaByKey = Object.fromEntries(AREAS.map((a) => [a.key, a]));
// Data from before the full-stack merge (or a database not migrated yet) still says 'dotnet' / 'react': show it as full stack
// instead of crashing on a missing area.
areaByKey.dotnet = areaByKey.fullstack;
areaByKey.react = areaByKey.fullstack;

// The whole navigation: four sections. Every other area above is reached from inside Journey or Me.
export const NAV = ['home', 'journey', 'journal', 'me'];

// The learning tracks (at most 3 are active at once; the rest are parked: see Journey).
export const TRACK_KEYS = ['dsa', 'ai', 'lld', 'hld', 'judge', 'fullstack', 'node'];

// The four stats of the growth layer (server/src/growth.js): icon + colour per stat.
export const STAT_META = {
  career: { label: 'Career', Icon: Briefcase, color: 'var(--dsa)' },
  fitness: { label: 'Fitness', Icon: Barbell, color: 'var(--workout)' },
  knowledge: { label: 'Knowledge', Icon: BookOpenText, color: 'var(--ai)' },
  discipline: { label: 'Discipline', Icon: ShieldCheck, color: 'var(--judge)' },
};
