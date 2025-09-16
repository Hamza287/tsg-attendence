// odoo.js
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_UID = parseInt(process.env.ODOO_UID, 10);
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

export async function callOdoo(model, method, args) {
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, ODOO_UID, ODOO_PASSWORD, model, method, args],
    },
    id: Date.now(),
  };

  try {
    console.log("📤 Odoo RPC Request:", JSON.stringify({
      model, method, args
    }, null, 2));

    const { data } = await axios.post(ODOO_URL, body, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("📥 Odoo RPC Response:", JSON.stringify(data, null, 2));

    if (data.error) {
      throw new Error(JSON.stringify(data.error));
    }
    return data.result;
  } catch (err) {
    console.error("❌ Odoo RPC error:", err.message);
    return null;
  }
}
