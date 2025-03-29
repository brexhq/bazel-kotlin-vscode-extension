load(":providers.bzl", "KotlinLSPStdLibInfo")

def _stdlib_to_bin_impl(ctx):
    jvm_stdlibs = ctx.toolchains["@io_bazel_rules_kotlin//kotlin/internal:kt_toolchain_type"].jvm_stdlibs

    outputs = []
    output_compile_jar = None
    for java_output in jvm_stdlibs.java_outputs:
        class_jar = java_output.class_jar
        if class_jar.path.endswith("-stdlib.jar"):
            output_compile_jar = ctx.actions.declare_file("kotlin-stdlib.jar")
            ctx.actions.symlink(
                output = output_compile_jar,
                target_file = class_jar,
            )
            outputs.append(output_compile_jar)

    return [
        DefaultInfo(
            files = depset(outputs),
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
