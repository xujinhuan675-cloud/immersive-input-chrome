import type { GuideSession } from '@/common/guide-types';
import { STORAGE_KEYS } from '@/common/constants';

type GuideSessionMap = Record<string, GuideSession>;

async function readMap(): Promise<GuideSessionMap> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.GUIDE_SESSIONS]);
  return (result[STORAGE_KEYS.GUIDE_SESSIONS] as GuideSessionMap | undefined) ?? {};
}

async function writeMap(map: GuideSessionMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.GUIDE_SESSIONS]: map });
}

export async function listGuideSessions(): Promise<GuideSession[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getGuideSession(sessionId: string): Promise<GuideSession | null> {
  const map = await readMap();
  return map[sessionId] ?? null;
}

export async function saveGuideSession(session: GuideSession): Promise<void> {
  const map = await readMap();
  map[session.id] = session;
  await writeMap(map);
}
