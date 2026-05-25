/**
 * 工作室基本資訊（甲方）— 顯示在合約上的字串。
 * 視需要改成讀 env 變數或資料庫設定；目前先讓使用者直接編輯這個檔案。
 */
module.exports = {
  name: process.env.STUDIO_NAME || 'Studio PM 範例工作室',
  legal_name: process.env.STUDIO_LEGAL_NAME || 'Studio PM 範例工作室有限公司',
  tax_id: process.env.STUDIO_TAX_ID || '00000000',
  address: process.env.STUDIO_ADDRESS || '台北市信義區範例路 1 號 1 樓',
  contact_name: process.env.STUDIO_CONTACT_NAME || '張小明',
  contact_email: process.env.STUDIO_CONTACT_EMAIL || 'hello@example.com',
  contact_phone: process.env.STUDIO_CONTACT_PHONE || '02-0000-0000',
  bank_name: process.env.STUDIO_BANK_NAME || '中華銀行 範例分行',
  bank_account: process.env.STUDIO_BANK_ACCOUNT || '0000-0000-0000-0000',
  bank_holder: process.env.STUDIO_BANK_HOLDER || 'Studio PM 範例工作室有限公司',
};
