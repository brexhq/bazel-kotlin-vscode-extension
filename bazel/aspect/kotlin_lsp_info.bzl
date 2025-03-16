load("@io_bazel_rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")

KotlinLspInfo = provider(
    doc = "Contains the information leveraged by Kotlin Language Server for a target.",
    fields = {
        "info": "Provides info regarding classpath entries for direct deps.",
        "transitive_infos": "Provides info regarding classpath entries for transitive deps.",
    },
)

def _get_toolchain_jars(ctx):
    jvm_stdlibs = ctx.toolchains["@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type"].jvm_stdlibs
    compile_jars = [t.compile_jar for t in jvm_stdlibs.java_outputs if t.compile_jar]
    source_jars = [s for s in jvm_stdlibs.source_jars if s]
    return compile_jars, source_jars

def _collect_jars(target, jar_type):
    if jar_type == "compile":
        direct_jars = [t.compile_jar for t in target[JavaInfo].java_outputs if t and t.compile_jar]
        transitive_jars = [t for t in target[JavaInfo].transitive_compile_time_jars.to_list() if t]
        return direct_jars, transitive_jars
    elif jar_type == "source":
        direct_jars = [s for s in target[JavaInfo].source_jars if s]
        transitive_jars = [t for t in target[JavaInfo].transitive_source_jars.to_list() if t]
        return direct_jars, transitive_jars
    else:
        fail("invalid jar type: {}".format(jar_type))

def _generate_source_metadata(ctx, target, compile_jars):
    if ctx.rule.kind != "kt_jvm_library" and ctx.rule.kind != "jvm_import" and ctx.rule.kind != "kt_jvm_proto_library":
        return None

    source_metadata_json = ctx.actions.declare_file("{}-klsp-metadata.json".format(target.label.name))
    ctx.actions.run(
        executable = ctx.executable._source_metadata_extractor,
        inputs = compile_jars,
        arguments = [
            source_metadata_json.path,
        ] + [jar.path for jar in compile_jars],
        outputs = [source_metadata_json],
        progress_message = "Analyzing jars for %s" % target.label,
        mnemonic = "KotlinLSPAnalyzeJars",
    )

    return source_metadata_json

def _filter_transitives_without_srcs(transitive_artifacts):
    return [t for t in transitive_artifacts if not t.path.endswith("klsp-srcs.txt")]

def _kotlin_lsp_aspect_impl(target, ctx):

    all_outputs = []
    direct_metadata_files = []

    # this is a JVM-like target
    if JavaInfo in target:
        direct_compile_jars, transitive_compile_jars = _collect_jars(target, "compile")
        direct_source_jars, transitive_source_jars = _collect_jars(target, "source")

        if KtJvmInfo in target:
            stdlib_compile_jars, stdlib_source_jars = _get_toolchain_jars(ctx)
            transitive_compile_jars += stdlib_compile_jars
            transitive_source_jars += stdlib_source_jars

        # the source files referenced directly by this target
        lsp_srcs_info = None
        if hasattr(ctx.rule.attr, "srcs"):
            srcs = []
            for s in ctx.rule.attr.srcs:
                for f in s.files.to_list():
                    if f.path.endswith(".kt") or f.path.endswith(".java"):
                        srcs.append(f.path)
            lsp_srcs_info = ctx.actions.declare_file("{}-klsp-srcs.txt".format(target.label.name))
            ctx.actions.write(lsp_srcs_info, "\n".join(srcs))

        source_metadata_json = _generate_source_metadata(ctx, target, direct_compile_jars)
        lsp_compile_info = ctx.actions.declare_file("{}-klsp-compile.txt".format(target.label.name))
        lsp_sources_info = ctx.actions.declare_file("{}-klsp-sources.txt".format(target.label.name))

        direct_metadata_files = [lsp_sources_info, lsp_compile_info]
        all_outputs.extend(direct_metadata_files)
        if source_metadata_json:
            direct_metadata_files.append(source_metadata_json)
            all_outputs.append(source_metadata_json)

        if lsp_srcs_info:
            all_outputs.append(lsp_srcs_info)
        
        transitive_infos = depset(direct = direct_metadata_files)
        transitive_dep_artifacts = []

        if hasattr(ctx.rule.attr, "deps"):
            for dep in ctx.rule.attr.deps:
                if KotlinLspInfo in dep:
                    all_transitives = dep[KotlinLspInfo].transitive_infos
                    if type(all_transitives) == "list":
                        all_transitives = depset(all_transitives)
                    transitive_infos = depset(
                        transitive = [dep[KotlinLspInfo].info, transitive_infos, all_transitives],
                    )
                    # Collect artifacts from transitive dependencies
                    transitive_dep_artifacts.extend(dep[KotlinLspInfo].info.to_list())
                    transitive_dep_artifacts.extend(all_transitives.to_list())
                if JavaInfo in dep:
                    s1, s2 = _collect_jars(dep, "source")
                    transitive_source_jars.extend(s1 + s2)
                    j1, j2 = _collect_jars(dep, "compile")
                    transitive_compile_jars.extend(j1 + j2)

        if hasattr(ctx.rule.attr, "exports"):
            for dep in ctx.rule.attr.exports:
                if KotlinLspInfo in dep:
                    all_transitives = dep[KotlinLspInfo].transitive_infos
                    if type(all_transitives) == "list":
                        all_transitives = depset(all_transitives)
                    transitive_infos = depset(
                        transitive = [dep[KotlinLspInfo].info, transitive_infos, all_transitives],
                    )
                    # Collect artifacts from transitive dependencies
                    transitive_dep_artifacts.extend(dep[KotlinLspInfo].info.to_list())
                    transitive_dep_artifacts.extend(all_transitives.to_list())
                if JavaInfo in dep:
                    s1, s2 = _collect_jars(dep, "source")
                    transitive_source_jars.extend(s1 + s2)
                    j1, j2 = _collect_jars(dep, "compile")
                    transitive_compile_jars.extend(j1 + j2)

        # source and output jars for classpath entries
        ctx.actions.write(lsp_sources_info, "\n".join([jar.path for jar in direct_source_jars]))
        ctx.actions.write(lsp_compile_info, "\n".join([jar.path for jar in direct_compile_jars]))

        # source jars are not default outputs, so need to include them explicitly
        all_outputs.extend(direct_source_jars)
        all_outputs.extend(transitive_source_jars)
        all_outputs.extend(_filter_transitives_without_srcs(transitive_dep_artifacts))

        return [
            KotlinLspInfo(
                info = depset(direct_metadata_files),
                transitive_infos = transitive_infos,
            ),
            OutputGroupInfo(
                lsp_infos = depset(direct = all_outputs, transitive = [transitive_infos]),
            ),
        ]

    # if not a Java target, nothing to collect
    return [
        KotlinLspInfo(
            info = depset([]),
            transitive_infos = [],
        ),
    ]

kotlin_lsp_aspect = aspect(
    attr_aspects = ["deps", "exports", "runtime_deps"],
    implementation = _kotlin_lsp_aspect_impl,
    fragments = ["java"],
    provides = [KotlinLspInfo],
    doc = """
    This aspect collects classpath entries for all dependencies of JVM targets as text files (one for sources, another for compile jars) which can be consumed by downstream systems after a build"
    """,
    toolchains = [
        "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
    ],
    attrs = {
        "_source_metadata_extractor": attr.label(
            default = Label("//source_metadata_extractor"),
            executable = True,
            cfg = "exec",
        ),
    },
)
