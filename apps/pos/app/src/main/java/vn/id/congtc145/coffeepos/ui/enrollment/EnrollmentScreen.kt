package vn.id.congtc145.coffeepos.ui.enrollment

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCream
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast

@Composable
fun EnrollmentScreen(
    viewModel: EnrollmentViewModel,
    onEnrollmentSuccess: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .background(CoffeeCream),
        color = CoffeeCream
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Column(modifier = Modifier.widthIn(max = 560.dp)) {
                Text(
                    text = "KÍCH HOẠT MÁY POS",
                    color = CoffeeDarkRoast,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Thao tác này chỉ thực hiện một lần. Mã kích hoạt do Owner tạo trên hệ thống quản trị.",
                    color = CoffeeDarkRoast.copy(alpha = 0.72f),
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.height(24.dp))
                OutlinedTextField(
                    value = state.activationCode,
                    onValueChange = viewModel::updateActivationCode,
                    label = { Text("Mã kích hoạt") },
                    singleLine = true,
                    enabled = !state.isLoading,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.displayName,
                    onValueChange = viewModel::updateDisplayName,
                    label = { Text("Tên thiết bị") },
                    singleLine = true,
                    enabled = !state.isLoading,
                    modifier = Modifier.fillMaxWidth()
                )
                state.errorMessage?.let {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = it, color = Color(0xFFB91C1C), fontSize = 13.sp)
                }
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = { viewModel.enroll(onEnrollmentSuccess) },
                    enabled = !state.isLoading,
                    colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(color = Color.White)
                    } else {
                        Text("KÍCH HOẠT", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
