// One import for everything the game knows. Bump CONTENT_VERSION when a shipped key changes meaning; saves pin it.
export const CONTENT_VERSION = 1;

export * from './types.js';
export { STATS } from './stats.js';
export { CLASSES, classByKey } from './classes.js';
export { PROGRESSION, levelFor, levelStarts, statGains, statsAt, xpBar } from './progression.js';
export { AREAS, NPCS, areaByKey, npcByKey } from './world.js';
export { ITEMS, itemByKey } from './items.js';
export { QUESTS, questByKey } from './quests.js';
export { DIALOGUES, dialogueByKey } from './dialogue.js';
export { COPY } from './copy.js';
export { validateAll } from './validate.js';

import { COPY } from './copy.js';
import type { Lang, Text } from './types.js';

/** Pick a language from a bilingual string. */
export const tr = (t: Text, lang: Lang): string => t[lang] || t.bm;
/** Interface copy by key; the key itself when a string is missing, so a gap shows instead of crashing. */
export const copy = (key: string, lang: Lang): string => { const t = COPY[key]; return t ? tr(t, lang) : key; };
export { MOVEMENT } from './movement.js';
export { CHAIN_RESET, ILHAM, STRIKES, vitals, type Vitals } from './combat.js';
export { SKILLS, skillOf, skillsFor } from './skills.js';
export { ENEMIES, enemyByKey } from './enemies.js';
