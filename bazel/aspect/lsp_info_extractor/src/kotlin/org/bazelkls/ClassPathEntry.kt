package org.bazelkls

data class ClassPathEntry(
    val compile_jar: String ? = null,
    val source_jar: String ? = null
)