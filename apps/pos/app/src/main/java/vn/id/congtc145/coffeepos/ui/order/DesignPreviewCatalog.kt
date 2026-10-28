package vn.id.congtc145.coffeepos.ui.order

import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity

/** Ephemeral display data: never inserted into Room or sent to the API. */
internal object DesignPreviewCatalog {
    private val toppings = listOf(
        ToppingEntity("preview-t1", "Trân châu", 10_000),
        ToppingEntity("preview-t2", "Kem cheese", 15_000)
    )

    private val products = listOf(
        product("1", "CF01", "Cà phê đen đá", "Cà phê", 29_000),
        product("2", "CF02", "Cà phê sữa đá", "Cà phê", 35_000),
        product("3", "CF03", "Bạc xỉu", "Cà phê", 39_000),
        product("4", "CF04", "Cold brew", "Cà phê", 42_000),
        product("5", "CF05", "Caramel latte", "Cà phê", 49_000),
        product("6", "CF06", "Cappuccino", "Cà phê", 45_000, available = false),
        product("7", "TS01", "Trà sữa trân châu", "Trà sữa", 49_000),
        product("8", "TS02", "Trà đào cam sả", "Trà trái cây", 48_000),
        product("9", "BK01", "Croissant bơ", "Bánh & ăn nhẹ", 38_000)
    )

    private val variants = products.flatMap { product ->
        listOf(
            ProductVariantEntity("preview-${product.id}-m", product.id, "M", "M", product.basePrice, true),
            ProductVariantEntity("preview-${product.id}-l", product.id, "L", "L", product.basePrice + 8_000, false)
        )
    }

    fun initialState(): OrderUiState {
        val categories = products.map { it.category }.distinct()
        val heldBacXiu = OrderLineItem("preview-held-1", products[2],
            variants.first { it.productId == products[2].id && it.sizeLabel == "L" },
            toppings = listOf(SelectedTopping(toppings[0])), note = "Ít đá")
        val heldCoffee = OrderLineItem("preview-held-2", products[1],
            variants.first { it.productId == products[1].id })
        return OrderUiState(
            categories = categories,
            selectedCategory = categories.first(),
            allProducts = products,
            displayedProducts = products.filter { it.category == categories.first() },
            availableToppings = toppings,
            availableVariants = variants,
            cartItems = listOf(
                OrderLineItem("preview-line", products[1], variants.first { it.productId == products[1].id }, note = "Ít đá")
            ),
            heldOrders = listOf(
                DraftOrderEntity("T-023", "Khách mang đi", System.currentTimeMillis() - 2_280_000,
                    itemsJson = OrderJsonSerializer.serializeOrderItems(listOf(heldBacXiu)),
                    totalAmount = heldBacXiu.totalLinePrice),
                DraftOrderEntity("T-021", null, System.currentTimeMillis() - 6_000_000,
                    itemsJson = OrderJsonSerializer.serializeOrderItems(listOf(heldCoffee)),
                    totalAmount = heldCoffee.totalLinePrice)
            ),
            cashierName = "Minh Anh",
            storeAddressSummary = "Chi nhánh Thảo Điền",
            deviceCode = "PREVIEW",
            isOnline = true
        )
    }

    private fun product(id: String, code: String, name: String, category: String, price: Long, available: Boolean = true) =
        CatalogProduct(
            id = "preview-$id",
            code = code,
            name = name,
            categoryId = "preview-${category}",
            category = category,
            basePrice = price,
            taxRateBps = 0,
            isAvailable = available,
            description = "Dữ liệu minh họa giao diện",
            allowedToppingIdsJson = "[\"preview-t1\",\"preview-t2\"]"
        )
}
