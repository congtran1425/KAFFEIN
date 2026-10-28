package vn.id.congtc145.coffeepos.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun AuthKeypadInput(
    employeeCode: String,
    pin: String,
    activeField: String,
    isLoading: Boolean,
    onSelectField: (String) -> Unit,
    onAppendDigit: (String) -> Unit,
    onBackspace: () -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier,
    loadingLabel: String = "Đang xác thực",
    error: String? = null,
    submitting: Boolean = isLoading,
    showInputStatus: Boolean = true
) {
    // Deliberately remember, NOT rememberSaveable: PIN visibility never survives navigation.
    var showPin by remember { mutableStateOf(false) }
    val keyboardFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { keyboardFocus.requestFocus() }
    LaunchedEffect(employeeCode, pin.isEmpty()) { showPin = false }
    Column(
        modifier.fillMaxWidth().focusRequester(keyboardFocus).onPreviewKeyEvent { event ->
            val digit = event.nativeKeyEvent.unicodeChar.toChar()
            val backspace = event.key == Key.Backspace
            if (digit in '0'..'9' || backspace) {
                if (!isLoading && event.type == KeyEventType.KeyDown) {
                    if (backspace) onBackspace() else onAppendDigit(digit.toString())
                }
                true
            } else false
        }.focusable(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FieldLabel("MÃ NHÂN VIÊN", employeeCode.length, 7)
            Surface(
                onClick = { onSelectField("CODE"); keyboardFocus.requestFocus() }, enabled = !isLoading,
                color = AuthPalette.Surface, shape = RoundedCornerShape(12.dp),
                border = BorderStroke(2.dp, if (activeField == "CODE") AuthPalette.Green else AuthPalette.Border),
                modifier = Modifier.fillMaxWidth().height(64.dp).testTag("employee-code")
                    .semantics { contentDescription = "Mã nhân viên, ${employeeCode.length} trên 7 số" }
            ) {
                Row(Modifier.fillMaxSize().padding(horizontal = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                    repeat(7) { index ->
                        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                            Text(employeeCode.getOrNull(index)?.toString() ?: "＿",
                                color = if (index < employeeCode.length) AuthPalette.Ink else AuthPalette.Border,
                                fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FieldLabel("PIN BẢO MẬT", pin.length, 4)
            Surface(
                color = AuthPalette.Surface, shape = RoundedCornerShape(12.dp),
                border = BorderStroke(2.dp, if (activeField == "PIN") AuthPalette.Green else AuthPalette.Border),
                modifier = Modifier.fillMaxWidth().height(64.dp)
            ) {
                Row(Modifier.fillMaxSize().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        onClick = { onSelectField("PIN"); keyboardFocus.requestFocus() }, enabled = !isLoading,
                        color = AuthPalette.Surface, modifier = Modifier.weight(1f).fillMaxHeight().testTag("pin-field")
                            .semantics { contentDescription = "PIN bảo mật, ${pin.length} trên 4 số"; password() }
                    ) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                        Row(Modifier.widthIn(max = 256.dp).fillMaxWidth().padding(horizontal = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                            repeat(4) { index ->
                                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                                    if (showPin && index < pin.length) {
                                        Text(pin[index].toString(), color = AuthPalette.Ink, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                                    } else {
                                        Box(Modifier.size(14.dp).background(
                                            if (index < pin.length) AuthPalette.Green else AuthPalette.Border, CircleShape))
                                    }
                                }
                            }
                        }
                        }
                    }
                    TextButton(
                        onClick = { showPin = !showPin }, enabled = !isLoading,
                        modifier = Modifier.width(80.dp).height(48.dp).semantics {
                            contentDescription = if (showPin) "Ẩn PIN" else "Hiện PIN"
                        },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.textButtonColors(containerColor = AuthPalette.KeySoft, contentColor = AuthPalette.Green)
                    ) { Text(if (showPin) "Ẩn" else "Hiện", fontWeight = FontWeight.Bold) }
                }
            }
        }
        // Keep request/error feedback beside the credentials, not below the keypad
        // where Android's system bars can push it outside the visible viewport.
        Box(Modifier.fillMaxWidth().heightIn(min = 24.dp).semantics { liveRegion = LiveRegionMode.Polite }) {
            when {
                submitting -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = AuthPalette.Green, strokeWidth = 2.dp)
                    Text("$loadingLabel…", color = AuthPalette.Green, fontSize = 14.sp)
                }
                error != null -> Text(error, color = AuthPalette.Error, fontSize = 14.sp,
                    modifier = Modifier.semantics { error(error) })
                showInputStatus -> Text("ĐANG NHẬP: " + if (activeField == "PIN") "PIN BẢO MẬT" else "MÃ NHÂN VIÊN",
                    color = AuthPalette.Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"),
                listOf("Xóa hết", "0", "Xóa")).forEach { keys ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    keys.forEach { key ->
                        val special = key.length > 1
                        OutlinedButton(
                            onClick = { when (key) { "Xóa hết" -> onClearAll(); "Xóa" -> onBackspace(); else -> onAppendDigit(key) } },
                            enabled = !isLoading, modifier = Modifier.weight(1f).height(58.dp).testTag("key-$key")
                                .semantics {
                                    if (special) contentDescription = if (key == "Xóa hết") "Xóa toàn bộ mã nhân viên và PIN" else "Xóa một số"
                                },
                            shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, AuthPalette.Border),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (special) AuthPalette.KeySoft else AuthPalette.Surface,
                                contentColor = if (key == "Xóa hết") AuthPalette.Error else AuthPalette.Ink),
                            contentPadding = PaddingValues(8.dp)
                        ) { Text(key, fontSize = if (special) 14.sp else 22.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FieldLabel(label: String, length: Int, max: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = AuthPalette.Ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Text("$length/$max", color = AuthPalette.Muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}
