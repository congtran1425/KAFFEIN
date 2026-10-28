package vn.id.congtc145.coffeepos.ui.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Money
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCream
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCreamSurface
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.SuccessGreen
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import java.text.NumberFormat
import java.util.Locale

@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel,
    onNavigateBack: () -> Unit,
    onPaymentSuccess: (receiptId: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CoffeeCream)
    ) {
        // TOP BAR
        Surface(
            color = CoffeeDarkRoast,
            shadowElevation = 4.dp,
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = Color.White
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Text(
                    text = "THANH TOÁN ĐƠN HÀNG",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
            }
        }

        // 2 CỘT NỘI DUNG: TÓM TẮT ĐƠN & PHƯƠNG THỨC THANH TOÁN
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(20.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // CỘT 1: TÓM TẮT ĐƠN HÀNG
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier
                    .weight(1.1f)
                    .fillMaxHeight()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp)
                ) {
                    Text(
                        text = "Chi tiết hóa đơn (${uiState.cartItems.sumOf { it.quantity }} món)",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = CoffeeDarkRoast
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(uiState.cartItems, key = { it.lineId }) { item ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${item.quantity}x ${item.product.name}",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = TextPrimary
                                    )
                                    Text(
                                        text = item.getCustomizationSummary(),
                                        fontSize = 11.sp,
                                        color = TextSecondary
                                    )
                                }
                                Text(
                                    text = currencyFormatter.format(item.totalLinePrice),
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 14.sp,
                                    color = CoffeeMocha
                                )
                            }
                            HorizontalDivider(
                                color = Color(0xFFF3F4F6),
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = Color(0xFFE5E7EB))
                    Spacer(modifier = Modifier.height(12.dp))

                    // Tổng kết tiền
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = "Tạm tính tiền hàng", fontSize = 13.sp, color = TextSecondary)
                            Text(text = currencyFormatter.format(uiState.subtotal), fontSize = 13.sp)
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = "Thuế VAT (Đã gồm trong giá)", fontSize = 12.sp, color = TextSecondary)
                            Text(text = currencyFormatter.format(uiState.totalVat), fontSize = 12.sp, color = TextSecondary)
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "TỔNG TIỀN PHẢI THU",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = CoffeeDarkRoast
                            )
                            Text(
                                text = currencyFormatter.format(uiState.totalAmount),
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                                color = CoffeeAmber
                            )
                        }
                    }
                }
            }

            // CỘT 2: CHỌN PHƯƠNG THỨC & THỰC HIỆN THANH TOÁN
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier
                    .weight(1.3f)
                    .fillMaxHeight()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        // TABS CHỌN PHƯƠNG THỨC THANH TOÁN
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            PaymentMethod.entries.forEach { method ->
                                val isSelected = uiState.selectedMethod == method
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (isSelected) CoffeeMocha else SurfaceOffWhite,
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        if (isSelected) CoffeeMocha else Color(0xFFE5E7EB)
                                    ),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(52.dp)
                                        .clickable { viewModel.selectPaymentMethod(method) }
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center
                                    ) {
                                        Icon(
                                            imageVector = when (method) {
                                                PaymentMethod.CASH -> Icons.Default.Money
                                                PaymentMethod.ZALOPAY_QR -> Icons.Default.QrCode
                                            PaymentMethod.MOMO_QR -> Icons.Default.QrCode
                                            },
                                            contentDescription = method.label,
                                            tint = if (isSelected) Color.White else CoffeeMocha,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = method.label,
                                            color = if (isSelected) Color.White else TextPrimary,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            fontSize = 13.sp
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // NỘI DUNG THEO PHƯƠNG THỨC
                        when (uiState.selectedMethod) {
                            PaymentMethod.CASH -> {
                                CashPaymentSection(
                                    uiState = uiState,
                                    currencyFormatter = currencyFormatter,
                                    onSelectAmount = { viewModel.setCashReceived(it) }
                                )
                            }
                            PaymentMethod.ZALOPAY_QR -> {
                                ZaloPayQrSection(
                                    totalAmount = uiState.totalAmount,
                                    currencyFormatter = currencyFormatter
                                )
                            }
                            PaymentMethod.MOMO_QR -> {
                                ZaloPayQrSection(
                                    totalAmount = uiState.totalAmount,
                                    currencyFormatter = currencyFormatter
                                )
                            }
                        }
                    }

                    // NÚT HOÀN TẤT THANH TOÁN
                    uiState.errorMessage?.let { message ->
                        Text(
                            text = message,
                            color = Color(0xFFB91C1C),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                    }
                    Button(
                        onClick = { viewModel.completePayment() },
                        enabled = when (uiState.selectedMethod) {
                            PaymentMethod.CASH -> uiState.isCashSufficient && !uiState.isSaving
                            PaymentMethod.ZALOPAY_QR -> false
                            PaymentMethod.MOMO_QR -> false
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                    ) {
                        Icon(Icons.Default.Print, contentDescription = null, tint = Color.White)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (uiState.isSaving) "ĐANG LƯU GIAO DỊCH..." else "HOÀN TẤT THANH TOÁN",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
        }
    }

    // DIALOG THÀNH CÔNG
    if (uiState.isCompleted) {
        Dialog(onDismissRequest = {}) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                modifier = Modifier.width(360.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFDCFCE7)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = SuccessGreen,
                            modifier = Modifier.size(40.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Thanh toán thành công!",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = CoffeeDarkRoast
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = "Giao dịch và outbox đã được lưu an toàn trên thiết bị.",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            uiState.savedReceiptId?.let(onPaymentSuccess)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(text = "XEM HÓA ĐƠN", fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
        }
    }
}

// ---------------- PHƯƠNG THỨC TIỀN MẶT ----------------
@Composable
fun CashPaymentSection(
    uiState: CheckoutUiState,
    currencyFormatter: NumberFormat,
    onSelectAmount: (Long) -> Unit
) {
    Column {
        Text(
            text = "GỢI Ý MỆNH GIÁ TIỀN MẶT",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = CoffeeMocha
        )

        Spacer(modifier = Modifier.height(10.dp))

        // Các mệnh giá gợi ý
        val suggestions = listOf(
            uiState.totalAmount to "Đúng giá",
            50000L to "50.000đ",
            100000L to "100.000đ",
            200000L to "200.000đ",
            500000L to "500.000đ"
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            suggestions.forEach { (amount, label) ->
                val isSelected = uiState.cashReceived == amount
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (isSelected) CoffeeAmber else SurfaceOffWhite,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp)
                        .clickable { onSelectAmount(amount) }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = label,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) Color.White else TextPrimary
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Ô hiển thị tiền khách đưa
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = SurfaceOffWhite,
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "Tiền khách đưa", fontSize = 15.sp, color = TextSecondary)
                Text(
                    text = currencyFormatter.format(uiState.cashReceived),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = CoffeeMocha
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Ô hiển thị tiền thừa trả khách
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = if (uiState.changeAmount > 0) Color(0xFFDCFCE7) else SurfaceOffWhite,
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                if (uiState.changeAmount > 0) Color(0xFF86EFAC) else Color(0xFFE5E7EB)
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Tiền thừa trả khách",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = if (uiState.changeAmount > 0) SuccessGreen else TextSecondary
                )
                Text(
                    text = currencyFormatter.format(uiState.changeAmount),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (uiState.changeAmount > 0) SuccessGreen else CoffeeDarkRoast
                )
            }
        }
    }
}

