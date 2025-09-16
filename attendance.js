// attendance.js
import { callOdoo } from "./odoo.js";

// attendance.js
function toOdooDatetime(date) {
  // Normalize device punch time to Pakistan (Asia/Karachi), then send UTC to Odoo
  const pktDate = new Date(
    new Date(date).toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  );
  return pktDate.toISOString().slice(0, 19).replace("T", " ");
}


export async function injectPunch(employeeId, ts, state) {
  const dt = toOdooDatetime(ts);
  console.log(`➡️ injectPunch START: employee=${employeeId}, ts=${dt}, state=${state}`);

  try {
    // 🔍 Check if there's an open attendance for this employee
    const openAtt = await callOdoo(
      "hr.attendance",
      "search_read",
      [[["employee_id", "=", employeeId], ["check_out", "=", false]]],
      { fields: ["id", "check_in", "check_out"] }
    );
    console.log("🔍 search_read result:", openAtt);

    if (state === 0) {
      // 🟢 Check-In logic
      if (openAtt.length > 0) {
        console.log(`⏭️ Skipping duplicate check-in for employee ${employeeId}`);
        return "skip-duplicate-checkin";
      }
      console.log(`➕ Creating new check_in for employee ${employeeId} → ${dt}`);
      const result = await callOdoo("hr.attendance", "create", [
        { employee_id: employeeId, check_in: dt },
      ]);
      console.log(`✅ Check-in created (attendance ID=${result})`);
      return result;

    } else if (state === 1) {
      // 🔴 Check-Out logic
      if (openAtt.length === 0) {
        console.log(`⏭️ Skipping checkout, no open session for employee ${employeeId}`);
        return "skip-no-open-session";
      }
      const attId = openAtt[0].id;
      console.log(`✏️ Writing check_out for attendance ID=${attId} → ${dt}`);
      const result = await callOdoo("hr.attendance", "write", [
        [attId],
        { check_out: dt },
      ]);
      console.log(`✅ Check-out updated for employee ${employeeId}`);
      return result;
    }

    console.warn(`⚠️ Unknown state=${state}, ignoring.`);
    return "skip-unknown-state";
  } catch (err) {
    console.error(`❌ injectPunch FAILED for employee ${employeeId}:`, err);
    return "error";
  }
}
