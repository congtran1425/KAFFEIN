import type { IngredientResponse } from './services/api'

export interface ReceiptCsvRow {
  code: string
  quantity: string
  unitCost: string
  note: string
}

/** Mirrors the current API's simple comma-split CSV contract. It deliberately
 * rejects quoted CSV and extra columns so the browser preview cannot disagree
 * with what the server will import. */
export function inspectReceiptCsv(content: string, ingredients: Pick<IngredientResponse, 'code' | 'isActive'>[]) {
  const rows: ReceiptCsvRow[] = []
  const errors: string[] = []
  if (!content.trim()) return { rows, errors }
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const header = lines.shift()?.trim().toLowerCase()
  if (header !== 'ingredient_code,received_quantity,unit_cost_vnd,note') {
    errors.push('Dòng tiêu đề phải đúng: ingredient_code,received_quantity,unit_cost_vnd,note')
  }
  if (lines.length === 0) errors.push('CSV phải có ít nhất một dòng dữ liệu.')
  if (lines.length > 200) errors.push('CSV chỉ nhận tối đa 200 dòng mỗi phiếu.')
  const codes = new Set(ingredients.filter((item) => item.isActive).map((item) => item.code.toUpperCase()))
  lines.slice(0, 200).forEach((line, index) => {
    const columns = line.split(',').map((cell) => cell.trim())
    if (columns.length !== 4 || columns.some((cell) => cell.includes('"') || cell.includes("'"))) {
      errors.push(`Dòng ${index + 2}: cần đúng 4 cột CSV đơn giản, không dùng dấu phẩy trong ô hoặc ngoặc kép.`)
      return
    }
    const [code, quantity, unitCost, note] = columns
    rows.push({ code, quantity, unitCost, note })
    if (!codes.has(code.toUpperCase())) errors.push(`Dòng ${index + 2}: mã nguyên liệu ${code || '(trống)'} không tồn tại hoặc ngừng dùng.`)
    if (!/^\d+(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) {
      errors.push(`Dòng ${index + 2}: số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.`)
    }
    if (!/^\d+(?:\.\d{1,3})?$/.test(unitCost)) {
      errors.push(`Dòng ${index + 2}: đơn giá phải được nhập rõ, không để trống.`)
    }
    if (note.length > 200) errors.push(`Dòng ${index + 2}: ghi chú dài quá 200 ký tự.`)
    if (/^[=+\-@]/.test(note)) errors.push(`Dòng ${index + 2}: ghi chú không được bắt đầu bằng ký tự công thức bảng tính.`)
  })
  return { rows, errors }
}
