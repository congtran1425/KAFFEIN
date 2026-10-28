/* Hallmark · native POS auth · user reference · pre-emit critique: P5 H4 E4 S5 R5 V4 */
package vn.id.congtc145.coffeepos.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import vn.id.congtc145.coffeepos.R
import java.time.ZonedDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Scoped to auth: the sales UI retains its own established palette. */
object AuthPalette {
    val Green = Color(0xFF17483F)
    val Dark = Color(0xFF102F2B)
    val Paper = Color(0xFFF5F6F1)
    val Surface = Color(0xFFFFFFFF)
    val Ink = Color(0xFF19332E)
    val Muted = Color(0xFF526D65)
    val Border = Color(0xFFD5E1DB)
    val Soft = Color(0xFFE8F4EE)
    val KeySoft = Color(0xFFF7FAF8)
    val Dot = Color(0xFF91D6B1)
    val HeaderChip = Color(0xFF1D4A41)
    val Amber = Color(0xFF995F29)
    val AmberSoft = Color(0xFFFFF1DB)
    val Cream = Color(0xFFFFF6E8)
    val Error = Color(0xFFB43229)
}

@Composable
fun AuthBrand(modifier: Modifier = Modifier, compact: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Image(painterResource(R.drawable.kaffein_logo), "KAFFEIN", Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)))
        if (!compact) Text("KAFFEIN", color = AuthPalette.Cream, fontWeight = FontWeight.Bold, fontSize = 20.sp)
    }
}

@Composable
fun AuthOutlinedAction(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick, modifier.heightIn(min = 52.dp), enabled = enabled,
        shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, AuthPalette.Border),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = AuthPalette.Surface, contentColor = AuthPalette.Green)
    ) { Text(text, fontWeight = FontWeight.Bold, maxLines = 1) }
}

@Composable
fun AttendanceHeader(storeName: String, isOnline: Boolean?) {
    var time by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        while (true) {
            time = ZonedDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).format(DateTimeFormatter.ofPattern("HH:mm"))
            delay(1_000)
        }
    }
    Surface(color = AuthPalette.Dark, modifier = Modifier.fillMaxWidth().height(74.dp)) {
        BoxWithConstraints {
            val compact = maxWidth < 760.dp
            Row(Modifier.fillMaxSize().padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                AuthBrand(compact = compact)
                VerticalDivider(Modifier.height(40.dp), color = AuthPalette.Muted)
                Text("Chấm công", color = AuthPalette.Cream, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Spacer(Modifier.weight(1f))
                HeaderChip(storeName.ifBlank { "Chưa kích hoạt" }, Modifier.widthIn(max = 260.dp))
                HeaderChip(when (isOnline) { true -> "Trực tuyến"; false -> "Ngoại tuyến"; null -> "Đang kết nối" })
                Text(time, color = AuthPalette.Cream, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun HeaderChip(text: String, modifier: Modifier = Modifier) {
    Surface(color = AuthPalette.HeaderChip, shape = RoundedCornerShape(24.dp), modifier = modifier) {
        Text(text, color = AuthPalette.Cream, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp))
    }
}
