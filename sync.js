// sync.js
import { callOdoo } from "./odoo.js";

export async function syncEmployees() {
  const employees = await callOdoo("hr.employee", "search_read", [
    [],
    ["id", "name", "barcode", "company_id"],
  ]);

  const map = new Map();

  for (const emp of employees) {
    const empData = {
      id: emp.id,
      name: emp.name,
      company_id: emp.company_id ? emp.company_id[0] : null,
    };

    const keyId = String(emp.id);
    if (!map.has(keyId)) map.set(keyId, []);
    map.get(keyId).push(empData);

    if (emp.barcode) {
      const keyBarcode = String(emp.barcode);
      // Avoid double-adding if barcode == id
      if (keyBarcode !== keyId) {
        if (!map.has(keyBarcode)) map.set(keyBarcode, []);
        map.get(keyBarcode).push(empData);
      }
    }
  }

  console.log(`✅ Synced ${employees.length} employees from Odoo`);
  return map;
}
