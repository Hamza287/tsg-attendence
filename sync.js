import { callOdoo } from "./odoo.js"

let empMap = {}

export async function buildEmployeeMap() {
  // get companies
  const companies = await callOdoo("res.company", "search_read", [[], ["id", "name"]])
  console.log("🏢 Companies loaded:", companies.map(c => c.name).join(", "))

  // get employees with company
  const employees = await callOdoo("hr.employee", "search_read", [
    [], ["id", "name", "company_id", "barcode"]
  ])

  if (employees) {
    employees.forEach(emp => {
      const deviceId = emp.barcode || emp.id
      empMap[String(deviceId)] = {
        id: emp.id,
        name: emp.name,
        companyId: emp.company_id ? emp.company_id[0] : null,
        companyName: emp.company_id ? emp.company_id[1] : null
      }
    })
    console.log(`📌 Loaded ${employees.length} employees across companies`)
  }

  return empMap
}

export function getEmployee(deviceId) {
  return empMap[String(deviceId)] || null
}
