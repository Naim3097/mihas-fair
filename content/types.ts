// The game as data. Everything a runtime needs to know about Ceritera's classes, stats, world, quests, dialogue and
// items is described by these shapes and authored in the sibling files. Both runtimes read them: the web tier
// imports the modules directly; the Unreal project imports the JSON that tools/export-content.mjs writes from them.
// Rules of the house: copy is always bilingual (BM first), keys are kebab-case and never change once shipped, and
// anything marked `draft` is a placeholder the writer or designer still has to sign off.

export type Lang = 'bm' | 'en';
export interface Text { bm: string; en: string }

/* ---------------- character ---------------- */

export const STAT_KEYS = ['knowledge', 'observation', 'endurance', 'curiosity'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export interface StatDef { key: StatKey; name: Text; blurb: Text }

export const CLASS_KEYS = ['ilmuwan', 'pendekar', 'tabib', 'pustakawan', 'pengembara', 'ahli-falak'] as const;
export type ClassKey = (typeof CLASS_KEYS)[number];

export interface ClassDef {
  key: ClassKey;
  /** The name on the board, e.g. "Ilmuwan". Not translated: it is the class's proper name in both languages. */
  name: string;
  /** "The Seeker" / "Pencari". */
  title: Text;
  blurb: Text;
  /** The line on the class's own sheet, e.g. "Perjalanan menguatkan diri; ilmu menguatkan jiwa." */
  motto?: Text;
  /** What this class is better at inside the library. Text only for now; the mechanic lands with the quest system. */
  perk: Text;
  /** Costume notes read off the avatar board, for the character artist and the appearance screen. */
  look: Text[];
  base: Stats;
  /** Which stats grow on each level-up, cycling through the pattern: growth[(level - 2) % growth.length]. */
  growth: StatKey[][];
  /** Which crop of the avatar board shows this class until the real renders exist. */
  portrait: string;
  draft?: boolean;
}

export interface Progression {
  maxLevel: number;
  /** XP needed to go from level i+1 to i+2 (index 0 = level 1 → 2). */
  xpToNext: number[];
}

/* ---------------- world ---------------- */

export type AreaKind = 'hall' | 'wing' | 'room' | 'garden' | 'tower' | 'archive' | 'hidden';
export interface AreaDef {
  key: string;
  name: Text;
  kind: AreaKind;
  /** The sign on the shelving, when the area is one of the library's sections. */
  sign?: Text;
  /** "Aras" on the compass: how many floors the area has. */
  floors: number;
  blurb: Text;
  /** Which buku.my categories fill this area's shelves (bukku's district ids). */
  catalogue: string[];
  /** Other areas you can walk to. Symmetric: every connection is listed from both sides. */
  connections: string[];
  fastTravel: boolean;
  /** Closed until the story opens it; the map shows a lock. */
  locked?: 'story' | 'level';
  /** Not on the map until discovered. */
  hidden?: boolean;
  /** Where the world places the player when they arrive by fast travel or a new journey. */
  spawn?: boolean;
  draft?: boolean;
}

export interface NpcDef {
  key: string;
  name: string;
  title: Text;
  area: string;
  blurb: Text;
  draft?: boolean;
}

/* ---------------- items ---------------- */

export type ItemKind = 'book' | 'item' | 'key' | 'equipment';
export type EquipSlot = 'head' | 'body' | 'legs' | 'feet' | 'hand';
export interface ItemDef {
  key: string;
  name: Text;
  kind: ItemKind;
  blurb: Text;
  /** The italic line under the description on the inventory board. */
  quote?: Text;
  slot?: EquipSlot;
  usable?: boolean;
  /** The board crop that stands in for the icon. */
  icon?: string;
  draft?: boolean;
}

/* ---------------- quests ---------------- */

export type ObjectiveKind = 'enter-area' | 'discover-area' | 'talk' | 'find-item' | 'collect' | 'meet';
export interface ObjectiveDef {
  key: string;
  text: Text;
  kind: ObjectiveKind;
  /** An area key, npc key or item key, depending on the kind. */
  target: string;
  /** For collect: how many. */
  count?: number;
}
export interface QuestDef {
  key: string;
  kind: 'main' | 'side';
  name: Text;
  /** One line under the name in the journal list. */
  summary: Text;
  blurb: Text;
  objectives: ObjectiveDef[];
  /** Objectives must be done in order (default: any order). */
  ordered?: boolean;
  xp: number;
  draft?: boolean;
}

/* ---------------- dialogue ---------------- */

export interface DialogueEffect {
  /** Start this quest. */
  startQuest?: string;
  /** Mark this objective done: "quest/objective". */
  completeObjective?: string;
}
export interface DialogueChoice { text: Text; next: string | null; effect?: DialogueEffect }
export interface DialogueNode {
  key: string;
  /** npc key, or "player". */
  speaker: string;
  line: Text;
  /** Either choices, or a single `next` (null ends the conversation). */
  choices?: DialogueChoice[];
  next?: string | null;
  effect?: DialogueEffect;
}
export interface DialogueDef { key: string; npc: string; start: string; nodes: DialogueNode[]; draft?: boolean }

/* ---------------- copy ---------------- */

export type Copy = Record<string, Text>;

/* ---------------- movement, combat, skills ---------------- */

/**
 * Clips of the shared animation library. The library is generated once on one rig and retargeted to every avatar
 * by joint name (all six rigs share the same 24 joints), so these names are the contract between content, the web
 * tier and the Unreal animation blueprint. `idle` is the clip each model carries itself.
 */
export const ANIM_KEYS = ['idle', 'combat-idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'dodge', 'attack-1', 'attack-2', 'attack-3', 'cast', 'cast-heavy', 'slam', 'spin', 'block', 'hit', 'death', 'victory', 'wave', 'dance', 'idle-calm', 'stroll', 'jog'] as const;
export type AnimKey = (typeof ANIM_KEYS)[number];

export const SKILL_SLOTS = ['q', 'w', 'e', 'r'] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

/** A region on the ground relative to the caster, in metres and degrees. `at` moves a circle that far ahead. */
export interface ShapeDef { kind: 'arc' | 'circle' | 'line' | 'self'; range: number; angle?: number; width?: number; at?: number }

export type BuffStat = 'speed' | 'damage' | 'armour' | 'regen' | 'jump';

/** What a skill does when its wind-up ends. Several effects run together; `delay` staggers them. */
export type EffectDef =
  | { kind: 'damage'; amount: number; shape: ShapeDef; knockback?: number; up?: number; stagger?: number; slow?: number; slowFor?: number; delay?: number; repeat?: number; every?: number; scatter?: number }
  | { kind: 'projectile'; amount: number; speed: number; range: number; radius: number; count?: number; spread?: number; homing?: number; pierce?: boolean; knockback?: number; mark?: number; markFor?: number }
  | { kind: 'dash'; distance: number; duration: number; invulnerable?: boolean; through?: boolean; back?: boolean }
  | { kind: 'leap'; distance: number; height: number; land?: { amount: number; radius: number; knockback?: number; up?: number; stagger?: number } }
  | { kind: 'heal'; amount: number; shape: ShapeDef }
  | { kind: 'buff'; stat: BuffStat; mult: number; duration: number }
  | { kind: 'shield'; amount: number; duration: number }
  | { kind: 'slow-time'; factor: number; duration: number }
  | { kind: 'pull'; shape: ShapeDef; strength: number }
  | { kind: 'stance'; duration: number; reduction: number; counter?: number };

export interface SkillDef {
  /** `${cls}-${slot}`. */
  key: string;
  cls: ClassKey;
  slot: SkillSlot;
  name: Text;
  blurb: Text;
  /** Seconds before the effects land, then seconds before the character is free again. */
  windup: number;
  recovery: number;
  cooldown: number;
  /** Semangat spent. The ultimate spends the full Ilham bar instead and ignores `cost`. */
  cost: number;
  ultimate?: boolean;
  anim: AnimKey;
  effects: EffectDef[];
  /** The character may keep moving while it plays (dashes and leaps move them themselves). */
  mobile?: boolean;
}

/** One strike of the basic-attack chain: its clip, hit window and hit shape. `step` is the lunge forward. */
export interface StrikeDef { anim: AnimKey; amount: number; shape: ShapeDef; windup: number; active: number; recovery: number; step: number; knockback?: number; up?: number; stagger?: number }

/** Locomotion tuning: the human numbers, then the ones the library allows. Metres, seconds, degrees. */
export interface MovementDef {
  walk: number; run: number; sprint: number;
  /** Sprinting keeps building to this over `sprintRamp` seconds. */
  sprintMax: number; sprintRamp: number;
  accel: number; decel: number; airControl: number; turn: number;
  gravity: number; fallMult: number; terminal: number;
  jump: number; airJump: number; airJumps: number; coyote: number; buffer: number;
  wallJump: { up: number; out: number };
  dodge: { distance: number; duration: number; iframes: number; cooldown: number; stamina: number };
  airDash: { speed: number; duration: number; stamina: number };
  /** Dropping from the air onto the ground: a burst around the landing point. */
  slam: { speed: number; radius: number; amount: number; knockback: number; up: number };
  stepHeight: number; radius: number; height: number;
  stamina: { max: number; regen: number; regenDelay: number; sprintDrain: number; jump: number };
}

export interface EnemyDef {
  key: string;
  name: Text;
  /** Which avatar rig the shadow borrows, or the wooden training post. */
  model: ClassKey | 'dummy';
  health: number; damage: number; speed: number;
  /** Notices the player within this many metres; strikes within `reach`. */
  aggro: number; reach: number;
  windup: number; recovery: number; cooldown: number;
  xp: number;
  /** Never dies: heals back up after a moment. */
  training?: boolean;
}
