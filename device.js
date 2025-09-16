import ZktecoJs from "zkteco-js";
import { sanitizeLog } from "zkteco-js/src/helper/utils.js";
import EventEmitter from "events";

export default class Device extends EventEmitter {
  constructor(ip, port) {
    super();
    this.zk = new ZktecoJs(ip, port, 10000, 5200);
    this.connected = false;
    this.keepSyncing = false;
    this.realtimeActive = false;
  }

  async safeCommand(cmd, ...args) {
    try {
      const res = await this.zk[cmd](...args);
      if (!res || (res.data && !Array.isArray(res.data))) {
        console.warn(`⚠️ ${cmd} returned invalid data, skipping.`);
        return { data: [] };
      }
      return res;
    } catch (err) {
      if (err.message?.includes("TIMEOUT_ON_WRITING_MESSAGE")) {
        console.warn(`⚠️ Write timeout on ${cmd}, retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        return this.zk[cmd](...args);
      }
      console.warn(`⚠️ ${cmd} failed:`, err.message);
      return { data: [] };
    }
  }

async connect() {
  try {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }

    // 🔄 Wait a bit before trying connect (handle restart boot-up)
    await new Promise(res => setTimeout(res, 3000));

    await this.zk.createSocket(
      (err) => {
        console.error("⚠️ Socket error:", err?.message || err);
        this.connected = false;
      },
      () => {
        console.warn("⚡ Socket closed");
        this.connected = false;
      }
    );

    const ok = await this.zk.connect();
    if (!ok) throw new Error("CMD_CONNECT failed (no reply from device)");

    // 🔎 Wait for device ready
    let ready = false;
    for (let i = 0; i < 5 && !ready; i++) {
      try {
        await this.zk.getTime();
        ready = true;
      } catch {
        console.log("⏳ Device not ready yet, retrying in 5s...");
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    if (!ready) throw new Error("Device not ready after reboot");

    this.connected = true;
    await this.syncTime();

    if (!this.keepSyncing) {
      this.keepSyncing = true;
      this.startAutoTimeSync();
    }

    console.log(`✅ Connected to device ${this.zk.ip}`);
  } catch (err) {
    console.error("❌ Device connect failed:", err?.message || err);
    this.connected = false;
    throw err; // so safeConnect backoff in index.js can retry
  }
}


  async safeGetTime() {
    try {
      const t = await this.zk.getTime();
      if (!t) return null;
      const dt = new Date(t);
      return isNaN(dt) ? null : t;
    } catch {
      console.warn("⚠️ getTime failed (device may be empty/reset).");
      return null;
    }
  }

  async syncTime() {
    try {
      const pkNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" })
      );

      await this.zk.setTime(pkNow);
      const afterRaw = await this.safeGetTime();

      const fmtPK = (d) =>
        d
          ? new Date(d).toLocaleString("en-PK", {
              timeZone: "Asia/Karachi",
              hour12: true,
            })
          : "N/A";

      console.log("🕒 Device time sync check:");
      console.log("   After: ", fmtPK(afterRaw));
      console.log("   PK Now:", fmtPK(pkNow));
    } catch (err) {
      console.error("⚠️ Time sync failed:", err.message);
    }
  }

startAutoTimeSync() {
  if (this.syncTimer) clearInterval(this.syncTimer);
  this.syncTimer = setInterval(async () => {
    if (!this.connected) {
      console.log("🔄 Device disconnected, waiting before reconnect...");
      await new Promise(res => setTimeout(res, 5000)); // ⏳ small delay
      try {
        await this.connect();
        if (this.connected && this.realtimeActive) {
          console.log("🔄 Restoring realtime listener after reconnect...");
          this.startRealtime(this.realtimeCallback);
        }
      } catch (err) {
        console.warn("⚠️ Reconnect attempt failed:", err.message);
      }
    } else {
      await this.syncTime();
    }
  }, 15000); // every 15s (reduce hammering)
}

  async fetchAllLogs() {
    if (!this.connected) await this.connect();
    try {
      const res = await this.safeCommand("getAttendances");
      if (!res?.data) return [];

      console.log(`📥 Raw logs from device: ${res.data.length}`);
      return res.data
        .map((raw) => {
          const userId =
            raw.userId ||
            raw.user_id ||
            raw.uid ||
            raw.pin ||
            raw.userid ||
            null;

          const tsRaw =
            raw.record_time ||
            raw.timestamp ||
            raw.time ||
            raw.checktime ||
            null;

          const ts = tsRaw ? new Date(tsRaw) : null;
          if (!userId || !ts || isNaN(ts)) return null;

          return {
            userId: String(userId).trim(),
            timestamp: ts.toISOString(),
            type: raw.type ?? "-",
            state: raw.state ?? "-",
          };
        })
        .filter(Boolean);
    } catch (err) {
      console.warn("⚠️ Fetch logs failed:", err.message);
      return [];
    }
  }

  async getUsers() {
    if (!this.connected) await this.connect();
    try {
      const res = await this.zk.getUsers();
      return res?.data?.map((u) => ({
        userId: String(u.userId || u.uid || u.pin).trim(),
        name: u.name?.trim() || `User-${u.uid}`,
      })) || [];
    } catch (err) {
      console.warn("⚠️ Fetch users failed:", err.message);
      return [];
    }
  }

  async startRealtime(callback) {
    if (!this.connected) await this.connect();
    try {
      this.realtimeActive = true;
      this.realtimeCallback = callback;

      await this.zk.getRealTimeLogs((log) => {
        try {
          const clean = sanitizeLog(log);
          if (clean) {
            console.log("📡 Raw realtime log:", log);
            callback(clean);
          }
        } catch (e) {
          console.error("⚠️ Failed to sanitize realtime log:", e.message);
        }
      });

      console.log("📡 Realtime listener started");
    } catch (err) {
      console.error("⚠️ Realtime failed:", err.message);
      this.realtimeActive = false;
    }
  }
}
