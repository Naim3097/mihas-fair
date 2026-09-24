import type { MissionTemplate, Pose, Role, ShareField, StampProof } from './rules.js';
import type { AvatarSpec } from './avatar.js';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Booth { id: string; hall: number; x: number; y: number; name: string; /** organiser's category, when the exhibitor is on the official list */ sector?: string; /** exhibition level: 1, 2 or 3 */ deck: number }
export interface Area extends Rect { id: string; name: string; h: number; kind: 'pad' | 'zone'; deck: number }
/** One exhibition level as a platform in the shared plan space. */
export interface DeckInfo extends Rect { level: number; boothD: number; label: string }
export interface HallRect extends Rect { id: number; deck: number }
/** Lifts with the same id are the same shaft on different decks: stepping on one offers the others. */
export interface Lift { id: string; deck: number; x: number; y: number; label: string }
export interface Gate { id: string; name: string; x: number; y: number; axis: 'x' | 'y' }
export interface Spawn { x: number; y: number; label: string; gate: string }

export interface LevelData {
  level: number;
  source: string;
  booth: { w: number; d: number; h: number };
  hall: Rect;
  walkable: Rect[];
  walls: Rect[];
  gates: Gate[];
  spawns: Record<'short' | 'epic', Spawn>;
  hero: { id: string; x: number; y: number; open: 'N' | 'E' | 'S' | 'W'; dock: { x: number; y: number } };
  areas: Area[];
  booths: Booth[];
  decks: DeckInfo[];
  halls: HallRect[];
  lifts: Lift[];
}

/** What the client knows about the signed-in player. Never contains other people's personal data. */
export interface Me {
  id: string;
  /** The name other players see: "Visitor 4821" until they have a card, then "Aisyah R.". */
  callsign: string;
  /** visitor | exhibitor — null until they choose on the first screen */
  cls: Role | null;
  /** points */
  xp: number;
  stamps: string[];
  passport: PassportView | null;
  docked: boolean;
  ticket: { token: string; code: string } | null;
  avatar: AvatarSpec;
  sharePrefs: ShareField[];
  links: number;
  /** Stations this player has shared a Passport with, and those where a host verified the contact. */
  shared: string[];
  verified: string[];
  /** Booths whose Mission X QR (printed or live) this player has scanned. */
  scanned: string[];
  /** Station ids this player hosts. */
  hosting: string[];
  /** Verifiably at the venue right now (venue check or on-site scan in the last 30 min). */
  onsite: boolean;
  hidden: boolean;
  /** Last on-site scan: where the person really stood. */
  anchor: { stationId: string; at: number } | null;
  /** On a colleague's booth team (they work that booth; only its owner adds booths or manages the team). */
  teamMember: boolean;
  /** The checkpoint mission: started at Lean X Digital, then the exhibitor booths this player was given. */
  mission: CheckpointMission;
}

export interface CheckpointMission { started: boolean; target: number; checkpoints: { stationId: string; company: string; done: boolean }[] }
/** A visitor who scanned an exhibitor's QR, as that exhibitor's dashboard lists them. */
/** A company's booth team, as its dashboard shows it. `link` only for the owner, who manages the team. */
export interface BoothTeamView { owner: boolean; company: string; ownerName: string; link: string | null; members: { key: string; name: string; phone: string; email: string; joinedAt: number }[] }
/** What someone opening a team invitation is joining. */
export interface BoothTeamPeek { company: string; booths: string[]; ownerName: string }
/** An exhibitor's invitations, as their dashboard shows them. */
export interface ReferralView { code: string; url: string; points: number; joined: { company: string; booth: string; approved: boolean }[] }
/** The crew's view: who has brought in the most exhibitors. */
export interface ReferralRow { name: string; company: string; phone: string; email: string; booths: string; approved: number; pending: number; points: number }
export interface BoothScan { name: string; phone: string; email: string; company: string; at: number; checkpoint: boolean }
/** The crew registering an exhibitor at the counter: their card and their booth in one go. */
export interface CrewRegisterInput { stationId: string; company: string; name: string; phone: string; email: string; role?: string; offer?: string; link?: string; /** the exhibitor agreed to the privacy notice at the counter */ consent: boolean }
/** A crew-registered booth and the link that hands its account to the exhibitor. */
export interface HandoffRow { stationId: string; company: string; name: string; phone: string; email: string; code: string; url: string; /** the booth-team invitation: colleagues join on their own phones */ teamUrl: string; createdAt: number; taken: boolean; status: StationStatus | 'released' }
/** What someone opening a hand-over link is about to take over. */
export interface HandoffPeek { stationId: string; company: string; name: string; taken: boolean }

