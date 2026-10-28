package vn.id.congtc145.coffeepos.data.local

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import vn.id.congtc145.coffeepos.data.local.entity.ProductCategoryEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity

object DatabaseSeeder {
    suspend fun seedIfNeeded(database: AppDatabase) = withContext(Dispatchers.IO) {
        val catalogDao = database.catalogDao()
        if (catalogDao.getProductCount() == 0) {
            catalogDao.insertCategories(
                listOf(
                    ProductCategoryEntity("cat-coffee", "Cà Phê", taxRateBps = 0, sortOrder = 1),
                    ProductCategoryEntity("cat-milk-tea", "Trà Sữa", taxRateBps = 0, sortOrder = 2),
                    ProductCategoryEntity("cat-fruit-tea", "Trà Trái Cây", taxRateBps = 0, sortOrder = 3),
                    ProductCategoryEntity("cat-cake", "Bánh Ngọt", taxRateBps = 0, sortOrder = 4)
                )
            )
            val sampleProducts = listOf(
                // Cà phê
                ProductEntity("p1", "CF01", "Cà Phê Đen Đá", "cat-coffee", 29000, true, "Đậm đà Robusta Buôn Ma Thuột"),
                ProductEntity("p2", "CF02", "Cà Phê Sữa Đá", "cat-coffee", 35000, true, "Cà phê phin truyền thống hòa quyện sữa đặc"),
                ProductEntity("p3", "CF03", "Bạc Xỉu 3 Tầng", "cat-coffee", 39000, true, "Nhiều sữa, ít đắng, thơm béo dịu nhẹ"),
                ProductEntity("p4", "CF04", "Espresso Macchiato", "cat-coffee", 42000, true, "Double espresso điểm chút bọt sữa nóng"),
                ProductEntity("p5", "CF05", "Caramel Macchiato", "cat-coffee", 55000, true, "Vị ngọt dịu của sốt caramel thơm lừng"),
                ProductEntity("p6", "CF06", "Cà Phê Muối Huế", "cat-coffee", 45000, true, "Lớp kem muối mằn mặn đặc trưng"),

                // Trà & Trà Sữa
                ProductEntity("p7", "TS01", "Trà Sữa Trân Châu Đường Đen", "cat-milk-tea", 49000, true, "Trà sữa đậm đà kèm trân châu nấu đường đen"),
                ProductEntity("p8", "TS02", "Trà Sữa Oolong Nướng", "cat-milk-tea", 45000, true, "Hương trà rang nướng độc đáo, béo ngậy"),
                ProductEntity("p9", "TS03", "Trà Đào Cam Sả", "cat-fruit-tea", 48000, true, "Vị đào thanh mát, sả thơm giải nhiệt"),
                ProductEntity("p10", "TS04", "Trà Vải Hoa Hồng", "cat-fruit-tea", 52000, true, "Trà lài ướp hoa hồng cùng trái vải mọng nước"),
                ProductEntity("p11", "TS05", "Matcha Latte Nhật Bản", "cat-milk-tea", 55000, true, "Bột trà xanh Uji Kyoto thơm dịu mát"),

                // Bánh & Ăn Kèm
                ProductEntity("p12", "BK01", "Croissant Bơ Tỏi", "cat-cake", 38000, true, "Bánh sừng bò nướng giòn thơm bơ Pháp"),
                ProductEntity("p13", "BK02", "Tiramisu Cacao", "cat-cake", 49000, true, "Bánh mousse mascarpone cà phê Ý"),
                ProductEntity("p14", "BK03", "Cheesecake Chanh Dây", "cat-cake", 49000, true, "Phô mai béo ngậy xen kẽ chanh dây chua ngọt")
            )
            catalogDao.insertProducts(sampleProducts)

            val sampleToppings = listOf(
                ToppingEntity("t1", "Trân châu đường đen", 10000, true),
                ToppingEntity("t2", "Trân châu hoàng kim", 10000, true),
                ToppingEntity("t3", "Kem Cheese Macchiato", 15000, true),
                ToppingEntity("t4", "Thạch đào giòn", 10000, true),
                ToppingEntity("t5", "Pudding Trứng", 12000, true),
                ToppingEntity("t6", "Thạch nha đam", 8000, true)
            )
            catalogDao.insertToppings(sampleToppings)
        }
    }
}
