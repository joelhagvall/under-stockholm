import { AdditiveBlending, Group, MeshBasicMaterial, type Scene, type Vector3 } from 'three';
import { drawFigure, figureMesh, hideFigure, paintFigure } from './figures';
import { noise3 } from './gfx/noise';

/**
 * Other players, seen as faint silhouettes. Positions travel through a tiny
 * relay (server/ghosts.ts) and nothing else: no names, no chat. Players riding
 * a train send their place inside it, so on every screen they ride along
 * smoothly, because all trains follow the same clock.
 *
 * The relay is on the game's own origin (see `relay.ts`); the protocol and
 * its limits are in `server/pose.ts`.
 */

const MAX = 32;
/** Twice a second, as the relay sends snapshots: incoming messages are what the hub is billed for. */
const SEND_EVERY = 0.5;
/**
 * An unchanged pose still goes this often, in real milliseconds, so the relay does not take a player standing still
 * for gone (IDLE_MS in `server/pose.ts`). Not game time, which a slow tab's capped frames run far behind.
 */
const KEEP_ALIVE_MS = 5000;
/**
 * A player with nobody else this near (meters, as the last snapshot placed them) sends only the keep-alive: most play
 * alone, and the hub is billed for every message. Wide enough that two trains closing on each other in the five
 * seconds between keep-alives are still far out of sight when both start sending twice a second again.
 */
const NEAR = 500;
/** Others are drawn this far behind, so there is nearly always a snapshot on each side to blend between. */
const DELAY = 0.8;
/** Close codes from the relay (`server/pose.ts`): the day's budget is spent, or it is full. */
const CLOSE_SPENT = 4000;
const CLOSE_FULL = 4001;

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Train index the player rides, or -1. */
  ride: number;
  lx: number;
  lz: number;
}

interface Remote {
  id: number;
  samples: Array<{ at: number; pose: GhostPose }>;
  slot: number;
}

export { ghostUrl } from './relay';

