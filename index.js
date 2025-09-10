import ZKLib from "node-zklib";
import dotenv from "dotenv";
import { processPunch } from "./processPunch.js";
import { loadEmployeeMap, getOdooEmployee } from "./employeeMap.js";

dotenv.config();

const DEVICE_IP = process.env.DEVICE_IP || "192.168.18.150";
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT || "4370", 10);
const TIMEZONE = "Asia/Karachi";
const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);

// format datetime in both UTC + PKT
function formatTimes(date) {
  if (!date) return { utc: "N/A", pkt: "N/A" };
  const utc = new Date(date).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const pkt = new Date(date).toLocaleString("en-PK", {
    timeZone: TIMEZONE,
    hour12: true,
  });
  return { utc, pkt };
}

// get date-only in PKT
function dateOnlyPKT(date) {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: TIMEZONE })
  ).toISOString().slice(0, 10);
}

async function fetchLogs() {
  try {
    await zk.createSocket();
    console.log("✅ Connected to device");

    // 🔹 Check device time
    const before = await zk.getTime();
    const { utc: beforeUtc, pkt: beforePkt } = formatTimes(before);
    console.log(`📅 Device time BEFORE sync → UTC=${beforeUtc}, PKT=${beforePkt}`);

    const systemNow = new Date();
    const drift = (before.getTime() - systemNow.getTime()) / 1000;

    // 🔹 Always check drift dynamically
    if (Math.abs(drift) > 5) {
      await zk.setTime(systemNow); // write PKT/UTC depending on driver
      console.log(`⏰ Device time reset applied (drift=${drift.toFixed(3)}s)`);

      const after = await zk.getTime();
      const { utc: afterUtc, pkt: afterPkt } = formatTimes(after);
      console.log(`📅 Device time AFTER sync → UTC=${afterUtc}, PKT=${afterPkt}`);
    } else {
      console.log("⏰ Device time ok, no reset needed");
    }

    // 🔹 Fetch logs
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
        console.log(`⏭️ Skipping non-today log for ${emp.name} (${deviceId}) at ${punchTime}`);
        continue;
      }

      const { utc: rawUtc, pkt: rawPkt } = formatTimes(raw);

      console.log(`📝 DeviceID=${deviceId}, OdooID=${emp.id}, Name=${emp.name}, RawUTC=${rawUtc}, LocalPKT=${rawPkt}`);

      await processPunch(deviceId, punchTime);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await zk.disconnect().catch(() => {});
    console.log("🔌 Disconnected");
  }
}

async function streamLogs() {
  await fetchLogs();
  setTimeout(streamLogs, 10000); // check every 10s
}

(async () => {
  await loadEmployeeMap();
  streamLogs();
})();
