package vn.id.congtc145.coffeepos.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = CoffeeAmberLight,
    onPrimary = CoffeeDarkRoast,
    primaryContainer = CoffeeWarmBrown,
    onPrimaryContainer = CoffeeCream,
    secondary = CoffeeBronze,
    onSecondary = CoffeeCream,
    background = CoffeeDarkRoast,
    onBackground = CoffeeCream,
    surface = CoffeeMocha,
    onSurface = CoffeeCream,
    surfaceVariant = CoffeeWarmBrown,
    onSurfaceVariant = CoffeeCreamSurface,
    error = ErrorCrimson,
    onError = SurfaceWhite
)

private val LightColorScheme = lightColorScheme(
    primary = PosPalette.accent,
    onPrimary = SurfaceWhite,
    primaryContainer = PosPalette.mint,
    onPrimaryContainer = PosPalette.header,
    secondary = PosPalette.accentDeep,
    onSecondary = SurfaceWhite,
    secondaryContainer = PosPalette.mint,
    onSecondaryContainer = PosPalette.header,
    tertiary = PosPalette.accent,
    onTertiary = SurfaceWhite,
    tertiaryContainer = PosPalette.mint,
    onTertiaryContainer = PosPalette.header,
    background = PosPalette.paper,
    onBackground = PosPalette.ink,
    surface = PosPalette.surface,
    onSurface = PosPalette.ink,
    surfaceVariant = PosPalette.mint,
    onSurfaceVariant = PosPalette.muted,
    outline = PosPalette.line,
    outlineVariant = PosPalette.line,
    error = ErrorCrimson,
    onError = SurfaceWhite
)

@Composable
fun CoffeePOSTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
