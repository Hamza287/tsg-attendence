// processPunch.js
import { callOdoo } from "./odoo.js";
import { getOdooEmployee } from "./employeeMap.js";

const TIMEZONE = "Asia/Karachi";

function dateOnlyPKT(date) {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: TIMEZONE })
  )
    .toISOString()
    .slice(0, 10);
}

export async function processPunch(deviceId, punchTime) {
  const emp = getOdooEmployee(deviceId);
  if (!emp) {
    console.log(`❌ No Odoo employee mapped for deviceUserId=${deviceId}`);
    return;
  }

  const odooEmpId = emp.id;
  const empName = emp.name;

  // restrict to today only
  const today = dateOnlyPKT(new Date());
  if (dateOnlyPKT(punchTime) !== today) {
    console.log(`⏭️ Ignored non-today punch for ${empName} at ${punchTime}`);
    return;
  }

  const punch = new Date(punchTime);

  // fetch last attendance for employee
  const lastRecs = await callOdoo("hr.attendance", "search_read", [
    [["employee_id", "=", odooEmpId]],
    ["id", "check_in", "check_out"],
    0,
    1,
    "id desc",
  ]);

  if (!lastRecs || lastRecs.length === 0) {
    // no record → first check-in
    try {
      const newId = await callOdoo("hr.attendance", "create", [
        { employee_id: odooEmpId, check_in: punchTime },
      ]);
      console.log(`✅ First check-in for ${empName} at ${punchTime} (rec ${newId})`);
    } catch (err) {
      console.error(`❌ Failed to create first check-in for ${empName}:`, err.message);
    }
    return;
  }

  const rec = lastRecs[0];
  const lastCheckIn = rec.check_in ? new Date(rec.check_in) : null;
  const lastCheckOut = rec.check_out ? new Date(rec.check_out) : null;

  try {
    if (lastCheckIn && !lastCheckOut) {
      // open record → must close it first
      if (punch.getTime() === lastCheckIn.getTime()) {
        console.log(`⏩ Duplicate punch ignored for ${empName} at ${punchTime}`);
        return;
      }
      if (punch > lastCheckIn) {
        await callOdoo("hr.attendance", "write", [
          [rec.id],
          { check_out: punchTime },
        ]);
        console.log(`✅ Checkout for ${empName} at ${punchTime} (rec ${rec.id})`);
      } else {
        console.log(`⏩ Ignored backdated punch for ${empName} at ${punchTime}`);
      }
      return;
    }

    if (lastCheckOut && punch > lastCheckOut) {
      // record closed → new check-in
      const newId = await callOdoo("hr.attendance", "create", [
        { employee_id: odooEmpId, check_in: punchTime },
      ]);
      console.log(`✅ New check-in for ${empName} at ${punchTime} (rec ${newId})`);
      return;
    }

    if (lastCheckOut && punch.getTime() === lastCheckOut.getTime()) {
      console.log(`⏩ Duplicate checkout ignored for ${empName} at ${punchTime}`);
      return;
    }

    console.log(`⏩ Ignored out-of-order/backdated punch for ${empName} at ${punchTime}`);
  } catch (err) {
    console.error(`❌ Odoo RPC failed for ${empName} at ${punchTime}:`, err.message);
  }
}
