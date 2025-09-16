import { callOdoo } from "./odoo.js";

function groupByDay(punches) {
  const groups = {};
  for (const p of punches) {
    const day = new Date(p.timestamp).toISOString().slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(p);
  }
  return groups;
}

export async function processPunches(punches, employeeMap) {
  const grouped = groupByDay(punches);

  for (const [day, records] of Object.entries(grouped)) {
    records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const first = records[0];
    const last = records[records.length - 1];

    const emps = employeeMap.get(first.userId);
    if (!emps) continue;

    for (const emp of emps) {
      try {
        const checkIn = first.timestamp;
        const checkOut = records.length > 1 ? last.timestamp : null;

        const attId = await callOdoo("hr.attendance", "create", [
          { employee_id: emp.id, check_in: checkIn },
        ]);

        if (checkOut) {
          await callOdoo("hr.attendance", "write", [
            [attId],
            { check_out: checkOut },
          ]);
        }

        console.log(
          `📌 Synced attendance for ${emp.name} (${emp.company_id}) on ${day}`
        );
      } catch (err) {
        console.error("⚠️ Odoo push failed:", err.message);
      }
    }
  }
}
