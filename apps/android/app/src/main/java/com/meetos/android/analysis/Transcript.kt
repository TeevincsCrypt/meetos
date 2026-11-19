package com.meetos.android.analysis

/**
 * Transcript parsing and chunking — port of packages/shared/src/transcript.ts.
 * Gemini Nano on Android has a small context window, so chunks stay short.
 */
object Transcript {
    const val DEFAULT_CHUNK_CHARS = 2_400
    const val MAX_TRANSCRIPT_CHARS = 400_000

    data class Line(val index: Int, val speaker: String?, val text: String, val raw: String)
    data class Chunk(val index: Int, val text: String, val startLine: Int, val endLine: Int)

    private val SPEAKER = Regex(
        "^\\s*(?:\\[?\\(?\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d+)?\\)?\\]?\\s*[-–]?\\s*)?" +
            "([A-Z][\\p{L}.'-]*(?:\\s+[A-Z][\\p{L}.'-]*){0,3}|Speaker\\s*\\d+)\\s*(?:\\(\\s*[^)]{0,30}\\))?\\s*:\\s+(.+)$",
    )

    fun normalize(text: String): String =
        text.removePrefix("﻿")
            .replace("\r\n", "\n").replace('\r', '\n')
            .replace('\t', ' ').replace(' ', ' ')
            .lines().joinToString("\n") { it.trimEnd() }
            .replace(Regex("\n{3,}"), "\n\n")
            .trim()

    fun parseLine(raw: String, index: Int): Line {
        val m = SPEAKER.find(raw)
        return if (m != null) Line(index, m.groupValues[1].trim(), m.groupValues[2].trim(), raw)
        else Line(index, null, raw.trim(), raw)
    }

    fun parse(text: String): List<Line> =
        normalize(text).split('\n').mapIndexed { i, l -> parseLine(l, i) }.filter { it.text.isNotEmpty() }

    fun speakers(text: String): List<String> {
        val seen = LinkedHashMap<String, String>()
        for (l in parse(text)) l.speaker?.let { seen.putIfAbsent(it.lowercase(), it) }
        return seen.values.toList()
    }

    private fun splitLong(text: String, max: Int): List<String> {
        val sentences = Regex("[^.!?]+[.!?]+[\"')\\]]*\\s*|[^.!?]+$").findAll(text).map { it.value }.toList().ifEmpty { listOf(text) }
        val out = mutableListOf<String>()
        var cur = StringBuilder()
        for (s in sentences) {
            if (cur.length + s.length > max && cur.isNotEmpty()) { out += cur.toString().trim(); cur = StringBuilder() }
            if (s.length > max) { s.chunked(max).forEach { out += it.trim() }; continue }
            cur.append(s)
        }
        if (cur.isNotBlank()) out += cur.toString().trim()
        return out
    }

    fun chunk(text: String, maxChars: Int = DEFAULT_CHUNK_CHARS, overlapLines: Int = 1): List<Chunk> {
        val max = maxOf(400, maxChars)
        val lines = normalize(text).split('\n').filter { it.isNotBlank() }
            .flatMap { if (it.length <= max) listOf(it) else splitLong(it, max) }
        val chunks = mutableListOf<Chunk>()
        var start = 0
        while (start < lines.size) {
            var end = start
            var size = 0
            while (end < lines.size && (size + lines[end].length + 1 <= max || end == start)) {
                size += lines[end].length + 1
                end++
            }
            chunks += Chunk(chunks.size, lines.subList(start, end).joinToString("\n"), start, end - 1)
            if (end >= lines.size) break
            start = maxOf(start + 1, end - overlapLines)
        }
        return chunks
    }
}
