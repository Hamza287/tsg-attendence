
require("dotenv").config();

module.exports = {
  ODOO_URL: process.env.ODOO_URL,
  ODOO_DB: process.env.ODOO_DB,
  ODOO_UID: parseInt(process.env.ODOO_UID, 10),
  ODOO_PASSWORD: process.env.ODOO_PASSWORD,
  TIMEZONE: process.env.TIMEZONE || "Asia/Karachi"
};
