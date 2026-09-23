// Builds the game's services and connects them through Game.hooks. One place, used by the server entry and by tests.
import { Game } from './game.js';
import { Stations } from './stations.js';
import { Social } from './social.js';
import { Crews } from './crews.js';
import { Venue } from './venue.js';
import { Director } from './director.js';
import { GroundControl } from './gc.js';
import { LiveOps } from './liveops.js';
import { Ceritera } from './ceritera.js';
import { Checkpoints } from './checkpoints.js';
import { Referrals } from './referrals.js';
import { BoothTeam } from './team.js';
import { Onboarding } from './onboard.js';
import { Signer } from './crypto.js';
import { PresenceStore, type Presence } from './presence.js';
import type { Db } from './db/types.js';
import type { LevelData } from '../shared/types.js';
import { FEATURES, type Features } from '../shared/rules.js';

export interface Services { game: Game; stations: Stations; checkpoints: Checkpoints; referrals: Referrals; team: BoothTeam; /** exhibitors the crew registers at the counter */ onboarding: Onboarding; social: Social; crews: Crews; venue: Venue; director: Director; gc: GroundControl; ops: LiveOps; signer: Signer; /** the library game's characters */ ceritera: Ceritera }

export function buildServices(o: { db: Db; secret: string; level: LevelData; publicOrigin: string; now?: () => number; /** defaults to in-memory; pass DbPresence on serverless */ presence?: Presence; /** switched-off systems to run anyway (their tests do) */ features?: Partial<Features> }): Services {
  const signer = new Signer(o.secret);
  const game = new Game(o.db, signer, o.presence ?? new PresenceStore(), o.level, o.publicOrigin, o.now, { ...FEATURES, ...o.features });
  const team = new BoothTeam(game);
  const stations = new Stations(game, team), social = new Social(game), crews = new Crews(game);
  const venue = new Venue(game), director = new Director(game, stations, venue), gc = new GroundControl(game, stations, venue), ops = new LiveOps(game, stations);
  const ceritera = new Ceritera(o.db, o.now), checkpoints = new Checkpoints(game, team);
  stations.onStatus = () => checkpoints.forget();
  const referrals = new Referrals(game, team), onboarding = new Onboarding(game, stations);
  stations.onFirstClaim = (id, ref) => referrals.record(id, ref);

  game.hooks = {
    companies: () => stations.ownerCompanies(),
    isOnsite: (id, t) => venue.isOnsite(id, t),
    isHidden: (id) => venue.isHidden(id),
    hiddenSet: () => venue.hidden,
    anchorOf: (id) => venue.anchorOf(id),
    onOnsiteProof: (id, stationId, t) => venue.anchor(id, stationId, t),
    stampMult: (stationId, t) => director.stampMult(stationId, t),
    afterStamp: async (o2) => [...(await director.afterStamp(o2)), ...(await gc.afterStamp(o2)), ...(await ops.afterStamp(o2))],
    afterPing: async (p) => { if (p.deck) await ops.steps(p.id, p.steps, p.movedM); return [...(p.deck ? await venue.walk(p.id, p.movedM, p.t) : []), ...(await director.afterPing(p))]; },
    onImplausible: (id, detail) => ops.speedFlag(id, detail),
    mission: checkpoints,
    teamOwner: (id) => team.ownerFor(id),
  };
  return { game, stations, social, crews, venue, director, gc, ops, signer, ceritera, checkpoints, referrals, team, onboarding };
}
