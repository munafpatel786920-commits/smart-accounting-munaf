import React from 'react';
import { useTranslation } from 'react-i18next';

interface Shortcut {
  key: string;
  label: string;
  action?: () => void;
}

interface ShortcutBarProps {
  shortcuts: Shortcut[];
}

export default function ShortcutBar({ shortcuts }: ShortcutBarProps) {
  return null;
}
