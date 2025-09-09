import { callOdoo } from "./odoo.js";
import { getOdooEmployee } from "./employeeMap.js";

function dateOnlyPKT(date) {
  return new Date(
    new Date(date).toLocaleString("en-US", { timeZone: "Asia/Karachi" })
  ).toISOString().slice(0, 10);
}

async function processPunch(deviceId, punchTime) {
  const emp = getOdooEmployee(deviceId);
  if (!emp) {
    console.log(`❌ No employee mapped for deviceUserId=${deviceId}`);
    return;
  }

  const odooEmpId = emp.id;
  const empName = emp.name;
  const companyId = emp.company;   // 🔑 from employeeMap
  const punchDate = dateOnlyPKT(punchTime);
  const today = dateOnlyPKT(new Date());

  // ✅ Only today’s punches
  if (punchDate !== today) {
    console.log(`⏭️ Skipping punch for ${empName}, not today (${punchDate})`);
    return;
  }

  // fetch today’s attendance
  const todaysRec = await callOdoo(
    "hr.attendance",
    "search_read",
    [
      [
        ["employee_id", "=", odooEmpId],
        ["check_in", ">=", `${today} 00:00:00`],
        ["check_in", "<=", `${today} 23:59:59`],
      ],
      ["id", "check_in", "check_out"],
      0,
      1,
      "id desc",
    ],
    { context: { company_id: companyId } }   // 👈 important
  );

  if (!todaysRec || todaysRec.length === 0) {
    const newId = await callOdoo(
      "hr.attendance",
      "create",
      [{ employee_id: odooEmpId, check_in: punchTime }],
      { context: { company_id: companyId } }   // 👈
    );
    console.log(`✅ New Check-in for ${empName} at ${punchTime} (rec ${newId})`);
    return;
  }

  const rec = todaysRec[0];

  if (!rec.check_out && new Date(punchTime) > new Date(rec.check_in)) {
    await callOdoo(
      "hr.attendance",
      "write",
      [[rec.id], { check_out: punchTime }],
      { context: { company_id: companyId } }   // 👈
    );
    console.log(`✅ Checkout for ${empName} at ${punchTime} (rec ${rec.id})`);
    return;
  }

  if (rec.check_out) {
    const newId = await callOdoo(
      "hr.attendance",
      "create",
      [{ employee_id: odooEmpId, check_in: punchTime }],
      { context: { company_id: companyId } }   // 👈
    );
    console.log(`✅ New Check-in for ${empName} at ${punchTime} (rec ${newId})`);
    return;
  }

  console.log(`⏩ Ignored punch for ${empName}, time <= last check_in`);
}

export { processPunch };
