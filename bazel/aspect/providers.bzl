KotlinLSPStdLibInfo = provider(
    doc = "Information about the kotlin stdlib extracted from the kotlin toolchain",
    fields = {
        "compile_jar": "The kotlin-stdlib compile jar",
    },
)

KotlinLspInfo = provider(
    doc = "Contains the information leveraged by Kotlin Language Server for a target.",
    fields = {
        "info": "Provides info regarding classpath entries for direct deps.",
        "transitive_infos": "Provides info regarding classpath entries for transitive deps.",
    },
)
