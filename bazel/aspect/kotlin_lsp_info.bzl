load("@io_bazel_rules_kotlin//kotlin/internal:defs.bzl", "KtJvmInfo")

KotlinLspInfo = provider(
    doc = "Contains the information leveraged by Kotlin Language Server for a target.",
    fields = {
        "info": "Provides info regarding classpath entries for direct deps.",
        "transitive_infos": "Provides info regarding classpath entries for transitive deps.",
    },
)

_SUPPORTED_RULE_KINDS = [
    "kt_jvm_library",
    "java_library",
    "java_proto_library",
    "java_grpc_library",
    "kt_jvm_proto_library",
    "kt_jvm_grpc_library",
    "jvm_import",
]

def _get_toolchain_info(ctx):
    jvm_stdlibs = ctx.toolchains["@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type"].jvm_stdlibs
    compile_jars = [t.compile_jar for t in jvm_stdlibs.java_outputs if t.compile_jar]
    source_jars = [s for s in jvm_stdlibs.source_jars if s]
    return struct(
        compile_jars = compile_jars,
        source_jars = source_jars,
    )

def _collect_target_info(ctx, target):
    classpath_entries = []
    direct_compile_jars = []
    direct_source_jars = []
    for java_output in target[JavaInfo].java_outputs:
        classpath_entries.append(struct(
            compile_jar = java_output.class_jar.path,
            source_jar = java_output.source_jars.to_list()[0].path if java_output.source_jars else None,
        ))
        direct_compile_jars.append(java_output.class_jar)
        if java_output.source_jars:
            direct_source_jars.append(java_output.source_jars.to_list()[0])

    transitive_compile_jars = [t for t in target[JavaInfo].transitive_compile_time_jars.to_list() if t]
    transitive_source_jars = [t for t in target[JavaInfo].transitive_source_jars.to_list() if t]
    if ctx.rule.kind == "java_proto_library":
        transitive_proto_compile_jars = target[JavaInfo].transitive_compile_time_jars.to_list()
        transitive_proto_source_jars = target[JavaInfo].transitive_source_jars.to_list()

        for jar in transitive_proto_compile_jars:
            classpath_entries.append(struct(
                compile_jar = jar.path,
                source_jar = None,
            ))
        for jar in transitive_proto_source_jars:
            classpath_entries.append(struct(
                compile_jar = None,
                source_jar = jar.path,
            ))

        direct_compile_jars += transitive_proto_compile_jars
        direct_source_jars += transitive_proto_source_jars
        transitive_compile_jars += transitive_proto_compile_jars
        transitive_source_jars += transitive_proto_source_jars

    srcs = []
    if hasattr(ctx.rule.attr, "srcs"):
        for s in ctx.rule.attr.srcs:
            for f in s.files.to_list():
                if f.path.endswith(".kt") or f.path.endswith(".java"):
                    srcs.append(f.path)
    return struct(
        direct_compile_jars = direct_compile_jars,
        transitive_compile_jars = transitive_compile_jars,
        direct_source_jars = direct_source_jars,
        transitive_source_jars = transitive_source_jars,
        source_files = srcs,
        classpath_entries = classpath_entries,
    )

def _generate_lsp_info(ctx, target, target_info):
    if ctx.rule.kind not in _SUPPORTED_RULE_KINDS:
        return None

    target_info_file = ctx.actions.declare_file("{}-kotlin-lsp.json".format(target.label.name))
    args = ctx.actions.args()
    args.add("--target", str(target.label))
    args.add("--source-files", ",".join(target_info.source_files))
    args.add("--classpath", json.encode(target_info.classpath_entries))
    args.add("--target-info", target_info_file.path)
    args.add("--kind", ctx.rule.kind)

    inputs = []
    if target_info.direct_compile_jars:
        args.add("--class-jars", ",".join([p.path for p in target_info.direct_compile_jars]))
        inputs.extend(target_info.direct_compile_jars)
        inputs.extend(target_info.direct_source_jars)

    ctx.actions.run(
        executable = ctx.executable._lsp_info_extractor,
        inputs = inputs,
        arguments = [args],
        outputs = [target_info_file],
        mnemonic = "KotlinLspInfo",
    )

    return target_info_file

def _kotlin_lsp_aspect_impl(target, ctx):
    all_outputs = []
    direct_infos = []

    # this is a JVM-like target
    target_lsp_info = None
    if JavaInfo in target:
        target_info = _collect_target_info(ctx, target)
        target_lsp_info = _generate_lsp_info(ctx, target, target_info)

        if target_lsp_info:
            all_outputs.append(target_lsp_info)
            direct_infos.append(target_lsp_info)

        all_outputs.extend(target_info.direct_compile_jars)
        all_outputs.extend(target_info.transitive_compile_jars)
        all_outputs.extend(target_info.transitive_source_jars)
        all_outputs.extend(target_info.direct_source_jars)

        toolchain_info = None
        if KtJvmInfo in target:
            toolchain_info = _get_toolchain_info(ctx)

        transitive_infos = depset(direct = [])
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

        if hasattr(ctx.rule.attr, "exports"):
            for dep in ctx.rule.attr.exports:
                if KotlinLspInfo in dep:
                    all_transitives = dep[KotlinLspInfo].transitive_infos
                    if type(all_transitives) == "list":
                        all_transitives = depset(all_transitives)
                    transitive_infos = depset(
                        transitive = [dep[KotlinLspInfo].info, transitive_infos, all_transitives],
                    )

                    transitive_dep_artifacts.extend(dep[KotlinLspInfo].info.to_list())
                    transitive_dep_artifacts.extend(all_transitives.to_list())

        return [
            KotlinLspInfo(
                info = depset(direct_infos),
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
    This aspect collects classpath entries for all dependencies of JVM targets as a proto json file which can be consumed by downstream systems like a language server after a build"
    """,
    toolchains = [
        "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
    ],
    attrs = {
        "_lsp_info_extractor": attr.label(
            default = Label("//lsp_info_extractor"),
            executable = True,
            cfg = "exec",
        ),
    },
)