export class Ghosts {
  readonly group = new Group();
  private readonly mesh = figureMesh(MAX, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, blending: AdditiveBlending }));
  private readonly remotes = new Map<number, Remote>();
  private socket: WebSocket | null = null;
  private retry = 2;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Closed by the relay for saying nothing (paused, or the tab hidden): opened again on the next update. */
  private dozing = false;
  private sendTimer = 0;
  private clock = 0;
  private lastSent = '';
  private lastSentAt = 0;
  private lastPose: number[] | null = null;
  /** Whether the last snapshot had anyone within NEAR, or on the train you ride. */
  private company = false;
  private enabled = false;
  /** Server clock minus local clock, in seconds, once known. */
  clockOffset: number | null = null;
  /** Players connected, including you; null while unknown. */
  count: number | null = null;
  onCount: ((count: number | null) => void) | null = null;

  constructor(scene: Scene, private readonly url: string | null) {
    this.group.name = 'ghosts';
    this.mesh.renderOrder = 2;
    for (let i = 0; i < MAX; i++) {
      paintFigure(this.mesh, i, { coat: 0x9fc3ff, torso: 0xb4d0ff, skin: 0xd6e6ff, hair: 0x8fb2ee, bag: 0x7f9fd6, trousers: 0x7f9fd6, shoes: 0x6f8cc0, prop: 0x9fc3ff });
      hideFigure(this.mesh, i);
    }
    this.group.add(this.mesh);
    scene.add(this.group);
  }

  get available(): boolean {
    return this.url !== null;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.group.visible = enabled;
    this.dozing = false;
    if (enabled) this.connect();
    else this.disconnect();
  }

  private connect(): void {
    if (!this.url || this.socket || !this.enabled) return;
    let socket: WebSocket;
    try { socket = new WebSocket(this.url); } catch { this.scheduleRetry(); return; }
    this.socket = socket;
    const sentAt = Date.now();
    socket.onmessage = (event) => {
      let data: { t?: string; now?: number; n?: number; p?: number[][] };
      try { data = JSON.parse(String(event.data)); } catch { return; }
      if (data.t === 'hello' && typeof data.now === 'number') {
        // Half the round trip is a fair guess for the server's message age.
        const latency = (Date.now() - sentAt) / 2;
        this.clockOffset = (data.now + latency - Date.now()) / 1000;
        this.retry = 2;
      }
      if (data.t === 's' && Array.isArray(data.p)) {
        this.count = typeof data.n === 'number' ? data.n : null;
        this.onCount?.(this.count);
        const seen = new Set<number>();
        for (const row of data.p) {
          if (!Array.isArray(row) || row.length !== 8) continue;
          const [id, x, y, z, yaw, ride, lx, lz] = row;
          seen.add(id);
          let remote = this.remotes.get(id);
          if (!remote) {
            const used = new Set([...this.remotes.values()].map((r) => r.slot));
            let slot = 0;
            while (used.has(slot) && slot < MAX) slot++;
            if (slot >= MAX) continue;
            remote = { id, samples: [], slot };
            this.remotes.set(id, remote);
          }
          remote.samples.push({ at: this.clock, pose: { x, y, z, yaw, ride, lx, lz } });
          if (remote.samples.length > 4) remote.samples.shift();
        }
        for (const [id, remote] of this.remotes) if (!seen.has(id)) { hideFigure(this.mesh, remote.slot); this.remotes.delete(id); }
        this.company = this.near(data.p);
      }
    };
    socket.onclose = (event) => {
      this.socket = null;
      // Spent for the day: back after midnight UTC. Full: a minute or two, not the usual quick retry.
      if (event.code === CLOSE_SPENT) this.retry = Math.max(60, (86_400_000 - (Date.now() % 86_400_000)) / 1000 + 60);
      else if (event.code === CLOSE_FULL) this.retry = Math.max(this.retry, 90);
      this.count = null;
      this.onCount?.(null);
      for (const remote of this.remotes.values()) hideFigure(this.mesh, remote.slot);
      this.remotes.clear();
      this.company = false;
      // Idle means no frames ran to send a pose: waiting for the next one, rather than a retry, keeps a paused game
      // or a hidden tab from opening a new socket every minute.
      if (event.reason === 'idle') this.dozing = true;
      else this.scheduleRetry();
    };
    socket.onerror = () => socket.close();
  }

  /** Whether any row of a snapshot is within NEAR of the pose last sent, or rides the same train. */
  private near(rows: number[][]): boolean {
    const me = this.lastPose;
    if (!me) return true;
    return rows.some((row) => Array.isArray(row) && row.length === 8
      && ((me[4] >= 0 && row[5] === me[4]) || Math.hypot(row[1] - me[0], row[3] - me[2]) < NEAR));
  }

  private scheduleRetry(): void {
    if (!this.enabled || this.retryTimer) return;
    // Spread out, so a restarted or full relay is not hit by every player in the same second.
    // A long wait is never cut short, only spread over a couple of minutes after it.
    const wait = this.retry > 30 ? this.retry + Math.random() * 120 : this.retry * (0.5 + Math.random());
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.connect(); }, wait * 1000);
    this.retry = Math.min(30, this.retry * 2);
  }

  private disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  /**
   * @param trainAt current position of train `ride` on this client, for riders
   */
  update(dt: number, me: GhostPose, listener: Vector3, trainAt: (ride: number) => { x: number; z: number } | null): void {
    this.clock += dt;
    this.sendTimer -= dt;
    if (this.dozing) { this.dozing = false; this.connect(); }
    const now = performance.now();
    if (this.socket?.readyState === WebSocket.OPEN && (this.sendTimer <= 0 || now - this.lastSentAt >= KEEP_ALIVE_MS)) {
      this.sendTimer = SEND_EVERY;
      // The player's yaw runs on with every turn; the relay takes only a few turns' worth, so it goes as an angle.
      const yaw = Math.atan2(Math.sin(me.yaw), Math.cos(me.yaw));
      const pose = [me.x, me.y, me.z, yaw, me.ride, me.lx, me.lz].map((v) => Math.round(v * 100) / 100);
      const message = JSON.stringify({ t: 'p', p: pose });
      if ((this.company && message !== this.lastSent) || now - this.lastSentAt >= KEEP_ALIVE_MS) {
        this.socket.send(message);
        this.lastSent = message;
        this.lastPose = pose;
        this.lastSentAt = now;
      }
    }
    this.mesh.visible = this.remotes.size > 0;
    if (!this.enabled || !this.mesh.visible) return;
    const at = this.clock - DELAY;
    const material = this.mesh.material as MeshBasicMaterial;
    material.opacity = 0.16 + 0.07 * noise3(this.clock * 0.9, 0, 0, 3);
    for (const remote of this.remotes.values()) {
      const s = remote.samples;
      if (!s.length) continue;
      let a = s[0], b = s[s.length - 1];
      for (let i = 0; i < s.length - 1; i++) if (s[i].at <= at && s[i + 1].at >= at) { a = s[i]; b = s[i + 1]; break; }
      const span = b.at - a.at;
      const k = span > 0 ? Math.min(1, Math.max(0, (at - a.at) / span)) : 1;
      const mix = (p: number, q: number) => p + (q - p) * k;
      let x: number, z: number;
      const riding = b.pose.ride >= 0 && a.pose.ride === b.pose.ride ? trainAt(b.pose.ride) : null;
      if (riding) { x = riding.x + mix(a.pose.lx, b.pose.lx); z = riding.z + mix(a.pose.lz, b.pose.lz); }
      else { x = mix(a.pose.x, b.pose.x); z = mix(a.pose.z, b.pose.z); }
      const y = mix(a.pose.y, b.pose.y);
      const moving = Math.hypot(b.pose.x - a.pose.x, b.pose.z - a.pose.z) / Math.max(0.05, span) > 0.4 && !riding;
      // Fade out when you walk into one.
      const near = Math.hypot(x - listener.x, z - listener.z);
      if (near < 0.7) { hideFigure(this.mesh, remote.slot); continue; }
      let yaw = b.pose.yaw;
      if (Math.abs(b.pose.yaw - a.pose.yaw) < Math.PI) yaw = mix(a.pose.yaw, b.pose.yaw);
      // Player yaw looks along -z; figures face +z.
      drawFigure(this.mesh, remote.slot, { x, y, z, yaw: yaw + Math.PI, walking: moving }, this.clock + remote.id);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