// ---------------- PHƯƠNG THỨC ZALOPAY / QR ----------------
@Composable
fun ZaloPayQrSection(
    totalAmount: Long,
    currencyFormatter: NumberFormat
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Huy hiệu trực tuyến
        Surface(
            color = Color(0xFFEFF6FF),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.padding(bottom = 12.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF3B82F6))
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "ZaloPay Online Gateway • Hết hạn sau 14:59",
                    color = Color(0xFF1D4ED8),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // Khung QR Code
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = Color.White,
            border = androidx.compose.foundation.BorderStroke(2.dp, CoffeeAmber),
            modifier = Modifier.size(190.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.QrCodeScanner,
                    contentDescription = "ZaloPay QR",
                    tint = CoffeeDarkRoast,
                    modifier = Modifier.size(130.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = "Quét để thanh toán: ${currencyFormatter.format(totalAmount)}",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = CoffeeMocha
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Nút trình chiếu màn hình phụ (Customer Presentation)
        Surface(
            color = SurfaceOffWhite,
            shape = RoundedCornerShape(8.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
            modifier = Modifier
                .clickable {}
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Tv, contentDescription = null, tint = CoffeeAmber, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(text = "Đang trình chiếu trên màn hình phụ (CFD)", fontSize = 12.sp, color = TextSecondary)
            }
        }
    }
}

// ---------------- PHƯƠNG THỨC THẺ ----------------
@Composable
fun CardPaymentSection() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.CreditCard,
            contentDescription = null,
            tint = CoffeeMocha,
            modifier = Modifier.size(60.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = "Vui lòng quẹt thẻ hoặc chạm thẻ trên thiết bị thanh toán POS",
            fontSize = 14.sp,
            color = TextSecondary
        )
    }
}
