import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currencySymbol?: string) {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(amount));

  if (currencySymbol) {
    return `${currencySymbol}${formatted}`;
  }
  return formatted;
}

export function formatBalance(amount: number, currencySymbol?: string) {
  const formatted = formatCurrency(amount, currencySymbol);
  if (amount === 0) return formatted;
  return `${formatted} ${amount > 0 ? 'Dr' : 'Cr'}`;
}

