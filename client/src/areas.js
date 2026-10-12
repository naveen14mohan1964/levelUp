// Single source of truth for the app's areas: nav order, labels, icons and accent colour.
export const AREAS = [
  { key: 'home', to: '/', label: 'Home', icon: '🏠', color: 'var(--success)', end: true },
  { key: 'dsa', to: '/dsa', label: 'DSA', icon: '🧠', color: 'var(--dsa)' },
  { key: 'react', to: '/react', label: 'React', icon: '⚛️', color: 'var(--react)' },
  { key: 'dotnet', to: '/dotnet', label: '.NET', icon: '🟣', color: 'var(--dotnet)' },
  { key: 'node', to: '/node', label: 'Node.js', icon: '🟢', color: 'var(--node)' },
  { key: 'workout', to: '/workout', label: 'Workout', icon: '💪', color: 'var(--workout)' },
  { key: 'meals', to: '/meals', label: 'Meals', icon: '🍽️', color: 'var(--meals)' },
  { key: 'progress', to: '/progress', label: 'Progress', icon: '📈', color: 'var(--progress)' },
  { key: 'ai', to: '/ai', label: 'AI + FDE', icon: '✨', color: 'var(--ai)' },
  { key: 'lld', to: '/lld', label: 'LLD', icon: '🧩', color: 'var(--lld)' },
  { key: 'hld', to: '/hld', label: 'HLD', icon: '🏗️', color: 'var(--hld)' },
  { key: 'linkedin', to: '/linkedin', label: 'LinkedIn', icon: '💼', color: 'var(--linkedin)' },
  { key: 'mentor', to: '/mentor', label: 'Mentor', icon: '🤖', color: 'var(--mentor)' },
];

export const areaByKey = Object.fromEntries(AREAS.map((a) => [a.key, a]));
