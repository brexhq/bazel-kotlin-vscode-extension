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
        jars = [t.compile_jar for t in target[JavaInfo].java_outputs if t and t.compile_jar]
        jars += [t for t in target[JavaInfo].transitive_compile_time_jars.to_list() if t]
        return jars
    elif jar_type == "source":
        jars = [s for s in target[JavaInfo].source_jars if s]
        jars += [t for t in target[JavaInfo].transitive_source_jars.to_list() if t]
        return jars
    else:
        fail("invalid jar type: {}".format(jar_type))

def _is_maven_shim(target):
    return "_maven_shim_DO_NOT_DEPEND" in target.label.name

def _generate_source_metadata(ctx, target, compile_jars):
    if ctx.rule.kind != "kt_jvm_library":
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
    )

    return source_metadata_json

def _kotlin_lsp_aspect_impl(target, ctx):
    compile_jars = []
    source_jars = []

    # this is a JVM-like target
    # and also not a "maven shim" we use for edge support
    # including that leads to bazel complaining about conflicting outputs
    if JavaInfo in target and not _is_maven_shim(target):
        compile_jars = _collect_jars(target, "compile")
        source_jars = _collect_jars(target, "source")

        if KtJvmInfo in target:
            stdlib_compile_jars, stdlib_source_jars = _get_toolchain_jars(ctx)
            compile_jars += stdlib_compile_jars
            source_jars += stdlib_source_jars

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

        source_metadata_json = _generate_source_metadata(ctx, target, compile_jars)
        lsp_compile_info = ctx.actions.declare_file("{}-klsp-compile.txt".format(target.label.name))
        lsp_sources_info = ctx.actions.declare_file("{}-klsp-sources.txt".format(target.label.name))

        outputs = [lsp_sources_info, lsp_compile_info]
        if source_metadata_json:
            outputs.append(source_metadata_json)
        if lsp_srcs_info:
            outputs.append(lsp_srcs_info)
        transitive_infos = depset(direct = outputs)

        if hasattr(ctx.rule.attr, "deps"):
            for dep in ctx.rule.attr.deps:
                if KotlinLspInfo in dep:
                    transitive_infos = depset(transitive = [dep[KotlinLspInfo].info, transitive_infos])
                elif JavaInfo in dep:
                    source_jars += _collect_jars(dep, "source")
                    compile_jars += _collect_jars(dep, "compile")

        # source and output jars for classpath entries
        ctx.actions.write(lsp_sources_info, "\n".join([jar.path for jar in source_jars]))
        ctx.actions.write(lsp_compile_info, "\n".join([jar.path for jar in compile_jars]))

        # source jars are not default outputs, so need to include them explicitly
        outputs.extend(source_jars)

        return [
            KotlinLspInfo(
                info = depset(outputs),
                transitive_infos = transitive_infos,
            ),
            OutputGroupInfo(
                lsp_infos = depset(direct = outputs),
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
    attr_aspects = ["deps"],
    implementation = _kotlin_lsp_aspect_impl,
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
