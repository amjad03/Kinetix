'use client';

import { useEffect, useState } from 'react';

/** A record someone opened (student, staff, invoice…), remembered on this browser for Recent and Favourites. */
export interface RecordRef {
  href: string;
  title: string;
  /** What it is, shown as a hint ("Student", "Staff"). */
  kind?: string;
}

const RECENT = 'kx:recent-records';
const FAVS = 'kx:fav-records';
const EVT = 'kx:records-changed';
const MAX_RECENT = 8;
const MAX_FAV = 12;

function read(key: string): RecordRef[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as RecordRef[]).filter((r) => r && typeof r.href === 'string' && r.href.startsWith('/') && typeof r.title === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, rows: RecordRef[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVT));
}

/** Puts a record at the top of Recent. */
export function rememberRecord(r: RecordRef) {
  write(RECENT, [r, ...read(RECENT).filter((x) => x.href !== r.href)].slice(0, MAX_RECENT));
}

/** Adds or removes a record from Favourites. */
export function toggleFavRecord(r: RecordRef) {
  const favs = read(FAVS);
  write(FAVS, favs.some((x) => x.href === r.href) ? favs.filter((x) => x.href !== r.href) : [r, ...favs].slice(0, MAX_FAV));
}

/** Recent and favourite records, kept in step across components and browser tabs. */
export function useRecords(): { recent: RecordRef[]; favs: RecordRef[] } {
  const [state, setState] = useState<{ recent: RecordRef[]; favs: RecordRef[] }>({ recent: [], favs: [] });
  useEffect(() => {
    const load = () => setState({ recent: read(RECENT), favs: read(FAVS) });
    load();
    window.addEventListener(EVT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(EVT, load);
      window.removeEventListener('storage', load);
    };
  }, []);
  return state;
}

/** The record a page shows, for the last breadcrumb ("Students › Aarav Sharma"). */
let lastRecord: { path: string; title: string | null } | null = null;
export const getLastRecord = () => lastRecord;
export function announceRecord(path: string, title: string | null) {
  lastRecord = { path, title };
  window.dispatchEvent(new CustomEvent('kx:record', { detail: { path, title } }));
}
