package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/** Native vector stand-in until the owner supplies the original cup artwork. */
@Composable
internal fun ReferenceCupArt(code: String, unavailable: Boolean, modifier: Modifier = Modifier) {
    val background = when (code) {
        "CF01" -> Color(0xFFF0ECE6)
        "CF02" -> Color(0xFFF4EBDD)
        "CF03" -> Color(0xFFF4E8E0)
        "CF04" -> Color(0xFFE6EFED)
        else -> Color(0xFFF8EADB)
    }
    val coffee = when (code) {
        "CF01" -> Color(0xFF5D3B27)
        "CF02" -> Color(0xFFA46A3D)
        "CF03" -> Color(0xFFC18757)
        "CF04" -> Color(0xFF755A47)
        else -> Color(0xFFBD8452)
    }
    Box(modifier.fillMaxWidth().height(88.dp).background(if (unavailable) Color(0xFFE9ECEA) else background, RoundedCornerShape(11.dp))) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            drawOval(Color.White, topLeft = Offset(w * .22f, h * .14f), size = Size(w * .56f, h * .75f))
            drawOval(Color(0xFFDDD6CE), topLeft = Offset(w * .33f, h * .69f), size = Size(w * .36f, h * .07f))
            val body = Path().apply {
                moveTo(w * .39f, h * .30f)
                lineTo(w * .63f, h * .30f)
                lineTo(w * .59f, h * .72f)
                lineTo(w * .43f, h * .72f)
                close()
            }
            drawPath(body, coffee)
            drawOval(Color(0xFFF8F4EC), topLeft = Offset(w * .39f, h * .25f), size = Size(w * .24f, h * .12f))
            drawLine(Color(0xFF5C857F), Offset(w * .58f, h * .13f), Offset(w * .60f, h * .49f), strokeWidth = 2.dp.toPx())
            drawOval(Color(0xFFE6DFD7), topLeft = Offset(w * .37f, h * .71f), size = Size(w * .27f, h * .04f), style = Stroke(width = 1.dp.toPx()))
        }
    }
}
