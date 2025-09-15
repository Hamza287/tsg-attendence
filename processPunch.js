// processPunch.js (CommonJS)
const { callOdoo } = require("./odoo.js");

async function processPunch(deviceId, punches, emp) {
  try {
    if (!emp) {
      console.log(`❌ No Odoo employee mapped for deviceUserId=${deviceId}`);
      return;
    }
    if (punches.length === 0) return;

    const checkIn = punches[0];
    const checkOut = punches.length > 1 ? punches[punches.length - 1] : null;

    // 🔹 Use PKT day of the punch
    const punchDay = checkIn.slice(0, 10);

    console.log(`🔍 Searching Odoo for ${emp.name} (ID=${emp.id}) on ${punchDay}`);

    const existing = await callOdoo("hr.attendance", "search_read", [
      [
        ["employee_id", "=", emp.id],
        ["check_in", ">=", `${punchDay} 00:00:00`],
        ["check_in", "<=", `${punchDay} 23:59:59`],
      ],
      ["id", "check_in", "check_out"],
    ]);

    if (!existing || existing.length === 0) {
      const vals = { employee_id: emp.id, check_in: checkIn };
      if (checkOut) vals.check_out = checkOut;

      console.log(`📤 Sending CREATE to Odoo:`, JSON.stringify(vals, null, 2));
      await callOdoo("hr.attendance", "create", [[vals]]);
      console.log(`✅ Created attendance for ${emp.name}: IN=${checkIn} OUT=${checkOut || "—"}`);
    } else {
      const att = existing[0];
      const vals = {};

      if (!att.check_in || checkIn < att.check_in) vals.check_in = checkIn;
      if (checkOut && (!att.check_out || checkOut > att.check_out)) vals.check_out = checkOut;

      if (Object.keys(vals).length > 0) {
        console.log(`📤 Sending UPDATE to Odoo for #${att.id}:`, JSON.stringify(vals, null, 2));
        await callOdoo("hr.attendance", "write", [[att.id], vals]);
        console.log(`✅ Updated attendance for ${emp.name}:`, vals);
      } else {
        console.log(`⏭️ No update needed for ${emp.name}`);
      }
    }
  } catch (err) {
    console.error(`❌ processPunch error for ${emp?.name || deviceId}:`, err.message);
  }
}

module.exports = { processPunch };
