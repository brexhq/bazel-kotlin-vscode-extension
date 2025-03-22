package brex.lsp

import brex.lsp.proto.KotlinLsp.KotlinLspBazelTargetInfo
import brex.lsp.proto.KotlinLsp.SourceFile
import brex.lsp.proto.KotlinLsp.ClassPathEntry as ClassPathEntryProto
import com.github.ajalt.clikt.core.CliktCommand
import com.github.ajalt.clikt.parameters.options.*
import com.github.ajalt.clikt.parameters.types.boolean
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import com.google.protobuf.util.JsonFormat
import java.io.File


/**
 * ExtractLspInfo extracts information required for the language server for a single bazel
 * target and its dependencies
 */

class ExtractLspInfo : CliktCommand() {
    private val gson = GsonBuilder().create()

    // Define the type for JSON parsing
    private val classPathEntryType = object : TypeToken<List<brex.lsp.ClassPathEntry>>() {}.type

    val bazelTarget by option( "--target", help="The bazel target")
    val sourceFiles by option( "--source-files", help="The direct source files for this target")
        .split(",")

    private val classPathEntries by option("--classpath", help = "JSON array of classpath entries for this target")
        .convert { jsonString ->
            gson.fromJson(jsonString, classPathEntryType) as List<brex.lsp.ClassPathEntry>
        }

    private val bzlModEnabled by option("--bzlmod-enabled", help = "If bzlmod is enabled or not.").boolean().default(false)

    private val outputFile by option("--target-info", help = "The output file containing the target info in proto format")

    override fun run() {

        val classPathEntriesProtos = classPathEntries?.map {
            ClassPathEntryProto.newBuilder()
                .setCompileJar(it.compile_jar ?: "")
                .setSourceJar(it.source_jar ?: "")
                .build()
        }

        val sourceFilesProtos = sourceFiles?.map {
            SourceFile.newBuilder()
                .setPath(it)
                .build()
        }

        val targetInfo = KotlinLspBazelTargetInfo.newBuilder()
            .setBazelTarget(bazelTarget)
            .setBzlmodEnabled(bzlModEnabled)
            .addAllClasspath(classPathEntriesProtos)
            .addAllSourceFiles(sourceFilesProtos)
            .build()


        outputFile?.let {
            File(it).writer().use { writer ->
                writer.write(JsonFormat.printer().print(targetInfo))
            }
        }

    }
}

class LspInfoExtractor {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) = ExtractLspInfo().main(args)
    }
}
