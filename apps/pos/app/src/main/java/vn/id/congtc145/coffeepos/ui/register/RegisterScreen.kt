package vn.id.congtc145.coffeepos.ui.register

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import org.json.JSONObject
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.domain.CashCountInput
import vn.id.congtc145.coffeepos.ui.components.AuthPalette
import vn.id.congtc145.coffeepos.ui.login.LoginScreenContent
import vn.id.congtc145.coffeepos.ui.login.LoginViewModel
import vn.id.congtc145.coffeepos.ui.reference.money
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun RegisterScreen(viewModel: RegisterViewModel, onBack: () -> Unit, mode: String = "DEFAULT", onHandoverComplete: () -> Unit = onBack) {
    val state by viewModel.uiState.collectAsState()
    val session = state.openSession
    val initialMode = remember(mode, state.isLoaded) { when {
        mode == "HANDOVER" -> CashCountMode.HANDOVER
        mode == "END_OF_DAY" || session != null -> CashCountMode.CLOSE
        else -> CashCountMode.OPEN
    } }
    val countMode = when (session?.closingMode) { "HANDOVER" -> CashCountMode.HANDOVER; "END_OF_DAY" -> CashCountMode.CLOSE; else -> initialMode }
    var authenticated by remember(mode, state.cashierCode) { mutableStateOf(false) }
    var input by remember(mode) { mutableStateOf(CashCountInput()) }
    var compensation by remember(session?.id) { mutableStateOf(CashCountInput()) }
    var reviewOpen by remember(mode) { mutableStateOf(false) }
    var completed by remember(mode) { mutableStateOf(false) }
    var lastCompletion by remember { mutableLongStateOf(state.completedOperation) }
    val context = LocalContext.current
    val store = remember { DeviceCredentialStore(context).load() }
    LaunchedEffect(mode) { viewModel.clearFeedback() }
    LaunchedEffect(state.completedOperation) {
        if (state.completedOperation > lastCompletion) { lastCompletion = state.completedOperation; reviewOpen = false; completed = true }
    }
    if (!state.isLoaded) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return }
    if (completed) {
        AlertDialog(onDismissRequest = {}, title = { Text("Đã hoàn tất", fontWeight = FontWeight.Bold) },
            text = { Text("Phiên tiền mặt đã được lưu.") }, confirmButton = {
                Button(onClick = { viewModel.clearFeedback(); if (initialMode == CashCountMode.OPEN) onBack() else onHandoverComplete() }) { Text("Hoàn tất") }
            })
        return
    }
    if (session == null && mode in setOf("HANDOVER", "END_OF_DAY")) {
        Column(Modifier.fillMaxSize().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("Chưa có phiên quỹ đang mở", fontWeight = FontWeight.Bold)
            TextButton(onClick = onBack) { Text("Quay lại") }
        }
        return
    }
    if (!authenticated) {
        val auth: LoginViewModel = viewModel(key = "cash-count-auth-$mode")
        val authState by auth.uiState.collectAsState()
        LaunchedEffect(auth) { auth.clearAll(); auth.refreshDeviceIdentity() }
        DisposableEffect(auth) { onDispose { auth.leaveScreen() } }
        LoginScreenContent(authState, onAttendance = onBack,
            onDigit = { digit -> auth.appendVerificationDigit(digit, state.cashierCode) { name, code ->
                viewModel.setCashier(code, name); authenticated = true
            } }, onSelectField = auth::selectField, onBackspace = auth::backspace, onClearAll = auth::clearAll,
            sectionTitle = "XÁC THỰC THU NGÂN", headline = countMode.title, actionLabel = "Quay lại", showInputStatus = false, loadingLabel = "Đang xác thực")
        return
    }
    val sessionLabel = session?.let { "Mở lúc " + DateTimeFormatter.ofPattern("HH:mm · dd/MM")
        .withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(Instant.ofEpochMilli(it.openedAt)) }
    val frozen = session?.actualCashVnd != null
    val variance = session?.varianceVnd ?: 0
    if (frozen && variance < 0) {
        CashCountLayout(countMode, compensation, { compensation = it }, null, state.cashierName, store?.storeName.orEmpty(),
            "Quỹ thiếu: -${money(-variance)}", state.isSaving, state.errorMessage, onBack,
            onReview = { viewModel.close(compensation.counts) }, shortage = -variance,
            title = "Nộp tiền bù quỹ két thiếu", actionLabel = "Xác nhận nộp bù & hoàn tất")
        return
    }
    val frozenInput = remember(session?.id, session?.closingDenominationsJson) {
        val obj = JSONObject(session?.closingDenominationsJson ?: "{}")
        CashCountInput(counts = obj.keys().asSequence().associate { it.toLong() to obj.getInt(it) })
    }
    CashCountLayout(countMode, if (frozen) frozenInput else input, { if (!frozen) input = it }, null,
        state.cashierName, store?.storeName.orEmpty(), sessionLabel, state.isSaving, state.errorMessage, onBack,
        onReview = { if (countMode == CashCountMode.OPEN) reviewOpen = true
            else if (!frozen) viewModel.reconcile(input.counts, if (countMode == CashCountMode.HANDOVER) "HANDOVER" else "END_OF_DAY") }, actionEnabled = !frozen)
    if (reviewOpen || frozen) {
        AlertDialog(onDismissRequest = { if (!frozen && !state.isSaving) reviewOpen = false },
            title = { Text(countMode.confirmLabel, fontWeight = FontWeight.Bold) }, text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(state.cashierName, fontWeight = FontWeight.Bold)
                    Text(store?.storeName.orEmpty())
                    Text("${if (countMode == CashCountMode.OPEN) "Tiền đầu ca" else "Thực đếm"}: ${money(if (frozen) session!!.actualCashVnd!! else input.total)}", fontWeight = FontWeight.Bold)
                    state.errorMessage?.let { Text(it, color = AuthPalette.Error) }
                }
            }, confirmButton = {
                Button(onClick = { if (countMode == CashCountMode.OPEN) viewModel.open(input.total, input.counts) else viewModel.close() }, enabled = !state.isSaving) {
                    Text(if (state.isSaving) "Đang lưu…" else "Xác nhận")
                }
            }, dismissButton = {
                if (!frozen) TextButton(onClick = { reviewOpen = false }, enabled = !state.isSaving) { Text("Kiểm đếm lại") }
            })
    }
}