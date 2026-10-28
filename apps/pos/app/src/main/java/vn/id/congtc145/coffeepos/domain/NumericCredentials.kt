package vn.id.congtc145.coffeepos.domain

/** Transient input only: never persist this object or its PIN. */
data class NumericCredentials(
    val employeeCode: String = "",
    val pin: String = "",
    val activeField: String = "CODE"
) {
    val isComplete: Boolean get() = employeeCode.length == 7 && pin.length == 4

    fun select(field: String): NumericCredentials =
        if (field == "CODE" || field == "PIN") copy(activeField = field) else this

    fun append(digit: String): NumericCredentials {
        if (digit.length != 1 || digit[0] !in '0'..'9') return this
        return if (activeField == "CODE") {
            if (employeeCode.length >= 7) this else {
                val code = employeeCode + digit
                copy(employeeCode = code, pin = "", activeField = if (code.length == 7) "PIN" else "CODE")
            }
        } else {
            if (pin.length >= 4) this else copy(pin = pin + digit)
        }
    }

    fun backspace(): NumericCredentials = when {
        activeField == "PIN" && pin.isNotEmpty() -> copy(pin = pin.dropLast(1))
        else -> copy(employeeCode = employeeCode.dropLast(1), pin = "", activeField = "CODE")
    }

    fun clearAll(): NumericCredentials = NumericCredentials()

    fun clearSelected(): NumericCredentials = NumericCredentials()
}
