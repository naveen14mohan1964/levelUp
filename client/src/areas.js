import {
  Atom, Barbell, Brain, Buildings, BookOpenText, Cards, ChartBar, FileCSharp, FileJs, ForkKnife, House,
  LinkedinLogo, PuzzlePiece, Robot, Scales, Sparkle, TrendUp,
} from '@phosphor-icons/react';

// Single source of truth for the app's areas: nav order, labels, icons and accent colour.
// Icon = Phosphor component for navigation (skill B6); icon = the emoji still used in a few page titles.
export const AREAS = [
  { key: 'home', to: '/', label: 'Home', icon: '🏠', Icon: House, color: 'var(--success)', end: true },
  { key: 'dsa', to: '/dsa', label: 'DSA', icon: '🧠', Icon: Brain, color: 'var(--dsa)' },
  { key: 'react', to: '/react', label: 'React', icon: '⚛️', Icon: Atom, color: 'var(--react)' },
  { key: 'dotnet', to: '/dotnet', label: '.NET', icon: '🟣', Icon: FileCSharp, color: 'var(--dotnet)' },
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
