package vn.id.congtc145.coffeepos.domain

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.common.BitMatrix

/** Encode the provider payload verbatim, with an unobstructed four-module quiet zone. */
fun encodePaymentQr(payload: String): BitMatrix {
    require(payload.isNotBlank() && payload.length <= 4096)
    return QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 0, 0,
        mapOf(EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.MARGIN to 4))
}
