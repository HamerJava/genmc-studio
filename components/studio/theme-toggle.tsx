'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
    try {
      localStorage.setItem('genmc-theme', next ? 'dark' : 'light');
    } catch {}
  }
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      aria-pressed={dark}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
