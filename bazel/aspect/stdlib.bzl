load(":providers.bzl", "KotlinLSPStdLibInfo")

def _stdlib_to_bin_impl(ctx):
    jvm_stdlibs = ctx.toolchains["@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type"].jvm_stdlibs

    stdlib_jars = [
        o.class_jar
        for o in jvm_stdlibs.java_outputs
        if "kotlin-stdlib" in o.class_jar.basename and
           o.class_jar.basename.endswith(".jar") and
           not any([v in o.class_jar.basename for v in ("-jdk", "-common", "-sources", "-js")])
    ]

    if not stdlib_jars:
        fail("Could not locate the kotlin-stdlib jar among the toolchain's jvm_stdlibs: {}".format(
            [o.class_jar.basename for o in jvm_stdlibs.java_outputs],
        ))

    output_compile_jar = ctx.actions.declare_file("kotlin-stdlib.jar")
    ctx.actions.symlink(
        output = output_compile_jar,
        target_file = stdlib_jars[0],
    )

    return [
        DefaultInfo(
            files = depset([output_compile_jar]),
        ),
        KotlinLSPStdLibInfo(
            compile_jar = output_compile_jar,
        ),
    ]

stdlib_to_bin = rule(
    implementation = _stdlib_to_bin_impl,
    doc = "Copies the kotlin stdlib jars to the output tree to make it available to the aspect to include it in the classpath",
    toolchains = [
        "@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type",
    ],
)
