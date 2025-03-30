package org.bazelkls

import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.Opcodes
import java.io.File
import java.util.jar.JarFile

class JvmNameExtractor {
    data class SourceFileJvmMapping(
        val sourceFile: String,
        val jvmClassNames: Set<String>
    )

    companion object {
        fun extractMappings(classJars: List<String>): List<SourceFileJvmMapping> {
            val sourceToJvmMap = mutableMapOf<String, MutableSet<String>>()

            classJars.filter { it.isNotBlank() }.forEach { jarPath ->
                val jarFile = File(jarPath)
                if (jarFile.exists()) {
                    try {
                        scanJar(jarFile, sourceToJvmMap)
                    } catch (e: Exception) {
                        println("Error scanning jar $jarPath: ${e.message}")
                    }
                }
            }

            return sourceToJvmMap.map { (sourceFile, jvmNames) ->
                SourceFileJvmMapping(sourceFile, jvmNames)
            }
        }

        private fun scanJar(jarFile: File, sourceToJvmMap: MutableMap<String, MutableSet<String>>) {
            JarFile(jarFile).use { jar ->
                jar.entries().asSequence()
                    .filter { it.name.endsWith(".class") }
                    .forEach { entry ->
                        try {
                            jar.getInputStream(entry).use { input ->
                                val classBytes = input.readBytes()
                                processClass(classBytes, sourceToJvmMap)
                            }
                        } catch (e: Exception) {
                            println("Error processing class ${entry.name}: ${e.message}")
                        }
                    }
            }
        }

        private fun processClass(classBytes: ByteArray, sourceToJvmMap: MutableMap<String, MutableSet<String>>) {
            val classReader = ClassReader(classBytes)
            val jvmClassName = classReader.className.replace('/', '.')

            classReader.accept(object : ClassVisitor(Opcodes.ASM9) {
                override fun visitSource(source: String?, debug: String?) {
                    if (source != null) {
                        // Add this class to the source file mapping
                        sourceToJvmMap.computeIfAbsent(source) { mutableSetOf() }.add(jvmClassName)
                    }
                    super.visitSource(source, debug)
                }
            }, ClassReader.SKIP_FRAMES)
        }
    }
}