package vn.id.congtc145.coffeepos.ui.attendance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.data.sync.DeviceHeartbeatCoordinator
import vn.id.congtc145.coffeepos.ui.components.*

@Composable
fun AttendanceScreen(viewModel: AttendanceViewModel, onNavigateBack: () -> Unit) {
    val state by viewModel.uiState.collectAsState()
    val online by DeviceHeartbeatCoordinator.isOnline.collectAsState()
    LaunchedEffect(Unit) { viewModel.resetAction() }
    DisposableEffect(viewModel) { onDispose { viewModel.leaveScreen() } }
    BackHandler(state.selectedAction != null && !state.isLoading) { viewModel.resetAction() }
    AttendanceScreenContent(
        state, viewModel.storeName, online, onNavigateBack,
        viewModel::selectAction, viewModel::resetAction, viewModel::selectField,
        viewModel::appendDigit, viewModel::backspace, viewModel::clearAll
    )
    state.successMessage?.let { message ->
        AlertDialog(
            onDismissRequest = viewModel::clearSuccess,
            title = { Text(message, color = AuthPalette.Ink, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.lastRecordedEmployee.orEmpty(), color = AuthPalette.Ink, fontWeight = FontWeight.Bold)
                    Text(state.lastRecordedStore.orEmpty(), color = AuthPalette.Muted)
                    Text(state.lastRecordedTime.orEmpty(), color = AuthPalette.Muted)
                    if (state.isSupport) Text("Hỗ trợ chi nhánh", color = AuthPalette.Amber)
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.clearSuccess(); onNavigateBack() }) { Text("Hoàn tất", color = AuthPalette.Green) }
            },
            containerColor = AuthPalette.Surface
        )
    }
}

@Composable
fun AttendanceScreenContent(
    state: AttendanceUiState,
    storeName: String,
    isOnline: Boolean?,
    onBack: () -> Unit,
    onSelectAction: (AttendanceActionType) -> Unit,
    onResetAction: () -> Unit,
    onSelectField: (String) -> Unit,
    onDigit: (String) -> Unit,
    onBackspace: () -> Unit,
    onClearAll: () -> Unit
) {
    Surface(color = AuthPalette.Paper, modifier = Modifier.fillMaxSize()) {
        Column {
            AttendanceHeader(storeName, isOnline)
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                val wide = maxWidth >= 800.dp
                val action = state.selectedAction
                if (action == null) {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                            .padding(horizontal = if (wide) 96.dp else 24.dp, vertical = 40.dp),
                        verticalArrangement = Arrangement.spacedBy(40.dp)
                    ) {
                        Text("Chấm công", color = AuthPalette.Ink, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(if (wide) 40.dp else 0.dp))
                        if (wide) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 70.dp),
                                horizontalArrangement = Arrangement.spacedBy(40.dp)) {
                                AttendanceActionCard(AttendanceActionType.CHECK_IN, isOnline != false,
                                    { onSelectAction(AttendanceActionType.CHECK_IN) }, Modifier.weight(1f))
                                AttendanceActionCard(AttendanceActionType.CHECK_OUT, isOnline != false,
                                    { onSelectAction(AttendanceActionType.CHECK_OUT) }, Modifier.weight(1f))
                            }
                        } else {
                            AttendanceActionCard(AttendanceActionType.CHECK_IN, isOnline != false,
                                { onSelectAction(AttendanceActionType.CHECK_IN) })
                            AttendanceActionCard(AttendanceActionType.CHECK_OUT, isOnline != false,
                                { onSelectAction(AttendanceActionType.CHECK_OUT) })
                        }
                        AuthOutlinedAction("←  Quay lại", onBack)
                    }
                } else if (wide) {
                    Row(Modifier.fillMaxSize().padding(horizontal = 30.dp, vertical = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(44.dp)) {
                        Column(Modifier.weight(0.46f).fillMaxHeight().padding(start = 22.dp, top = 32.dp),
                            verticalArrangement = Arrangement.SpaceBetween) {
                            AttendanceContext(action, storeName)
                            AuthOutlinedAction("←  Chọn thao tác khác", onResetAction,
                                Modifier.fillMaxWidth(), enabled = !state.isLoading)
                        }
                        CredentialPanel(state, isOnline, onSelectField, onDigit, onBackspace, onClearAll,
                            Modifier.weight(0.54f).fillMaxHeight())
                    }
                } else {
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp)) {
                        Text(if (action == AttendanceActionType.CHECK_IN) "Xác thực vào ca" else "Xác thực ra ca",
                            color = AuthPalette.Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                        CredentialPanel(state, isOnline, onSelectField, onDigit, onBackspace, onClearAll)
                        AuthOutlinedAction("←  Chọn thao tác khác", onResetAction, enabled = !state.isLoading)
                    }
                }
            }
        }
    }
}

