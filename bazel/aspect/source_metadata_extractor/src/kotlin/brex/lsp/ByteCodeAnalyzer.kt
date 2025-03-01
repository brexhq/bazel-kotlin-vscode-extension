package brex.lsp

import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.MethodVisitor
import org.objectweb.asm.Opcodes
import java.util.jar.JarFile

data class Analysis(
    val classes: Map<String, ClassInfo>, // Key is fully qualified class name
)

/**
 * ClassInfo holds the information about a clas
 */
data class ClassInfo(
    val name: String,
    val packageName: String,
    val methods: List<MethodInfo>,
    val superClass: String?,
    val interfaces: List<String>,
    val sourceJars: List<String>,
)

data class MethodInfo(
    val name: String,
)

fun analyzeJars(jarFiles: List<String>): Analysis {
    val classMap = mutableMapOf<String, ClassInfo>()

    for (jarPath in jarFiles) {
        JarFile(jarPath).use { jar ->
            for (entry in jar.entries()) {
                if (!entry.name.endsWith(".class")) continue

                jar.getInputStream(entry).use { input ->
                    try {
                        val reader = ClassReader(input.readBytes())
                        val analyzer = BytecodeAnalyzer()
                        reader.accept(analyzer, 0)

                        // Dedupe class info across all the jars
                        analyzer.getClassInfo()?.let { classInfo ->
                            val fqName = "${classInfo.packageName}.${classInfo.name}"
                            classMap.merge(fqName, classInfo.copy(sourceJars = listOf(jarPath))) { existing, new ->
                                    existing.copy(sourceJars = existing.sourceJars + new.sourceJars)
                            }
                        }
                    } catch (exception: IllegalArgumentException) {
                        println("Warn (Kotlin LSP): Exception analyzing $jarPath")
                    }
                }
            }
        }
    }

    return Analysis(classMap)
}

/**
 * BytecodeAnalyzer analyzes the bytecode in a JAR to extract the information about classes
 * in it.
 */
class BytecodeAnalyzer : ClassVisitor(Opcodes.ASM9) {
    private var currentClass: ClassInfo? = null
    private val methods = mutableListOf<MethodInfo>()
    private var currentClassName = ""
    private var superClassName: String? = null
    private var interfaces = listOf<String>()

    override fun visit(
        version: Int,
        access: Int,
        name: String,
        signature: String?,
        superName: String?,
        interfaces: Array<String>?,
    ) {
        currentClassName = name.replace('/', '.')
        superClassName = superName?.replace('/', '.')
        this.interfaces = interfaces?.map { it.replace('/', '.') } ?: emptyList()

        val packageName = currentClassName.substringBeforeLast('.', "")
        currentClass = ClassInfo(
            name = currentClassName.substringAfterLast('.'),
            packageName = packageName,
            methods = emptyList(),
            superClass = superClassName,
            interfaces = this.interfaces,
            sourceJars = emptyList(), // Will be filled in later
        )
    }

    override fun visitMethod(
        access: Int,
        name: String,
        descriptor: String,
        signature: String?,
        exceptions: Array<String>?,
    ): MethodVisitor? {
        methods.add(MethodInfo(name))
        return null
    }

    fun getClassInfo(): ClassInfo? {
        return currentClass?.copy(methods = methods.toList())
    }
}
