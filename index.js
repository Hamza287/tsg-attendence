import ZKLib from "node-zklib";
import dotenv from "dotenv";
import { processPunch } from "./processPunch.js";
import { loadEmployeeMap, getOdooEmployee } from "./employeeMap.js";

dotenv.config();

const DEVICE_IP = process.env.DEVICE_IP || "192.168.18.150";
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT || "4370", 10);
const TIMEZONE = "Asia/Karachi";
const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);

// format datetime in PKT
function formatLocal(date) {
  if (!date) return "N/A";
  return new Date(date).toLocaleString("en-PK", {
    timeZone: TIMEZONE,
    hour12: true,
  });
}

// get date-only in PKT
function dateOnlyPKT(date) {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: TIMEZONE })
  )
    .toISOString()
    .slice(0, 10);
}

async function fetchLogs() {
  try {
    await zk.createSocket();
    console.log("✅ Connected to device");

    const before = await zk.getTime();
    console.log("📅 Device time before sync:", formatLocal(before));

    const now = new Date();
    await zk.setTime(now);
    console.log("⏰ Device time sync command sent");

    await zk.disconnect();
    await new Promise(r => setTimeout(r, 1500));
    await zk.createSocket();
    console.log("ok tcp");

    const after = await zk.getTime();
    console.log("📅 Device time after sync:", formatLocal(after));

    await zk.freeData().catch(() => {});

    const logs = await zk.getAttendances();
    const logCount = logs?.data?.length || 0;
    console.log(`📥 Got ${logCount} logs`);

    const systemToday = dateOnlyPKT(new Date());
    if (logCount === 0) return;

    for (const rec of logs.data) {
      if (!rec?.recordTime) continue;
      const raw = new Date(rec.recordTime);
      const deviceId = String(rec.deviceUserId).trim();

      const emp = getOdooEmployee(deviceId);
      if (!emp) {
        console.log(`❌ No Odoo employee mapped for deviceUserId=${deviceId}`);
        continue;
      }

      const punchTime = new Date(
        raw.toLocaleString("en-US", { timeZone: TIMEZONE })
      )
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      if (dateOnlyPKT(raw) !== systemToday) {
        console.log(`⏭️ Skipping old log for ${emp.name} (${deviceId}) at ${punchTime}`);
        continue;
      }

      console.log(
        `📝 DeviceID=${deviceId}, OdooID=${emp.id}, Name=${emp.name}, Raw=${raw.toISOString()}, Local=${formatLocal(raw)}`
      );

      // ✅ pass deviceId (string) and punchTime, NOT the whole emp object
      await processPunch(deviceId, punchTime);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await zk.disconnect();
    console.log("🔌 Disconnected");
  }
}

async function streamLogs() {
  await fetchLogs();
  setTimeout(streamLogs, 10000);
}

(async () => {
  await loadEmployeeMap();
  streamLogs();
})();
