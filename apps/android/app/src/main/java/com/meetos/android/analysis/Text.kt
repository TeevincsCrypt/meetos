package com.meetos.android.analysis

import java.text.Normalizer

/** Text utilities — a direct port of packages/shared/src/text.ts. */
object Text {
    private val STOPWORDS = (
        "a an the and or but if then so to of in on at by for with from as is are was were be been being " +
            "it its this that these those i me my we our us you your he she they them their his her " +
            "will would shall should can could may might must do does did done have has had not no yes " +
            "just about into over under up down out off than too very also there here what which who whom " +
            "when where why how all any each few more most other some such only own same s t ll re ve d m " +
            "okay ok yeah um uh like going gonna get got let lets"
        ).split(Regex("\\s+")).toSet()

    fun normalize(text: String): String =
        Normalizer.normalize(text.lowercase(), Normalizer.Form.NFKD)
            .replace(Regex("\\p{M}"), "")
            .replace('’', '\'').replace('‘', '\'')
            .replace(Regex("[^a-z0-9'\\s]"), " ")
            .replace("'", "")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun stem(w: String): String = when {
        w.length > 5 && w.endsWith("ing") -> w.dropLast(3)
        w.length > 4 && w.endsWith("ed") -> w.dropLast(2)
        w.length > 4 && w.endsWith("es") -> w.dropLast(2)
        w.length > 3 && w.endsWith("s") && !w.endsWith("ss") -> w.dropLast(1)
        else -> w
    }

    fun tokens(text: String): List<String> =
        normalize(text).split(' ').filter { it.length > 1 && it !in STOPWORDS }.map(::stem)

    fun tokenSet(text: String): Set<String> = tokens(text).toSet()

    fun jaccard(a: String, b: String): Double {
        val x = tokenSet(a); val y = tokenSet(b)
        if (x.isEmpty() || y.isEmpty()) return 0.0
        val inter = x.count { it in y }
        return inter.toDouble() / (x.size + y.size - inter)
    }

    fun containment(needle: String, haystack: String): Double {
        val n = tokenSet(needle)
        if (n.isEmpty()) return 0.0
        val h = tokenSet(haystack)
        return n.count { it in h }.toDouble() / n.size
    }

    fun similarity(a: String, b: String): Double =
        maxOf(jaccard(a, b), 0.85 * minOf(containment(a, b), containment(b, a)))

    fun taskSimilarity(a: String, b: String): Double {
        val x = tokenSet(a); val y = tokenSet(b)
        if (minOf(x.size, y.size) < 2) return jaccard(a, b)
        return maxOf(jaccard(a, b), 0.8 * maxOf(containment(a, b), containment(b, a)))
    }

    fun personKey(name: String?): String? = name?.let(::normalize)?.takeIf { it.isNotEmpty() }

    fun containsWord(haystack: String, word: String): Boolean {
        val w = word.trim()
        if (w.isEmpty()) return false
        return Regex("(^|[^\\p{L}\\p{N}])${Regex.escape(w)}($|[^\\p{L}\\p{N}])", RegexOption.IGNORE_CASE).containsMatchIn(haystack)
    }
}
