package vn.id.congtc145.coffeepos.ui.theme

import androidx.compose.ui.graphics.Color

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4.
 * One POS palette for Order, checkout and utility screens.
 */
object PosPalette {
    val header = Color(0xFF153630)
    val headerChip = Color(0xFF254B43)
    val accent = Color(0xFF08655B)
    val accentDeep = Color(0xFF075B52)
    val mint = Color(0xFFE7F5EF)
    val paper = Color(0xFFF6F8F6)
    val surface = Color(0xFFFEFFFE)
    val line = Color(0xFFDCE6E0)
    val ink = Color(0xFF1B2E2A)
    val muted = Color(0xFF5D6F6A)
    val danger = Color(0xFFAC3029)
    val warning = Color(0xFFFCF1E5)
}

// Existing screen names remain as aliases while POS screens migrate to PosPalette.
val CoffeeDarkRoast = PosPalette.header
val CoffeeMocha = PosPalette.headerChip
val CoffeeWarmBrown = Color(0xFF315E54)
val CoffeeBronze = PosPalette.accent
val CoffeeAmber = PosPalette.accent
val CoffeeAmberLight = Color(0xFF0A766A)

val CoffeeCream = PosPalette.paper
val CoffeeCreamSurface = PosPalette.mint
val CoffeeCardBorder = PosPalette.line

// System & Semantic Colors
val SuccessGreen = Color(0xFF16805E)
val SuccessGreenLight = PosPalette.mint
val WarningOrange = Color(0xFF9A5A2E)
val WarningOrangeLight = PosPalette.warning
val ErrorCrimson = PosPalette.danger
val ErrorCrimsonLight = Color(0xFFFEE2E2)
val InfoBlue = PosPalette.accent

val TextPrimary = PosPalette.ink
val TextSecondary = PosPalette.muted
val TextMuted = Color(0xFF9CA3AF)
val SurfaceWhite = PosPalette.surface
val SurfaceOffWhite = PosPalette.paper
