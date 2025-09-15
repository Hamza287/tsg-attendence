// processPunch.js
import { callOdoo } from "./odoo.js";

export async function processPunch(deviceId, punches, emp) {
  try {
    if (!emp) {
      console.log(`❌ No Odoo employee mapped for deviceUserId=${deviceId}`);
      return;
    }

    if (punches.length === 0) return;

    const checkIn = punches[0];
    const checkOut = punches[punches.length - 1];

    // rule: if IN and OUT are same, treat it only as check-in
    const finalCheckOut = checkIn !== checkOut ? checkOut : null;

    const today = new Date().toISOString().slice(0, 10);

    // find today's attendance
    const existing = await callOdoo("hr.attendance", "search_read", [
      [["employee_id", "=", emp.id], ["check_in", ">=", today]],
      ["id", "check_in", "check_out"]
    ]);

    if (existing.length === 0) {
      // create new record
      await callOdoo("hr.attendance", "create", [[{
        employee_id: emp.id,
        check_in: checkIn,
        ...(finalCheckOut ? { check_out: finalCheckOut } : {})
      }]]);
      console.log(`✅ Created attendance for ${emp.name}: IN=${checkIn} OUT=${finalCheckOut || "—"}`);
    } else {
      const att = existing[0];
      const vals = {};

      if (!att.check_in || checkIn < att.check_in) vals.check_in = checkIn;
      if (finalCheckOut && (!att.check_out || finalCheckOut > att.check_out)) {
        vals.check_out = finalCheckOut;
      }

      if (Object.keys(vals).length > 0) {
        await callOdoo("hr.attendance", "write", [[att.id], vals]);
        console.log(`✅ Updated attendance for ${emp.name}:`, vals);
      } else {
        console.log(`⏭️ No update needed for ${emp.name}`);
      }
    }
  } catch (err) {
    console.error(`❌ processPunch error:`, err.message);
  }
}
