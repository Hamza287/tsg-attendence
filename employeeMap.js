// employeeMap.js
import { callOdoo } from "./odoo.js";

let empMap = {};

export async function loadEmployeeMap() {
  const employees = await callOdoo("hr.employee", "search_read", [
    [], ["id", "name", "company_id"]
  ]);

  if (!employees || employees.length === 0) {
    console.log("⚠️ No employees loaded from Odoo");
    return;
  }

  empMap = {}; // reset map
  employees.forEach(e => {
    const key = String(e.id).trim();
    empMap[key] = {
      id: e.id,
      name: e.name,
      companyId: e.company_id ? e.company_id[0] : null,
      companyName: e.company_id ? e.company_id[1] : null,
    };
  });

  console.log(`📌 Loaded ${employees.length} employees from Odoo`);
  console.log("📌 Map keys preview:", Object.keys(empMap).slice(0, 20));
}

export function getOdooEmployee(deviceId) {
  const key = String(deviceId).trim();
  return empMap[key] || null;
}
