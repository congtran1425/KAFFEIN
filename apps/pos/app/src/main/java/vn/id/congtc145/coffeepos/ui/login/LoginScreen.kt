package vn.id.congtc145.coffeepos.ui.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.R
import vn.id.congtc145.coffeepos.ui.components.*

@Composable
fun LoginScreen(
    viewModel: LoginViewModel,
    onLoginSuccess: (cashierName: String, cashierCode: String) -> Unit,
    onNavigateToAttendance: () -> Unit
) {
    LaunchedEffect(Unit) { viewModel.clearAll(); viewModel.refreshDeviceIdentity() }
    DisposableEffect(viewModel) { onDispose { viewModel.leaveScreen() } }
    val state by viewModel.uiState.collectAsState()
    LoginScreenContent(
        state, onNavigateToAttendance,
        { digit -> viewModel.appendDigit(digit, onLoginSuccess) },
        viewModel::selectField, viewModel::backspace, viewModel::clearAll
    )
}

@Composable
fun LoginScreenContent(
    state: LoginUiState,
    onAttendance: () -> Unit,
    onDigit: (String) -> Unit,
    onSelectField: (String) -> Unit,
    onBackspace: () -> Unit,
    onClearAll: () -> Unit,
    sectionTitle: String = "ĐĂNG NHẬP THU NGÂN",
    headline: String = "Chào mừng trở lại",
    actionLabel: String = "Chấm công  →",
    showInputStatus: Boolean = true,
    loadingLabel: String = "Đang đăng nhập"
) {
    BoxWithConstraints(Modifier.fillMaxSize().background(AuthPalette.Paper)) {
        val wide = maxWidth >= 800.dp
        Row(Modifier.fillMaxSize()) {
            if (wide) {
                Box(Modifier.weight(0.477f).fillMaxHeight()) {
                    Image(painterResource(R.drawable.coffee_pos_login_hero), null, Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop)
                    // A scrim keeps the live store identity readable over the supplied photograph.
                    Box(Modifier.fillMaxSize().background(AuthPalette.Dark.copy(alpha = 0.28f)))
                    AuthBrand(Modifier.align(Alignment.TopStart).padding(40.dp))
                    Surface(
                        color = AuthPalette.Dark, shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(40.dp)
                    ) {
                        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            Text("THIẾT BỊ ĐÃ KÍCH HOẠT", color = AuthPalette.Dot, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text(state.storeName.ifBlank { "Chưa có chi nhánh" }, color = AuthPalette.Cream,
                                fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Column(
                Modifier.weight(if (wide) 0.523f else 1f).fillMaxHeight()
                    .verticalScroll(rememberScrollState()).padding(horizontal = if (wide) 40.dp else 24.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(sectionTitle, color = AuthPalette.Amber, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    AuthOutlinedAction(actionLabel, onAttendance, enabled = !state.isLoading)
                }
                Text(headline, color = AuthPalette.Ink, fontWeight = FontWeight.Bold, fontSize = 28.sp)
                if (!wide) Text(state.storeName.ifBlank { "Chưa có chi nhánh" }, color = AuthPalette.Muted, fontSize = 16.sp)
                AuthKeypadInput(
                    state.employeeCode, state.pin, state.activeField, state.isLoading,
                    onSelectField, onDigit, onBackspace, onClearAll,
                    loadingLabel = loadingLabel, error = state.errorMessage, showInputStatus = showInputStatus
                )
            }
        }
    }
}
