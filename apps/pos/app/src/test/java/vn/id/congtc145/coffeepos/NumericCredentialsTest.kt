package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.NumericCredentials

class NumericCredentialsTest {
    @Test fun sevenDigitsSelectPinAndFourPinDigitsCompleteExactlyOnce() {
        var input = NumericCredentials()
        "1000001".forEach { input = input.append(it.toString()) }
        assertEquals("PIN", input.activeField)
        assertFalse(input.isComplete)
        "1234".forEach { input = input.append(it.toString()) }
        assertTrue(input.isComplete)
        assertEquals(input, input.append("5"))
    }

    @Test fun rejectsNonAsciiDigitsAndMultiCharacterEvents() {
        val input = NumericCredentials()
        listOf("１２", "١", "A", "", "12").forEach { assertEquals(input, input.append(it)) }
    }

    @Test fun clearAllClearsBothEmployeeCodeAndPin() {
        val input = NumericCredentials("1000001", "12", "PIN")
        assertEquals(NumericCredentials(), input.clearAll())
        assertEquals(NumericCredentials(), input.clearSelected())
        assertEquals(NumericCredentials(), input.select("CODE").clearAll())
    }

    @Test fun backspaceFromEmptyPinRemovesCodeDigitImmediately() {
        assertEquals(NumericCredentials("100000", "", "CODE"),
            NumericCredentials("1000001", "", "PIN").backspace())
    }

    @Test fun changingCodeNeverReusesPreviousPin() {
        val input = NumericCredentials("1000001", "1234", "CODE").backspace().append("2")
        assertEquals("1000002", input.employeeCode)
        assertEquals("", input.pin)
        assertFalse(input.isComplete)
    }

    @Test fun failedCompleteInputCanBeEditedAndCompletedAgain() {
        val input = NumericCredentials("1000001", "1234", "PIN")
        assertTrue(input.backspace().append("5").isComplete)
        assertEquals("1235", input.backspace().append("5").pin)
        assertEquals(input, input.select("INVALID"))
    }
}
