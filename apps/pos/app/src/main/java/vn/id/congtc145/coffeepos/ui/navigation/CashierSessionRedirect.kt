package vn.id.congtc145.coffeepos.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavHostController

/** Manual lock and idle timeout both end the local session; Back cannot reopen selling. */
@Composable
fun CashierSessionRedirect(
    locked: Boolean,
    navController: NavHostController,
    onSessionEnded: () -> Unit
) {
    LaunchedEffect(locked) {
        if (locked) {
            navController.navigate(PosDestinations.LOGIN) {
                popUpTo(navController.graph.id) { inclusive = false }
                launchSingleTop = true
            }
            onSessionEnded()
        }
    }
}
