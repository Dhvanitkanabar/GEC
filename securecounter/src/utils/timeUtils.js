/**
 * Time utility functions for SecureCounter AI
 */

export const formatTimestamp = (date = new Date()) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
};

export const formatDate = (date = new Date()) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const getTimeDiffMs = (a, b) => {
  return Math.abs(a.getTime() - b.getTime());
};

export const isWithinTolerance = (a, b, toleranceMs = 3000) => {
  return getTimeDiffMs(a, b) <= toleranceMs;
};

export const randomInRange = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};