export interface PassportInput {
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
  showContact: boolean;
  consentMarketing: boolean;
  consentNotice: boolean;
}

export interface PassportView {
  slug: string;
  name: string;
  company: string;
  role: string;
  url: string;
}

export interface XpEvent { action: string; xp: number; target?: string; note?: string }

export interface ApiOk<T> { ok: true; data: T; me?: Me; events?: XpEvent[] }
export interface ApiErr { ok: false; error: string; code: string }
export type ApiResult<T> = ApiOk<T> | ApiErr;

export interface StampRequest { stationId: string; proof: StampProof; beacon?: string; code?: string }
/** A kit from the Playground worn in the fair; Boots are the absence of one. */
export type PresenceKit = 'skates' | 'jetpack';
export interface PresencePing { x: number; y: number; h: number; /** sitting, waving, … — shown to others, nothing more */ pose?: Pose; deck?: boolean; sigma?: number; /** steps counted since the last ping (deck mode) */ steps?: number;
  /** the kit worn, so others see it on the body; the server strips one the player does not own */ kit?: PresenceKit; /** metres above the floor, on a jetpack; the server clamps it to the ceiling */ z?: number }
export interface Hologram { id: string; callsign: string; cls: Role | null; /** an exhibitor's company, for the label over their head */ company?: string; x: number; y: number; h: number; av: string; pose?: Pose; /** really there, following real steps */ deck: boolean; /** position uncertainty in metres */ sigma: number;
  /** the kit on their body, if any */ kit?: PresenceKit; /** metres above the floor: 0 on the ground, up to the ceiling on a jetpack */ z: number }

export interface CrewTicketView { callsign: string; name: string; company: string; role: string; phone: string; email: string; alreadyDocked: boolean; /** every booth QR they scanned, latest first */ scans: { stationId: string; company: string; at: number }[]; /** checkpoints scanned, of how many */ checkpoints?: { started: boolean; done: number; target: number } }

/* ---------------- M2 ---------------- */

/** prepared: the crew put the company, logo or photo up before the exhibitor registered; the booth is still free to bring online. */
export type StationStatus = 'prepared' | 'pending' | 'approved' | 'revoked';
/** Public view of a claimed station — what every player may see. */
export interface StationView { id: string; company: string; offer: string; link: string; color: number; status: StationStatus; hosted: boolean; level: number; /** image URLs once the crew has approved the booth */ logo: string | null; photo: string | null }
export interface StationClaimInput { stationId: string; company: string; offer: string; link: string; color: number; /** referral code of the exhibitor who invited them */ ref?: string }

export interface HostCode { stationId: string; url: string; digits: string; expiresInMs: number }
export interface HostStation extends StationView { sxp: number; stamps: number; shares: number; verifiedContacts: number; hostMinutes: number; /** visitors who scanned the booth's QR */ scans: number }
export interface HostLead { callsign: string; name: string; company: string; role: string; phone: string; email: string; verified: boolean; at: number }

export interface SharedCard { name?: string; company?: string; role?: string; phone?: string; email?: string }
export interface LinkCode { code: string; url: string; expiresInMs: number }
export interface LinkPeek { callsign: string; cls: Role | null; shares: ShareField[]; alreadyLinked: boolean }
export interface Contact {
  kind: 'person' | 'station';
  key: string;
  title: string;
  sub: string;
  card: SharedCard;
  link?: string;
  at: number;
  note: string;
  verified?: boolean;
}

export interface SectorState {
  hall: number;
  holder: Role | null;
  /** Live, decayed and underdog-normalised scores since the last tick. */
  scores: Record<Role, number>;
}
export interface SectorsView { sectors: SectorState[]; nextTickInMs: number; crewSizes: Record<Role, number> }

export interface CrewStationRow extends StationView { visits: number; ownerCallsign: string; ownerName: string; ownerCompany: string; claimedAt: number }

/* ---------------- M3 ---------------- */

