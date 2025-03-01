package brex.lsp

import com.google.gson.Gson
import java.io.File

/**
 * SourceMetadataExtractor analyzes the compiled jars to produce metadata about the classes, functions
 * it contains
 */
class SourceMetadataExtractor {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            if (args.size < 2) {
                throw RuntimeException("ERROR: Need atleast 2 arguments, the output metadata file and one or more jar files")
            }

            val outputMetadataFile = File(args[0])
            val jarFiles = args.drop(1)
            val classInfos = analyzeJars(jarFiles)
            outputMetadataFile.writeText(Gson().toJson(classInfos))
        }
    }
}
