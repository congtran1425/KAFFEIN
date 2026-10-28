package vn.id.congtc145.coffeepos.ui.receipt

import android.content.ContentValues
import android.content.Context
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import java.io.File
import java.io.FileOutputStream
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object ReceiptPdfExporter {
    fun export(context: Context, sale: SaleEntity): Uri {
        val document = PdfDocument()
        val page = document.startPage(PdfDocument.PageInfo.Builder(420, 760, 1).create())
        val canvas = page.canvas
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.BLACK }
        val currency = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN"))
        var y = 48f

        fun line(text: String, size: Float = 14f, bold: Boolean = false) {
            paint.textSize = size
            paint.typeface = if (bold) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            canvas.drawText(text.take(54), 28f, y, paint)
            y += size + 10f
        }

        line("KAFFEIN", 22f, true)
        line(sale.storeName, 14f, true)
        line("Hóa đơn: ${sale.saleNumber}")
        line("Thu ngân: ${sale.cashierName} (${sale.cashierCode})")
        line(SimpleDateFormat("HH:mm dd/MM/yyyy", Locale.forLanguageTag("vi-VN"))
            .apply { timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh") }
            .format(Date(sale.completedAt)))
        y += 8f

        OrderJsonSerializer.deserializeOrderItems(sale.itemsJson).forEach { item ->
            line("${item.quantity} x ${item.product.name}", 13f, true)
            line("${item.getCustomizationSummary()} · ${currency.format(item.totalLinePrice)}", 11f)
        }

        y += 8f
        line("Tạm tính: ${currency.format(sale.subtotalVnd)}")
        line("VAT: ${currency.format(sale.taxVnd)}")
        line("TỔNG: ${currency.format(sale.totalVnd)}", 17f, true)
        if (sale.paymentMethod == "CASH") {
            line("Thanh toán: Tiền mặt")
            line("Khách đưa: ${currency.format(sale.cashReceivedVnd)}")
            line("Tiền thừa: ${currency.format(sale.changeVnd)}")
        } else {
            line("Thanh toán: ${if (sale.paymentMethod == "MOMO") "MoMo" else "ZaloPay"}")
        }
        y += 12f
        line("Cảm ơn quý khách!", 14f, true)
        document.finishPage(page)

        val fileName = "receipt-${sale.saleNumber}.pdf"
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/CoffeePOS")
            }
            val target = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("Không thể tạo tệp PDF.")
            context.contentResolver.openOutputStream(target).use { output ->
                checkNotNull(output) { "Không thể mở tệp PDF." }
                document.writeTo(output)
            }
            target
        } else {
            val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "CoffeePOS")
            directory.mkdirs()
            val file = File(directory, fileName)
            FileOutputStream(file).use(document::writeTo)
            Uri.fromFile(file)
        }
        document.close()
        return uri
    }
}
