const dotenv = require("dotenv");
const { ZKLib } = require("node-zklib");
const { processPunch } = require("./processPunch.cjs");
const { buildEmployeeMap, getEmployees } = require("./sync.cjs");

dotenv.config();

const DEVICE_IP = process.env.DEVICE_IP;
const DEVICE_PORT = parseInt(process.env.DEVICE_PORT, 10);
const TIMEZONE = process.env.TIMEZONE || "Asia/Karachi";
const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 4000);

// Format UTC into string for Odoo (YYYY-MM-DD HH:mm:ss)
function formatUTC(date) {
  return new Date(date).toISOString().replace("T", " ").slice(0, 19);
}

// Get only date in PKT (YYYY-MM-DD)
function dateOnlyPKT(date) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// Convert device recordTime → PKT Date object
function toPKT(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: TIMEZONE }));
}

async function fetchLogs() {
  try {
    await zk.createSocket();
    console.log("ok tcp");
    console.log("✅ Connected to device");

    // check drift
    const before = await zk.getTime();
    const systemNow = new Date();
    const drift = (before.getTime() - systemNow.getTime()) / 1000;

    console.log(`⏱️ System Time (PKT): ${systemNow.toLocaleString("en-PK", { timeZone: TIMEZONE })}`);
    console.log(`⏱️ Device Time (PKT): ${before.toLocaleString("en-PK", { timeZone: TIMEZONE })}`);

    if (Math.abs(drift) > 5) {
      await zk.setTime(systemNow);
      console.log(`✅ Device time corrected (drift=${drift.toFixed(2)}s)`);
      const after = await zk.getTime();
      console.log(`⏱️ Device Time (after sync, PKT): ${after.toLocaleString("en-PK", { timeZone: TIMEZONE })}`);
    }

    // fetch logs
    const logs = await zk.getAttendances();

    // ✅ Only today’s punches
    const todayPKT = dateOnlyPKT(new Date());
    const punchesByEmp = {};

    for (const rec of logs.data) {
      if (!rec?.recordTime) continue;

      const rawUTC = new Date(rec.recordTime);
      const rawPKT = toPKT(rawUTC);

      const punchDate = dateOnlyPKT(rawPKT);
      if (punchDate !== todayPKT) continue; // ✅ strictly today only

      const deviceId = String(rec.deviceUserId).trim();
      const emps = getEmployees(deviceId);
      if (!emps || emps.length === 0) {
        console.log(`❌ No Odoo employee mapped for deviceUserId=${deviceId}`);
        continue;
      }

      if (!punchesByEmp[deviceId]) punchesByEmp[deviceId] = [];
      punchesByEmp[deviceId].push(formatUTC(rawPKT));
    }

    // summarize + push to Odoo
    console.log(`\n📌 Attendance Records (Today ${todayPKT})\n`);
    for (const [deviceId, punches] of Object.entries(punchesByEmp)) {
      punches.sort();
      const checkIn = punches[0];
      const checkOut = punches[punches.length - 1];

      const emps = getEmployees(deviceId);
      for (const emp of emps) {
        console.log(`👤 Employee: ${emp.name} (${emp.companyName}, DeviceID=${deviceId})`);
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
    }
  } catch (err) {
    console.error("❌ Fetch error:", err);
  } finally {
    await zk.disconnect().catch(() => {});
    console.log("🔌 Disconnected");
  }
}

async function streamLogs() {
  console.log("\n==============================");
  console.log(`🕒 Fetch cycle at (PKT): ${new Date().toLocaleString("en-PK", { timeZone: TIMEZONE })}`);
  console.log("==============================");
  await fetchLogs();
  setTimeout(streamLogs, 10000); // every 10 seconds
}

(async () => {
  await buildEmployeeMap();
  streamLogs();
})();
