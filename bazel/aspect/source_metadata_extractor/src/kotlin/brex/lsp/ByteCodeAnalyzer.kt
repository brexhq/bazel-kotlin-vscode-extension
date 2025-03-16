package brex.lsp

import kotlinx.metadata.KmClass
import kotlinx.metadata.KmFunction
import kotlinx.metadata.jvm.KotlinClassMetadata
import org.objectweb.asm.AnnotationVisitor
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
    val typeAliases: List<TypeAliasInfo>
)

data class TypeAliasInfo(
    val name: String,
    val expandedType: String,
)


data class MethodInfo(
    val name: String,
    val isExtension: Boolean,  // Specific to extension functions (true/false)
    val receiverType: String? = null, // Only meaningful for extension functions
    val parameters: List<String> = listOf(), // Applies to all methods
    val returnType: String? = null,    // Applies to all methods
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
    private val regularMethods = mutableListOf<MethodInfo>()  // Methods from bytecode
    private val extensionMethods = mutableMapOf<String, MethodInfo>()
    private val typeAliases = mutableListOf<TypeAliasInfo>()
    private var currentClassName = ""
    private var superClassName: String? = null
    private var interfaces = listOf<String>()

    // Kotlin Metadata https://kotlinlang.org/api/core/kotlin-stdlib/kotlin/-metadata/
    private var kind: Int? = null
    private var metadataVersion: IntArray? = null
    private var data1: Array<String>? = null
    private var data2: Array<String>? = null
    private var extraString: String? = null
    private var packageName: String? = null
    private var extraInt: Int? = null

    override fun visit(
        version: Int,
        access: Int,
        name: String,
        signature: String?,
        superName: String?,
        interfaces: Array<String>?,
    ) {

        this.regularMethods.clear()
        this.extensionMethods.clear()
        kind = null
        metadataVersion = null
        data1 = null
        data2 = null
        extraString = null
        packageName = null
        extraInt = null

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
            sourceJars = emptyList(), // Will be filled in later,
            typeAliases = emptyList(),
        )
    }

    override fun visitAnnotation(descriptor: String?, visible: Boolean): AnnotationVisitor? {
        if (descriptor == "Lkotlin/Metadata;") {
            return object : AnnotationVisitor(Opcodes.ASM9) {

                override fun visit(name: String, value: Any) {
                    when (name) {
                        "k" -> kind = value as Int
                        "mv" -> metadataVersion = value as IntArray
                        "xs" -> extraString = value as String
                        "pn" -> packageName = value as String
                    }
                }

                override fun visitArray(name: String?): AnnotationVisitor? {
                    return object : AnnotationVisitor(Opcodes.ASM9) {
                        private val values = mutableListOf<String>()

                        override fun visit(name: String?, value: Any) {
                            if (value is String) {
                                values.add(value)
                            }
                        }

                        override fun visitEnd() {
                            val array = values.toTypedArray()
                            when (name) {
                                "d1" -> data1 = array
                                "d2" -> data2 = array
                            }
                            super.visitEnd()
                        }
                    }
                }
            }
        }
        return super.visitAnnotation(descriptor, visible)
    }

    private fun createMetadataAnnotation(): Metadata? {
        return if (kind != null && data1 != null && data2 != null) {
            Metadata(
                kind = kind!!,
                metadataVersion = metadataVersion ?: intArrayOf(),
                data1 = data1!!,
                data2 = data2!!,
                extraString = extraString ?: "",
                packageName = packageName?: "",
                extraInt = extraInt ?: 0
            )
        } else null
    }

    private fun captureExtensionMethod(func: KmFunction) {
        extensionMethods[func.name] = MethodInfo(
            name = func.name,
            isExtension = true,
            receiverType = func.receiverParameterType?.classifier?.toString(),
            parameters = func.valueParameters.map { it.type.toString() },
            returnType = func.returnType.toString(),
        )
    }


    private fun processKotlinMetadata() {
        val metadata = createMetadataAnnotation()
        if (metadata != null) {
            try {
                // Use the metadata API to process the annotation, we don't need to error out
                // though as this is best effort
                val kotlinMetadata = KotlinClassMetadata.readLenient(metadata)
                when(kotlinMetadata) {
                    is KotlinClassMetadata.Class -> {
                        kotlinMetadata.kmClass.functions.forEach { func ->
                            if(func.receiverParameterType != null) {
                                captureExtensionMethod(func)
                            }
                        }
                        kotlinMetadata.kmClass.typeAliases.forEach { ta ->
                            typeAliases.add(TypeAliasInfo(
                                name = ta.name,
                                expandedType = ta.expandedType.toString(),
                            ))
                        }
                    }
                    is KotlinClassMetadata.FileFacade -> {
                        kotlinMetadata.kmPackage.functions.forEach { func ->
                            if(func.receiverParameterType != null) {
                               captureExtensionMethod(func)
                            }
                        }
                        kotlinMetadata.kmPackage.typeAliases.forEach { ta ->
                            typeAliases.add(TypeAliasInfo(
                                name = ta.name,
                                expandedType = ta.expandedType.toString(),
                            ))
                        }
                    }
                    else -> {}
                }
            } catch (e: Exception) {
                println("Warn (Kotlin LSP): Exception processing Kotlin metadata for $currentClassName: $e")
            }
        }

    }

    override fun visitMethod(
        access: Int,
        name: String,
        descriptor: String,
        signature: String?,
        exceptions: Array<String>?,
    ): MethodVisitor? {
        regularMethods.add(MethodInfo(name, isExtension = false))
        return null
    }

    override fun visitEnd() {
        // process kotlin metadata at the end after collecting all the metadata
        processKotlinMetadata()
        super.visitEnd()
    }

    fun getClassInfo(): ClassInfo? {
        // Start with all regular methods
        val combinedMethods = regularMethods.map { method ->
            // If this method has extension information, replace it
            extensionMethods[method.name] ?: method
        }
        return currentClass?.copy(methods = combinedMethods, typeAliases = typeAliases)
    }
}