export interface MissionView {
  id: string;
  template: MissionTemplate;
  title: string;
  brief: string;
  xp: number;
  state: 'offered' | 'active' | 'done' | 'expired' | 'abandoned';
  /** e.g. "1 / 3" */
  progress: string;
  /** Where the trail should lead next, if the mission has a place. */
  target: { x: number; y: number; label: string; stationId?: string } | null;
  expiresInMs: number;
}
export interface StormView { zone: string; label: string; x0: number; y0: number; x1: number; y1: number; endsInMs: number; mult: number }
export interface MissionsView { active: MissionView | null; offers: MissionView[]; storm: StormView | null; darkVisitors: Record<string, number>; drop?: DailyDrop | null }

export type GcRole = 'ground' | 'astro';
export interface GcView {
  state: 'idle' | 'queued' | 'active' | 'done' | 'expired';
  role: GcRole | null;
  partner: string | null;
  /** Ground Control alone sees the target; the astronaut sees only waypoints and must be talked in. */
  target: { x: number; y: number; label: string; stationId: string } | null;
  partnerPos: { x: number; y: number } | null;
  waypoints: { x: number; y: number }[];
  expiresInMs: number;
  xp: number;
}

/* ---------------- M4 ---------------- */

export type FlagKey = (typeof import('./rules.js').FLAG_KEYS)[number];
export interface TrustView { score: number; trusted: boolean; parts: { boothQr: boolean; hostCode: boolean; plausible: boolean; steps: boolean; human: boolean } }
export type BoardKind = 'xp' | 'today' | 'explorer' | 'connector' | 'stations' | 'companies';
export interface BoardRow { kind: 'player' | 'station' | 'team'; title: string; sub: string; value: number; unit: string; cls?: Role | null; /** passes the trust bar (players) / verified exhibitor (teams) */ trusted?: boolean; you?: boolean }
export interface ReviewRow { callsign: string; name: string; company: string; value: number; unit: string; xp: number; trust: TrustView; flags: number; banned: boolean; mix: string }
export interface TeamView { name: string; owner: boolean; code: string | null; members: { callsign: string; xp: number; you?: boolean }[]; score: number }
/** What is special today. */
export interface TodayView { drop: DailyDrop | null; /** people in the game right now */ online: number; /** the crew's switches the pages act on: Orbit 2 and the stars for exhibitors met (sky), Warp */ switches?: Switches }
export interface Switches { sky: boolean; warp: boolean }
export interface DailyDrop { title: string; stationId: string; label: string; x: number; y: number; bonus: number; done: boolean }
/** Everything the booth's big screen shows. Positions only — no names, no callsigns. */
export interface ScreenView {
  dots: { x: number; y: number; cls: Role | null; deck: boolean }[];
  online: number;
  totals: { players: number; passports: number; docked: number; stamps: number; links: number; stations: number };
  board: BoardRow[]; /** most visited booths */ booths: BoardRow[]; sectors: SectorsView; storm: StormView | null; drop: DailyDrop | null; joinUrl: string;
}

/* ---------------- the Playground ---------------- */

export type PlaygroundGear = 'boots' | 'skates' | 'jetpack';
export interface PlaygroundBest { score: number; gear: PlaygroundGear; at: number }
/** What outlasts a run on the server: the balance, the gear bought, the gear last used, the best finished run. */
/** The course as it was (1), or awake (2): its tiles move, by a seed each run; each has its own best and boards. */
export type PlaygroundOrbit = 1 | 2;
/** `best`: Orbit 1's; `best2`: Orbit 2's. */
export interface PlaygroundMe { stars: number; unlocks: PlaygroundGear[]; gear: PlaygroundGear; best: PlaygroundBest | null; best2: PlaygroundBest | null; runsToday: number }
/** A run against its token; `partial` is the part a tab going away sends, which leaves the token open for the rest. */
export interface PlaygroundRunInput { token: string; gear: PlaygroundGear; score: number; stars: number; comboMax: number; seconds: number; finished: boolean; partial?: boolean; /** 1 when absent */ orbit?: PlaygroundOrbit; /** Orbit 2's seed */ seed?: number }
export interface PlaygroundRunResult extends PlaygroundMe { newBest: boolean }
export interface PlaygroundBoardRow { rank: number; name: string; gear: PlaygroundGear; score: number; at: number; you?: boolean }
