package vn.id.congtc145.coffeepos

import com.google.zxing.qrcode.decoder.Decoder
import org.junit.Assert.assertEquals
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.encodePaymentQr

class PaymentQrTest {
    @Test fun providerPayloadRoundTripsWithoutModification() {
        val payload = "https://sandbox.zalopay.vn/qr?order=test-123&amount=92000"
        val image = encodePaymentQr(payload)
        // The writer emits a four-module quiet zone; decoder expects the module region.
        val region = com.google.zxing.common.BitMatrix(image.width - 8)
        for (y in 0 until region.height) for (x in 0 until region.width) {
            if (image[x + 4, y + 4]) region.set(x, y)
        }
        assertEquals(payload, Decoder().decode(region).text)
    }
}
