// sync.js
import { callOdoo } from "./odoo.js";

let empMap = {};

export async function buildEmployeeMap() {
  const companies = await callOdoo("res.company", "search_read", [[], ["id", "name"]]);
  console.log("🏢 Companies loaded:", companies.map(c => c.name).join(", "));

  const employees = await callOdoo("hr.employee", "search_read", [
    [], ["id", "name", "company_id", "barcode"]
  ]);

  if (employees) {
    employees.forEach(emp => {
      // 🔹 Use barcode as the key if set, otherwise fallback to id
      const deviceId = emp.barcode ? String(emp.barcode).trim() : String(emp.id);

      empMap[deviceId] = {
        id: emp.id,
        name: emp.name,
        companyId: emp.company_id ? emp.company_id[0] : null,
        companyName: emp.company_id ? emp.company_id[1] : null,
      };
    });
    console.log(`📌 Loaded ${employees.length} employees across companies`);
    console.log("📌 Map keys preview:", Object.keys(empMap).slice(0, 20));
  }

  return empMap;
}

export function getEmployee(deviceId) {
  return empMap[String(deviceId).trim()] || null;
}
