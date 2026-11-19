package com.meetos.android.analysis

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/**
 * Grounding — port of packages/shared/src/grounding.ts. Every AI item must be
 * backed by text that exists in the transcript; owners must be real people
 * from the meeting; deadlines are resolved from the words actually spoken.
 */
object Grounding {
    data class Quote(val quote: String, val speaker: String?, val exact: Boolean)

    fun groundQuote(quote: String?, source: String): Quote? {
        if (quote.isNullOrBlank()) return null
        val nq = Text.normalize(quote)
        if (nq.length < 4) return null
        val lines = Transcript.parse(source)
        for (l in lines) {
            if (Text.normalize(l.raw).contains(nq) || Text.normalize(l.text).contains(nq)) {
                return Quote(quote.trim().trim('"', '\''), l.speaker, true)
            }
        }
        if (Text.normalize(source).contains(nq)) {
            val first = lines.firstOrNull { nq.startsWith(Text.normalize(it.text).take(20)) }
            return Quote(quote.trim(), first?.speaker, true)
        }
        val best = lines.maxByOrNull { Text.containment(quote, it.text) } ?: return null
        return if (Text.containment(quote, best.text) >= 0.75) Quote(best.text, best.speaker, false) else null
    }

    private val NOBODY = setOf("unknown", "unassigned", "none", "n/a", "null", "team", "everyone", "we", "us")
    private val SELF = setOf("i", "me", "myself", "speaker")

    fun resolveOwner(owner: String?, knownNames: List<String>, source: String, evidenceSpeaker: String?): String? {
        val raw = owner?.trim().orEmpty()
        if (raw.isEmpty()) return null
        val lower = raw.lowercase()
        if (lower in NOBODY) return null
        if (lower in SELF) return evidenceSpeaker
        knownNames.firstOrNull { it.lowercase() == lower }?.let { return it }
        val first = lower.split(Regex("\\s+")).first()
        val firstMatches = knownNames.filter { it.lowercase().split(Regex("\\s+")).first() == first }
        if (firstMatches.size == 1) return firstMatches.first()
        if (Text.containsWord(source, raw)) return raw
        return null
    }

    data class Deadline(val at: Long?, val text: String?)

    /**
     * Resolve a spoken deadline phrase relative to the meeting date. Phrases
     * that don't appear in the source are discarded rather than invented.
     */
    fun resolveDeadline(text: String?, referenceMillis: Long, source: String, zone: ZoneId = ZoneId.systemDefault()): Deadline {
        val t = text?.trim().orEmpty()
        if (t.isEmpty() || t.lowercase() in setOf("none", "null", "n/a", "unknown", "no deadline")) return Deadline(null, null)
        if (!Text.normalize(source).contains(Text.normalize(t)) && Text.containment(t, source) < 0.99) return Deadline(null, null)
        val ref = Instant.ofEpochMilli(referenceMillis).atZone(zone).toLocalDate()
        val date = parseDate(t.lowercase(), ref) ?: return Deadline(null, t)
        return Deadline(date.atTime(LocalTime.of(23, 59)).atZone(zone).toInstant().toEpochMilli(), t)
    }

    private val DAYS = mapOf(
        "monday" to DayOfWeek.MONDAY, "tuesday" to DayOfWeek.TUESDAY, "wednesday" to DayOfWeek.WEDNESDAY,
        "thursday" to DayOfWeek.THURSDAY, "friday" to DayOfWeek.FRIDAY, "saturday" to DayOfWeek.SATURDAY, "sunday" to DayOfWeek.SUNDAY,
    )
    private val MONTHS = listOf("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december")
    private val NUMBERS = mapOf("one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5, "six" to 6, "a" to 1, "an" to 1)

    internal fun parseDate(t: String, ref: LocalDate): LocalDate? {
        if (Regex("\\b(today|tonight|end of (the )?day|eod)\\b").containsMatchIn(t)) return ref
        if (Regex("\\btomorrow\\b").containsMatchIn(t)) return ref.plusDays(1)
        if (Regex("end of (the )?week").containsMatchIn(t)) return ref.with(TemporalAdjusters.nextOrSame(DayOfWeek.FRIDAY))
        if (Regex("end of (the )?month").containsMatchIn(t)) return ref.with(TemporalAdjusters.lastDayOfMonth())
        if (Regex("\\bnext week\\b").containsMatchIn(t)) return ref.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).plusDays(4)
        Regex("\\bin (\\d+|one|two|three|four|five|six|a|an) (day|week)s?\\b").find(t)?.let { m ->
            val n = m.groupValues[1].toIntOrNull() ?: NUMBERS[m.groupValues[1]] ?: return null
            return if (m.groupValues[2] == "day") ref.plusDays(n.toLong()) else ref.plusWeeks(n.toLong())
        }
        for ((name, dow) in DAYS) {
            if (Regex("\\bnext $name\\b").containsMatchIn(t)) {
                // "next Tuesday" = the Tuesday of next week, unless that is more than 7 days away from this week's.
                val thisOne = ref.with(TemporalAdjusters.next(dow))
                return if (thisOne.isBefore(ref.with(TemporalAdjusters.next(DayOfWeek.MONDAY)))) thisOne.plusWeeks(1) else thisOne
            }
            if (Regex("\\b$name\\b").containsMatchIn(t)) return ref.with(TemporalAdjusters.next(dow))
        }
        Regex("\\b(${MONTHS.joinToString("|")})\\s+(\\d{1,2})(st|nd|rd|th)?\\b").find(t)?.let { m ->
            val month = MONTHS.indexOf(m.groupValues[1]) + 1
            val day = m.groupValues[2].toInt()
            val candidate = runCatching { LocalDate.of(ref.year, month, day) }.getOrNull() ?: return null
            return if (candidate.isBefore(ref)) candidate.plusYears(1) else candidate
        }
        return null
    }
}
