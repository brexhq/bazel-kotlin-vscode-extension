package org.bazelkls

import java.io.File
import java.util.jar.JarFile

/**
 * Extracts package to source jar mappings
 */
object PackageInfoExtractor {

    data class PackageSourceMapping(
        val packageName: String,
        val sourceJarPath: String
    )

    /**
     * Extract package to source jar mappings
     */
    fun extractPackageMappings(jarFile: File, sourceJarPath: String?): List<PackageSourceMapping> {
        if (sourceJarPath == null || sourceJarPath.isEmpty()) {
            return emptyList()
        }

        val packages = mutableSetOf<String>()

        try {
            JarFile(jarFile).use { jar ->
                jar.entries().asSequence()
                    .filter { it.name.endsWith(".class") }
                    .forEach { entry ->
                        try {
                            // Extract package from class file path
                            val classPath = entry.name.removeSuffix(".class")
                            val packagePath = classPath.substringBeforeLast("/", "")

                            if (packagePath.isNotEmpty()) {
                                val packageName = packagePath.replace('/', '.')
                                packages.add(packageName)
                            }
                        } catch (e: Exception) {
                            // Ignore exceptions
                        }
                    }
            }
        } catch (e: Exception) {
            // Ignore exceptions
        }

        // Create mappings for each package found
        return packages.map { packageName ->
            PackageSourceMapping(packageName, sourceJarPath)
        }
    }
}