@Composable
private fun AttendanceActionCard(action: AttendanceActionType, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val checkIn = action == AttendanceActionType.CHECK_IN
    Surface(color = AuthPalette.Surface, shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, AuthPalette.Border), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            ActionIcon(checkIn)
            Text(if (checkIn) "Vào ca" else "Ra ca", color = AuthPalette.Ink, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(30.dp))
            Button(
                onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (checkIn) AuthPalette.Green else AuthPalette.Amber,
                    contentColor = AuthPalette.Surface)
            ) { Text(if (checkIn) "Chọn vào ca  →" else "Chọn ra ca  →", fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1) }
        }
    }
}

@Composable
private fun ActionIcon(checkIn: Boolean) {
    val icon: ImageVector = if (checkIn) Icons.AutoMirrored.Filled.Login else Icons.AutoMirrored.Filled.Logout
    Surface(color = if (checkIn) AuthPalette.Soft else AuthPalette.AmberSoft, shape = RoundedCornerShape(16.dp)) {
        Icon(icon, null, Modifier.size(64.dp).padding(16.dp),
            tint = if (checkIn) AuthPalette.Green else AuthPalette.Amber)
    }
}

@Composable
private fun AttendanceContext(action: AttendanceActionType, storeName: String) {
    val checkIn = action == AttendanceActionType.CHECK_IN
    Column(verticalArrangement = Arrangement.spacedBy(40.dp)) {
        Text(if (checkIn) "Xác thực vào ca" else "Xác thực ra ca", color = AuthPalette.Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Surface(color = AuthPalette.Surface, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, AuthPalette.Border)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    ActionIcon(checkIn)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (checkIn) "VÀO CA" else "RA CA", color = if (checkIn) AuthPalette.Green else AuthPalette.Amber,
                            fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text(if (checkIn) "Bắt đầu ghi nhận giờ làm" else "Kết thúc ca đang mở",
                            color = AuthPalette.Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                }
                HorizontalDivider(color = AuthPalette.Border)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Địa điểm", color = AuthPalette.Muted, fontSize = 13.sp)
                    Text(storeName.ifBlank { "Chưa kích hoạt" }, color = AuthPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Thời gian", color = AuthPalette.Muted, fontSize = 13.sp)
                    Text("Do máy chủ ghi nhận", color = AuthPalette.Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun CredentialPanel(
    state: AttendanceUiState, isOnline: Boolean?, onSelectField: (String) -> Unit, onDigit: (String) -> Unit,
    onBackspace: () -> Unit, onClearAll: () -> Unit, modifier: Modifier = Modifier
) {
    Surface(color = AuthPalette.Surface, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, AuthPalette.Border),
        modifier = modifier.fillMaxWidth()) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 30.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp)) {
            Text("Nhập thông tin nhân viên", color = AuthPalette.Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            AuthKeypadInput(
                state.employeeCode, state.pin, state.activeField, state.isLoading || isOnline == false,
                onSelectField, onDigit, onBackspace, onClearAll,
                loadingLabel = if (state.selectedAction == AttendanceActionType.CHECK_IN) "Đang vào ca" else "Đang ra ca",
                error = state.errorMessage,
                // Offline disables input, but is NOT a submission or a success.
                submitting = state.isLoading
            )
        }
    }
}
