/**
 * 工作室基本資訊（甲方）— 顯示在合約上的字串。
 * 視需要改成讀 env 變數或資料庫設定；目前先讓使用者直接編輯這個檔案。
 */
module.exports = {
  name: process.env.STUDIO_NAME || 'multi.design studio',
  legal_name: process.env.STUDIO_LEGAL_NAME || 'multi.design studio',
  tax_id: process.env.STUDIO_TAX_ID || '',
  address: process.env.STUDIO_ADDRESS || '',
  contact_name: process.env.STUDIO_CONTACT_NAME || '',
  contact_email: process.env.STUDIO_CONTACT_EMAIL || 'info@multi-inc.tv',
  contact_phone: process.env.STUDIO_CONTACT_PHONE || '',
  bank_name: process.env.STUDIO_BANK_NAME || '',
  bank_account: process.env.STUDIO_BANK_ACCOUNT || '',
  bank_holder: process.env.STUDIO_BANK_HOLDER || '',
};
