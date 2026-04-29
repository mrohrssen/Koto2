import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPath } from './data-dir.js';

// In-memory cache
let trackingData = null;

/**
 * Get current Tokyo date string (YYYY-MM-DD)
 */
function getTokyoDateString() {
  const now = new Date();
  // Tokyo is UTC+9
  const tokyoTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return tokyoTime.toISOString().split('T')[0];
}

/**
 * Get current Tokyo day of week (0 = Sunday, 1 = Monday, etc.)
 */
function getTokyoDayOfWeek() {
  const now = new Date();
  const tokyoTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return tokyoTime.getUTCDay();
}

/**
 * Load tracking data from file
 */
function loadTracking() {
  if (trackingData !== null) return trackingData;

  const trackingFile = dataPath('.jrpg-word-tracking.json');
  if (existsSync(trackingFile)) {
    try {
      trackingData = JSON.parse(readFileSync(trackingFile, 'utf-8'));
    } catch (e) {
      console.warn('[WordTracking] Failed to load tracking file:', e.message);
      trackingData = {};
    }
  } else {
    trackingData = {};
  }
  return trackingData;
}

/**
 * Save tracking data to file
 */
function saveTracking() {
  if (trackingData === null) return;
  try {
    writeFileSync(dataPath('.jrpg-word-tracking.json'), JSON.stringify(trackingData, null, 2));
  } catch (e) {
    console.warn('[WordTracking] Failed to save tracking file:', e.message);
  }
}

/**
 * Get or initialize user tracking data
 * Handles daily and weekly resets automatically
 */
function getUserTracking(userId) {
  const data = loadTracking();
  const today = getTokyoDateString();
  const dayOfWeek = getTokyoDayOfWeek();

  if (!data[userId]) {
    data[userId] = {
      today: { date: today, count: 0 },
      weekly: 0,
      weekStartDate: today,
      lifetime: 0
    };
    saveTracking();
    return data[userId];
  }

  const user = data[userId];

  // Check for daily reset
  if (user.today.date !== today) {
    user.today = { date: today, count: 0 };

    // Check for weekly reset (Monday = day 1 in Tokyo)
    if (dayOfWeek === 1) {
      user.weekly = 0;
      user.weekStartDate = today;
    }

    saveTracking();
  }

  return user;
}

/**
 * Get discovery status for a user
 * @param {string} userId - User ID
 * @param {number} dailyLimit - Daily word limit from settings
 * @returns {{ todayCount: number, dailyLimit: number, atLimit: boolean }}
 */
export function getDiscoveryStatus(userId, dailyLimit) {
  const user = getUserTracking(userId);
  const atLimit = dailyLimit === 0 || user.today.count >= dailyLimit;

  return {
    todayCount: user.today.count,
    dailyLimit,
    atLimit
  };
}

/**
 * Increment discovery count for a user
 * @param {string} userId - User ID
 * @returns {{ todayCount: number, atLimit: boolean }} Updated counts
 */
export function incrementDiscoveryCount(userId, dailyLimit) {
  const user = getUserTracking(userId);

  user.today.count++;
  user.weekly++;
  user.lifetime++;

  saveTracking();

  const atLimit = dailyLimit === 0 || user.today.count >= dailyLimit;

  return {
    todayCount: user.today.count,
    weekly: user.weekly,
    lifetime: user.lifetime,
    atLimit
  };
}

/**
 * Remove all discovery-limit tracking for a user.
 * @param {string} userId - User ID
 */
export function clearDiscoveryTracking(userId) {
  const data = loadTracking();
  if (!data[userId]) return false;

  delete data[userId];
  saveTracking();
  return true;
}

