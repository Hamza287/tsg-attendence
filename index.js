// index.js
import ZKLib from "node-zklib";
import dotenv from "dotenv";
import { processPunch } from "./processPunch.js";
import { buildEmployeeMap, getEmployee } from "./sync.js";

dotenv.config();

const DEVICE_IP = process.env.DEVICE_IP;
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT, 10);
const TIMEZONE = process.env.TIMEZONE || "Asia/Karachi";
const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);

function formatUTC(date) {
  return new Date(date).toISOString().replace("T", " ").slice(0, 19);
}

function dateOnlyPKT(date) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

async function fetchLogs() {
  try {
    await zk.createSocket();
    console.log("✅ Connected to device");

    // sync device time if drift > 5s
    const before = await zk.getTime();
    const systemNow = new Date();
    const drift = (before.getTime() - systemNow.getTime()) / 1000;
    if (Math.abs(drift) > 5) {
      await zk.setTime(systemNow);
      console.log(`⏰ Device time reset (drift=${drift.toFixed(3)}s)`);
    }

    // fetch logs
    const logs = await zk.getAttendances();
    const today = dateOnlyPKT(new Date());
    const punchesByEmp = {};

    for (const rec of logs.data) {
      if (!rec?.recordTime) continue;
      const raw = new Date(rec.recordTime);
      if (dateOnlyPKT(raw) !== today) continue;

      const deviceId = String(rec.deviceUserId).trim();
      const emp = getEmployee(deviceId);
      if (!emp) continue;

      if (!punchesByEmp[deviceId]) punchesByEmp[deviceId] = [];
      punchesByEmp[deviceId].push(formatUTC(raw));
    }

    // summarize per employee
    console.log("\n📌 Today's Attendance\n");
    for (const [deviceId, punches] of Object.entries(punchesByEmp)) {
      punches.sort(); // ensure order
      const emp = getEmployee(deviceId);
      const checkIn = punches[0];
      const checkOut = punches[punches.length - 1];

      console.log(`👤 Employee: ${emp.name} (DeviceID=${deviceId})`);
      console.log(`   Check-In  → ${checkIn}`);
      if (checkOut !== checkIn) {
        console.log(`   Check-Out → ${checkOut}`);
        await processPunch(deviceId, [checkIn, checkOut], emp);
      } else {
        console.log("   Check-Out → —");
        await processPunch(deviceId, [checkIn], emp);
      }
      console.log("");
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
  setTimeout(streamLogs, 10000);
}

(async () => {
  await buildEmployeeMap();
  streamLogs();
})();
