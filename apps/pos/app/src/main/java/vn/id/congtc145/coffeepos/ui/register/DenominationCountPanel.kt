package vn.id.congtc145.coffeepos.ui.register

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.foundation.focusable
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.domain.CashCountInput
import vn.id.congtc145.coffeepos.domain.cashDenominations
import vn.id.congtc145.coffeepos.ui.components.AuthBrand
import vn.id.congtc145.coffeepos.ui.components.AuthPalette
import vn.id.congtc145.coffeepos.ui.reference.money

enum class CashCountMode(val title: String, val reviewLabel: String, val confirmLabel: String) {
    OPEN("Mở phiên quỹ", "Xem lại & mở phiên", "Xác nhận mở phiên"),
    HANDOVER("Bàn giao quỹ", "Tiếp tục đối soát", "Xác nhận bàn giao"),
    CLOSE("Tổng kết phiên tiền mặt", "Tiếp tục đối soát", "Xác nhận đóng phiên")
}

@Composable
fun CashCountLayout(
    mode: CashCountMode, input: CashCountInput, onInput: (CashCountInput) -> Unit,
    expectedCash: Long?, cashierName: String, storeName: String, sessionLabel: String?,
    isSaving: Boolean, error: String?, onBack: () -> Unit, onReview: () -> Unit,
    showExpectedAndVariance: Boolean = false, shortage: Long? = null,
    title: String = mode.title, actionLabel: String = mode.reviewLabel,
    actionEnabled: Boolean = true
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(Modifier.fillMaxSize().background(AuthPalette.Paper)
        .focusRequester(focus).onPreviewKeyEvent { event ->
            val digit = event.nativeKeyEvent.unicodeChar.toChar()
            if (digit in '0'..'9' || event.key == Key.Backspace) {
                if (!isSaving && event.type == KeyEventType.KeyDown)
                    onInput(if (event.key == Key.Backspace) input.backspace() else input.digit(digit.toString()))
                true
            } else false
        }.focusable()) {
        Surface(color = AuthPalette.Dark) {
            Row(Modifier.fillMaxWidth().height(68.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                IconButton(onClick = onBack, enabled = !isSaving) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Quay lại", tint = AuthPalette.Cream)
                }
                AuthBrand()
                Spacer(Modifier.weight(1f))
                Text(storeName, color = AuthPalette.Cream, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(cashierName, color = AuthPalette.Dot, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text(title, Modifier.weight(1f), color = AuthPalette.Ink, fontSize = 27.sp, fontWeight = FontWeight.Bold)
            Surface(color = if (mode == CashCountMode.OPEN) AuthPalette.AmberSoft else AuthPalette.Soft,
                shape = RoundedCornerShape(12.dp)) {
                Text(sessionLabel ?: "Chưa mở phiên", Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    color = if (mode == CashCountMode.OPEN) AuthPalette.Amber else AuthPalette.Green,
                    fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
        BoxWithConstraints(Modifier.weight(1f).padding(horizontal = 28.dp)) {
            if (maxWidth >= 850.dp) {
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    CashQuantityKeypad(input, onInput, !isSaving, Modifier.weight(0.39f).fillMaxHeight())
                    CashDenominationTable(input, onInput, !isSaving, Modifier.weight(0.61f).fillMaxHeight())
                }
            } else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    CashQuantityKeypad(input, onInput, !isSaving, Modifier.fillMaxWidth())
                    CashDenominationTable(input, onInput, !isSaving, Modifier.fillMaxWidth())
                }
            }
        }
        val feedback = input.error ?: error
        if (feedback != null) Text(feedback, color = AuthPalette.Error, fontSize = 14.sp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 6.dp).testTag("cash-count-error"))
        Surface(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 12.dp),
            shape = RoundedCornerShape(16.dp), color = AuthPalette.Surface,
            border = BorderStroke(1.dp, AuthPalette.Border)) {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                if (showExpectedAndVariance && expectedCash != null) CashTotal("Theo sổ", expectedCash)
                if (shortage != null) CashTotal("Cần bù", shortage, warning = true)
                CashTotal(if (shortage != null) "Đã đếm bù" else if (mode == CashCountMode.OPEN) "Tiền đầu ca" else "Thực đếm", input.total)
                if (shortage != null) CashTotal("Còn thiếu", (shortage - input.total).coerceAtLeast(0), warning = input.total < shortage)
                if (showExpectedAndVariance && expectedCash != null) CashTotal("Chênh lệch", input.total - expectedCash,
                    warning = input.total != expectedCash)
                Spacer(Modifier.weight(1f))
                Button(onClick = onReview, enabled = !isSaving && input.error == null && actionEnabled && (shortage == null || input.total >= shortage),
                    modifier = Modifier.heightIn(min = 52.dp).testTag("cash-review"),
                    colors = ButtonDefaults.buttonColors(containerColor = AuthPalette.Green),
                    shape = RoundedCornerShape(12.dp)) {
                    Text(if (isSaving) "Đang lưu…" else actionLabel, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun CashQuantityKeypad(input: CashCountInput, onInput: (CashCountInput) -> Unit, enabled: Boolean, modifier: Modifier) {
    CashCard(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CashLabel("MỆNH GIÁ")
                Text("${money(input.selected)} / tờ", color = AuthPalette.Ink, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            }
            Surface(color = AuthPalette.Soft, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, AuthPalette.Border)) {
                Column(Modifier.widthIn(min = 110.dp).padding(14.dp), horizontalAlignment = Alignment.End) {
                    CashLabel("SỐ TỜ")
                    Text(input.quantity.toString(), color = AuthPalette.Green, fontSize = 29.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.testTag("cash-selected-quantity"))
                }
            }
        }
        HorizontalDivider(color = AuthPalette.Border)
        CashLabel("CỘNG NHANH SỐ TỜ")
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(10, 20, 50).forEach { delta ->
                CashKey("+$delta", { onInput(input.adjust(input.selected, delta)) }, enabled,
                    Modifier.weight(1f).testTag("cash-quick-$delta"), soft = true)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("Xóa hết", "0", "⌫")).forEach { keys ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    keys.forEach { key ->
                        CashKey(key, { onInput(when (key) {
                            "Xóa hết" -> input.clearSelected()
                            "⌫" -> input.backspace()
                            else -> input.digit(key)
                        }) }, enabled, Modifier.weight(1f).testTag("cash-key-$key"), soft = key.length > 1 || key == "⌫")
                    }
                }
            }
        }
    }
}

@Composable
private fun CashDenominationTable(input: CashCountInput, onInput: (CashCountInput) -> Unit, enabled: Boolean, modifier: Modifier) {
    CashCard(modifier) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            CashLabel("KIỂM ĐẾM THEO MỆNH GIÁ", Modifier.weight(1f))
            CashLabel("SỐ TỜ", Modifier.width(180.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            CashLabel("THÀNH TIỀN", Modifier.width(145.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
        }
        Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            cashDenominations.forEach { denomination ->
                val selected = input.selected == denomination
                val quantity = input.counts[denomination] ?: 0
                Surface(onClick = { onInput(input.select(denomination)) }, enabled = enabled,
                    color = if (selected) AuthPalette.Soft else AuthPalette.Surface,
                    shape = RoundedCornerShape(10.dp),
                    border = if (selected) BorderStroke(1.dp, AuthPalette.Dot) else null,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("cash-row-$denomination")) {
                    Row(Modifier.padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(money(denomination), Modifier.weight(1f), color = AuthPalette.Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Row(Modifier.width(180.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                            TextButton(onClick = { onInput(input.adjust(denomination, -1)) }, enabled = enabled && quantity > 0,
                                modifier = Modifier.size(48.dp).testTag("cash-minus-$denomination").semantics {
                                    contentDescription = "Giảm một tờ ${money(denomination)}"
                                }, contentPadding = PaddingValues(0.dp)) { Text("−", fontSize = 24.sp, color = AuthPalette.Green) }
                            Surface(onClick = { onInput(input.select(denomination)) }, enabled = enabled,
                                color = if (selected) AuthPalette.Surface else AuthPalette.KeySoft,
                                shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, AuthPalette.Border),
                                modifier = Modifier.width(74.dp).height(48.dp).testTag("cash-quantity-$denomination")) {
                                Box(contentAlignment = Alignment.Center) { Text(quantity.toString(), color = AuthPalette.Ink,
                                    fontSize = 17.sp, fontWeight = FontWeight.Bold) }
                            }
                            TextButton(onClick = { onInput(input.adjust(denomination, 1)) }, enabled = enabled,
                                modifier = Modifier.size(48.dp).testTag("cash-plus-$denomination").semantics {
                                    contentDescription = "Tăng một tờ ${money(denomination)}"
                                }, contentPadding = PaddingValues(0.dp)) { Text("+", fontSize = 24.sp, color = AuthPalette.Green) }
                        }
                        Text(money(denomination * quantity), Modifier.width(145.dp), color = AuthPalette.Green,
                            fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
            }
        }
        HorizontalDivider(color = AuthPalette.Border)
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            CashLabel("TỔNG KIỂM ĐẾM", Modifier.weight(1f))
            Text(money(input.total), color = AuthPalette.Green, fontSize = 27.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("cash-count-total"))
        }
    }
}

@Composable
private fun CashKey(label: String, onClick: () -> Unit, enabled: Boolean, modifier: Modifier, soft: Boolean) {
    OutlinedButton(onClick, modifier.height(56.dp), enabled = enabled,
        shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, AuthPalette.Border),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = if (soft) AuthPalette.KeySoft else AuthPalette.Surface,
            contentColor = AuthPalette.Green), contentPadding = PaddingValues(6.dp)) {
        Text(label, fontSize = if (label.length > 3) 15.sp else 21.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CashCard(modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, color = AuthPalette.Surface, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, AuthPalette.Border)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

@Composable
private fun CashLabel(
    text: String,
    modifier: Modifier = Modifier,
    textAlign: androidx.compose.ui.text.style.TextAlign? = null
) {
    Text(
        text,
        modifier,
        color = AuthPalette.Muted,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        textAlign = textAlign
    )
}

@Composable
private fun CashTotal(label: String, value: Long, warning: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, color = AuthPalette.Muted, fontSize = 12.sp)
        Text(money(value), color = if (warning) AuthPalette.Error else AuthPalette.Green,
            fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}
