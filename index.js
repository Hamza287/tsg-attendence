import dotenv from "dotenv";
import Device from "./device.js";
import { syncEmployees } from "./sync.js";
import { injectPunch } from "./attendance.js";

dotenv.config();

// --- Helpers ---
function todayPK() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}
function fmtPK(dateObj) {
  if (!dateObj) return "Invalid";
  return dateObj.toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}
function datePK(dateObj) {
  return dateObj.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

function forcePK(date) {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  );
}


// --- Safe connect with backoff ---
async function safeConnect(device, retries = 0) {
  try {
    await device.connect();
    console.log("✅ Device connected successfully");
    return true;
  } catch (err) {
    console.warn(`⚠️ Device connect failed: ${err.message}`);
    const delay = Math.min(30000, 5000 * (retries + 1)); // 5s → 30s max
    console.log(`⏳ Retrying in ${delay / 1000}s...`);
    await new Promise((res) => setTimeout(res, delay));
    return safeConnect(device, retries + 1);
  }
}

// --- Main ---
(async () => {
  const employeeMap = await syncEmployees();
  const device = new Device(process.env.DEVICE_IP, process.env.DEVICE_PORT);

  await safeConnect(device);

  try {
    const info = await device.zk.getInfo();
    console.log("ℹ️ Device Info:", info);
  } catch (err) {
    console.warn("⚠️ Could not fetch device info:", err.message);
  }

  // 🔄 Keep syncing device time every 60s
  setInterval(() => {
    if (device.connected) {
      device.syncTime().catch(err => console.warn("⏭️ SyncTime skipped:", err.message));
    } else {
      console.log("⏭️ Device not connected, skipping syncTime");
    }
  }, 60 * 1000);

  // 🔄 Refresh logs every minute
  const refreshLogs = async () => {
    try {
      if (!device.connected) {
        console.log("⏭️ Device not ready, skipping fetchLogs");
        return;
      }

      const logs = await device.fetchAllLogs();
      const users = await device.getUsers();

      console.log("📥 Device Raw Logs (first 10):");
      console.dir(logs.slice(0, 10), { depth: null });

      console.log("📥 Device Users (first 10):");
      console.dir(users.slice(0, 10), { depth: null });

      // Build User Map
      const userMap = new Map();
      for (const [barcode, employees] of employeeMap.entries()) {
        const name = employees[0]?.name;
        if (barcode && name) userMap.set(String(barcode), name);
      }
      for (const u of users) {
        if (!userMap.has(String(u.userId))) {
          userMap.set(String(u.userId), u.name);
        }
      }

      console.log(`📡 Raw logs fetched: ${logs.length}`);

      const today = todayPK();
      const todaysLogs = logs.filter((log) => {
        const d = new Date(log.timestamp);
        return datePK(d) === today;
      });

      console.log(`📡 Filtered for today (${today}): ${todaysLogs.length}`);

      // --- Show daily table ---
      if (todaysLogs.length > 0) {
        const enriched = todaysLogs.map((log) => ({
          userId: log.userId,
          name: userMap.get(log.userId) || "Unknown",
          timestamp: fmtPK(forcePK(log.timestamp)), // ✅ force PKT
          type: log.type,
          state: log.state,
        }));

        const checkIns = enriched.filter((log) => log.state === 0);
        const checkOuts = enriched.filter((log) => log.state === 1);

        console.log("🟢 Today's Check-Ins:");
        console.table(checkIns);

        console.log("🔴 Today's Check-Outs:");
        console.table(checkOuts);
      }

      // --- Push logs to Odoo ---
      for (const log of todaysLogs) {
        const userId = String(log.userId);
        const empList = employeeMap.get(userId);

        if (!empList) {
          console.warn(`⚠️ Unknown employee punch ID=${userId}`);
          continue;
        }

        const emp = empList[0];
        const punchTime = forcePK(log.record_time || log.timestamp); // ✅ forced to PKT

        console.log(
          `📡 Syncing log → ${emp.name} (${emp.id}), Time: ${fmtPK(punchTime)}, state=${log.state}`
        );

        try {
          const res = await injectPunch(emp.id, punchTime, log.state);
          console.log(`📤 Attendance posted → Employee ${emp.name}, Odoo Response:`, res);
        } catch (err) {
          console.error("❌ Failed to post log to Odoo:", err.message);
          console.error(err.stack);
        }
      }
    } catch (err) {
      console.error("⚠️ Failed to fetch logs from device:", err.message);
      console.error(err.stack);
    }
  };

  await refreshLogs();
  setInterval(refreshLogs, 60 * 1000);

  // 📡 Realtime listener → inject into Odoo
  device.startRealtime(async (log) => {
    try {
      console.log("📡 Realtime RAW log:", log);

      const userId = String(log.userId);
      const empList = employeeMap.get(userId);
      if (!empList) {
        console.warn(`⚠️ Unknown employee punch ID=${userId}`);
        return;
      }

      const emp = empList[0];
      const punchTime = forcePK(log.record_time || log.timestamp); // ✅ fixed here too

      console.log(
        `📡 Punch matched → ${emp.name} (employee_id=${emp.id}), Time=${fmtPK(punchTime)}, state=${log.state}`
      );

      const res = await injectPunch(emp.id, punchTime, log.state);
      console.log(
        `📤 Attendance posted to Odoo → Employee ${emp.name}, Odoo Response:`,
        res
      );
    } catch (err) {
      console.error("❌ Failed to inject realtime punch:", err.message);
      console.error(err.stack);
    }
  });
})();
setInterval(() => {}, 1 << 30);