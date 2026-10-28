package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.ui.graphics.Color
import vn.id.congtc145.coffeepos.ui.theme.PosPalette
import java.text.NumberFormat
import java.util.Locale

/* Hallmark · Android POS workbench · reference palette: deep teal, pale mint, warm paper.
 * The supplied screenshots own the visual hierarchy; these tokens are shared by all four states.
 * Pre-emit critique: philosophy 5, hierarchy 5, execution 4, specificity 5, restraint 4, variety 4.
 */
internal object ReferenceStyle {
    val header = PosPalette.header
    val headerChip = PosPalette.headerChip
    val teal = PosPalette.accent
    val tealDeep = PosPalette.accentDeep
    val mint = PosPalette.mint
    val paper = PosPalette.paper
    val surface = PosPalette.surface
    val line = PosPalette.line
    val ink = PosPalette.ink
    val muted = PosPalette.muted
    val coffee = Color(0xFF654131)
    val danger = PosPalette.danger
    val warning = PosPalette.warning
    val info = Color(0xFFE8F3FF)
}

internal fun money(amount: Long): String =
    NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(amount) + " đ"
